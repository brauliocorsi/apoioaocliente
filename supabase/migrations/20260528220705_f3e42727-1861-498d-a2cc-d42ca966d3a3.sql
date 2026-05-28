
-- ============================================================
-- Fase 5C — Notificações ao cliente (aditivo, retrocompatível)
-- ============================================================

-- 1) Tabela client_notifications
CREATE TABLE IF NOT EXISTS public.client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NULL,
  ticket_id uuid NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz NULL,
  email_sent boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz NULL,
  email_error text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notifications_client_unread
  ON public.client_notifications(client_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_notifications_ticket_id
  ON public.client_notifications(ticket_id);
CREATE INDEX IF NOT EXISTS idx_client_notifications_type
  ON public.client_notifications(type);
CREATE INDEX IF NOT EXISTS idx_client_notifications_email_pending
  ON public.client_notifications(email_sent, created_at) WHERE email_sent = false;

-- 2) GRANTS
GRANT SELECT, UPDATE ON public.client_notifications TO authenticated;
GRANT ALL ON public.client_notifications TO service_role;

-- 3) RLS
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_notifications_select_own ON public.client_notifications;
CREATE POLICY client_notifications_select_own
  ON public.client_notifications FOR SELECT TO authenticated
  USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS client_notifications_update_own ON public.client_notifications;
CREATE POLICY client_notifications_update_own
  ON public.client_notifications FOR UPDATE TO authenticated
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

DROP POLICY IF EXISTS client_notifications_select_agents ON public.client_notifications;
CREATE POLICY client_notifications_select_agents
  ON public.client_notifications FOR SELECT TO authenticated
  USING (public.is_authenticated_agent());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_client_notifications_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_client_notifications_updated_at ON public.client_notifications;
CREATE TRIGGER trg_client_notifications_updated_at
  BEFORE UPDATE ON public.client_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_client_notifications_updated_at();

-- 4) Helper: criar notificação ao cliente de forma idempotente
CREATE OR REPLACE FUNCTION public.create_client_notification(
  _client_user_id uuid,
  _ticket_id uuid,
  _type text,
  _title text,
  _message text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _dedupe_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF _client_user_id IS NULL AND _ticket_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotência: se já existe notificação não-lida com mesma dedupe_key, ignorar
  IF _dedupe_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.client_notifications
    WHERE COALESCE(client_user_id::text, '') = COALESCE(_client_user_id::text, '')
      AND COALESCE(ticket_id::text, '') = COALESCE(_ticket_id::text, '')
      AND type = _type
      AND metadata->>'dedupe_key' = _dedupe_key
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.client_notifications(
    client_user_id, ticket_id, type, title, message, metadata
  ) VALUES (
    _client_user_id, _ticket_id, _type, _title, _message,
    COALESCE(_metadata, '{}'::jsonb)
      || CASE WHEN _dedupe_key IS NOT NULL
              THEN jsonb_build_object('dedupe_key', _dedupe_key)
              ELSE '{}'::jsonb END
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- 5) Trigger: agente envia mensagem pública → notifica cliente
CREATE OR REPLACE FUNCTION public.notify_client_on_agent_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket record;
  v_excerpt text;
  v_notif_id uuid;
BEGIN
  IF NEW.sender_type <> 'agent' THEN
    RETURN NEW;
  END IF;

  SELECT t.id, t.ticket_number, t.subject, t.client_user_id, t.client_email, t.client_name
  INTO v_ticket
  FROM public.tickets t WHERE t.id = NEW.ticket_id;

  IF v_ticket.id IS NULL THEN RETURN NEW; END IF;

  v_excerpt := left(regexp_replace(COALESCE(NEW.content, ''), '\s+', ' ', 'g'), 240);

  v_notif_id := public.create_client_notification(
    v_ticket.client_user_id,
    v_ticket.id,
    'ticket_agent_replied',
    'Nova resposta ao seu ticket #' || v_ticket.ticket_number,
    v_excerpt,
    jsonb_build_object(
      'ticket_number', v_ticket.ticket_number,
      'message_id', NEW.id,
      'client_email', v_ticket.client_email,
      'client_name', v_ticket.client_name
    ),
    'msg:' || NEW.id::text
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_client_on_agent_message ON public.ticket_messages;
CREATE TRIGGER trg_notify_client_on_agent_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_agent_message();

-- 6) Trigger: status muda para resolvido/fechado → notifica cliente
CREATE OR REPLACE FUNCTION public.notify_client_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_resolved boolean := false;
  v_new_closed boolean := false;
  v_old_resolved boolean := false;
  v_old_closed boolean := false;
  v_title text;
  v_type text;
  v_message text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  SELECT COALESCE(is_resolved,false), COALESCE(is_closed,false)
  INTO v_new_resolved, v_new_closed
  FROM public.ticket_statuses WHERE id = NEW.status;

  SELECT COALESCE(is_resolved,false), COALESCE(is_closed,false)
  INTO v_old_resolved, v_old_closed
  FROM public.ticket_statuses WHERE id = OLD.status;

  IF v_new_resolved AND NOT v_old_resolved THEN
    v_type := 'ticket_resolved';
    v_title := 'O seu ticket #' || NEW.ticket_number || ' foi resolvido';
    v_message := 'Marcámos o seu ticket como resolvido. Se ainda precisar de ajuda, responda por aqui.';
  ELSIF v_new_closed AND NOT v_old_closed THEN
    v_type := 'ticket_closed';
    v_title := 'O seu ticket #' || NEW.ticket_number || ' foi fechado';
    v_message := 'O seu ticket foi fechado. Se precisar, abra uma nova mensagem no portal.';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.create_client_notification(
    NEW.client_user_id,
    NEW.id,
    v_type,
    v_title,
    v_message,
    jsonb_build_object(
      'ticket_number', NEW.ticket_number,
      'client_email', NEW.client_email,
      'client_name', NEW.client_name,
      'new_status', NEW.status
    ),
    'status:' || NEW.id::text || ':' || v_type
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_client_on_status_change ON public.tickets;
CREATE TRIGGER trg_notify_client_on_status_change
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_status_change();

-- 7) Dispatcher de e-mail via pg_net: chama edge function quando nova notif criada
CREATE OR REPLACE FUNCTION public.dispatch_client_notification_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
  v_email text;
BEGIN
  -- Só tenta enviar e-mail se houver destinatário válido
  v_email := COALESCE(NEW.metadata->>'client_email', '');
  IF v_email = '' OR v_email IS NULL THEN
    -- tenta resolver via client_users
    IF NEW.client_user_id IS NOT NULL THEN
      SELECT email INTO v_email FROM public.client_users WHERE id = NEW.client_user_id;
    END IF;
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  -- Bloquear endereços automáticos
  IF v_email ~* '^(noreply|no-reply|mailer-daemon|postmaster|donotreply)@' THEN
    RETURN NEW;
  END IF;

  v_url := 'https://ijxxjtiqitlyazwdqgwv.supabase.co/functions/v1/send-client-notification';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- nunca quebrar a ação principal
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dispatch_client_notification_email ON public.client_notifications;
CREATE TRIGGER trg_dispatch_client_notification_email
  AFTER INSERT ON public.client_notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_client_notification_email();
