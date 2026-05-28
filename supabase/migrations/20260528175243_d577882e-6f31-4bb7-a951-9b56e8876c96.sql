-- Fase 5B: Internal notifications, mentions, and operational deadlines.
-- 100% additive. Does not touch existing agent_notifications table.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticket_id uuid NULL,
  inbound_email_event_id uuid NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NULL,
  priority text NOT NULL DEFAULT 'normal',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz NULL,
  due_at timestamptz NULL,
  source text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipient (agent/supervisor) can read own notifications
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_authenticated_agent());

-- Supervisor can read all (for team coordination)
CREATE POLICY notifications_select_supervisor ON public.notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

-- Recipient can update own (mark as read)
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_authenticated_agent());

-- No INSERT/DELETE policy => only service_role (triggers + edge functions) can write.
-- Portal clients have no role match => RLS denies access entirely.

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_ticket_id
  ON public.notifications(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_due_at
  ON public.notifications(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications(created_at DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =========================================================================
-- HELPER: idempotent notification creator
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id uuid,
  _type text,
  _title text,
  _message text DEFAULT NULL,
  _ticket_id uuid DEFAULT NULL,
  _inbound_email_event_id uuid DEFAULT NULL,
  _priority text DEFAULT 'normal',
  _due_at timestamptz DEFAULT NULL,
  _source text DEFAULT 'trigger',
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_new_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  -- Idempotency: skip if an unread notification of same (user, type, ticket/event) already exists
  SELECT id INTO v_existing
  FROM public.notifications
  WHERE user_id = _user_id
    AND type = _type
    AND is_read = false
    AND (
      (_ticket_id IS NOT NULL AND ticket_id = _ticket_id)
      OR (_inbound_email_event_id IS NOT NULL AND inbound_email_event_id = _inbound_email_event_id)
      OR (_ticket_id IS NULL AND _inbound_email_event_id IS NULL)
    )
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.notifications SET updated_at = now() WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.notifications (
    user_id, ticket_id, inbound_email_event_id, type, title, message,
    priority, due_at, source, metadata
  ) VALUES (
    _user_id, _ticket_id, _inbound_email_event_id, _type, _title, _message,
    COALESCE(_priority, 'normal'), _due_at, _source, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Notify all supervisors (helper)
CREATE OR REPLACE FUNCTION public.notify_supervisors(
  _type text, _title text, _message text DEFAULT NULL,
  _ticket_id uuid DEFAULT NULL, _inbound_email_event_id uuid DEFAULT NULL,
  _priority text DEFAULT 'high', _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'supervisor' AND COALESCE(p.is_active, true) = true
  LOOP
    PERFORM public.create_notification(r.user_id, _type, _title, _message, _ticket_id, _inbound_email_event_id, _priority, NULL, 'trigger', _metadata);
  END LOOP;
END;
$$;

-- =========================================================================
-- TRIGGER: ticket assignment (insert + update)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_ticket_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- New assignee on update
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.assigned_to, 'ticket_assigned',
      'Ticket atribuído: #' || NEW.ticket_number,
      COALESCE(NEW.subject, ''), NEW.id, NULL, 'normal', NULL, 'trigger', '{}'::jsonb
    );
  END IF;

  -- Brand-new ticket
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM public.create_notification(
        NEW.assigned_to, 'ticket_assigned',
        'Ticket atribuído: #' || NEW.ticket_number,
        COALESCE(NEW.subject, ''), NEW.id, NULL, 'normal', NULL, 'trigger', '{}'::jsonb
      );
    ELSE
      PERFORM public.notify_supervisors(
        'ticket_without_owner',
        'Ticket sem responsável: #' || NEW.ticket_number,
        COALESCE(NEW.subject, ''), NEW.id, NULL, 'high', '{}'::jsonb
      );
    END IF;

    -- Continuation
    IF NEW.parent_ticket_id IS NOT NULL THEN
      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public.create_notification(
          NEW.assigned_to, 'ticket_continuation_created',
          'Ticket de continuação: #' || NEW.ticket_number,
          'Caso voltou após resolução do ticket anterior.', NEW.id, NULL, 'high', NULL, 'trigger',
          jsonb_build_object('parent_ticket_id', NEW.parent_ticket_id)
        );
      ELSE
        PERFORM public.notify_supervisors(
          'ticket_continuation_created',
          'Ticket de continuação: #' || NEW.ticket_number,
          'Caso voltou após resolução do ticket anterior.', NEW.id, NULL, 'high',
          jsonb_build_object('parent_ticket_id', NEW.parent_ticket_id)
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_assignment ON public.tickets;
CREATE TRIGGER trg_notify_ticket_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_assignment();

-- Separate trigger to also catch INSERT (since UPDATE OF won't catch insert with non-null)
-- The trigger above covers both since it's AFTER INSERT OR UPDATE OF assigned_to.
-- Postgres allows mixing INSERT with UPDATE OF; INSERT fires regardless.

-- =========================================================================
-- TRIGGER: client message → notify assignee or supervisors
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_client_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_assigned uuid;
  v_number integer;
  v_subject text;
BEGIN
  IF NEW.sender_type <> 'client' THEN RETURN NEW; END IF;

  SELECT assigned_to, ticket_number, subject INTO v_assigned, v_number, v_subject
  FROM public.tickets WHERE id = NEW.ticket_id;

  IF v_assigned IS NOT NULL THEN
    PERFORM public.create_notification(
      v_assigned, 'ticket_reply_received',
      'Cliente respondeu: #' || v_number,
      COALESCE(v_subject, ''), NEW.ticket_id, NULL, 'high', NULL, 'trigger', '{}'::jsonb
    );
  ELSE
    PERFORM public.notify_supervisors(
      'ticket_customer_waiting',
      'Cliente aguarda resposta: #' || v_number,
      COALESCE(v_subject, ''), NEW.ticket_id, NULL, 'high', '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_client_message ON public.ticket_messages;
CREATE TRIGGER trg_notify_client_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_message();

-- =========================================================================
-- TRIGGER: inbound_email_events status → notify supervisors
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_inbound_event_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text;
  v_title text;
  v_prio text := 'high';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pending_review' THEN
    v_type := 'pending_email_review'; v_title := 'E-mail pendente de revisão';
  ELSIF NEW.status = 'quarantined' THEN
    v_type := 'email_quarantined'; v_title := 'E-mail em quarentena'; v_prio := 'high';
  ELSIF NEW.status = 'failed' THEN
    v_type := 'email_failed'; v_title := 'Falha no processamento de e-mail'; v_prio := 'urgent';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.notify_supervisors(
    v_type, v_title,
    'De: ' || COALESCE(NEW.from_address, '') || ' — ' || COALESCE(NEW.subject, '(sem assunto)'),
    NULL, NEW.id, v_prio, '{}'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_inbound_event_status ON public.inbound_email_events;
CREATE TRIGGER trg_notify_inbound_event_status
  AFTER INSERT OR UPDATE OF status ON public.inbound_email_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_inbound_event_status();

-- =========================================================================
-- TRIGGER: internal note mentions (@name) → notify mentioned user
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_internal_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match text;
  v_user_id uuid;
  v_number integer;
  v_matches text[];
BEGIN
  IF NEW.event_type <> 'note' OR NEW.content IS NULL THEN RETURN NEW; END IF;

  -- Extract @tokens (alphanumeric/accented, 2+ chars)
  SELECT array_agg(DISTINCT lower(m[1]))
  INTO v_matches
  FROM regexp_matches(NEW.content, '@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_\-]{1,})', 'g') AS m;

  IF v_matches IS NULL THEN RETURN NEW; END IF;

  SELECT ticket_number INTO v_number FROM public.tickets WHERE id = NEW.ticket_id;

  FOREACH v_match IN ARRAY v_matches LOOP
    SELECT p.id INTO v_user_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE COALESCE(p.is_active, true) = true
      AND (
        lower(split_part(p.full_name, ' ', 1)) = v_match
        OR lower(p.full_name) = v_match
        OR lower(replace(p.full_name, ' ', '')) = v_match
      )
    LIMIT 1;

    IF v_user_id IS NOT NULL AND v_user_id <> COALESCE(NEW.user_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.create_notification(
        v_user_id, 'ticket_internal_mention',
        'Mencionado em #' || v_number,
        left(NEW.content, 200), NEW.ticket_id, NULL, 'high', NULL, 'trigger',
        jsonb_build_object('event_id', NEW.id)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_internal_mentions ON public.ticket_events;
CREATE TRIGGER trg_notify_internal_mentions
  AFTER INSERT ON public.ticket_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_internal_mentions();