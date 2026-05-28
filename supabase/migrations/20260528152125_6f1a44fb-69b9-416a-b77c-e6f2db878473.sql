-- Tabela de registo de e-mails recebidos
CREATE TABLE IF NOT EXISTS public.inbound_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  message_id text,
  email_fingerprint text,
  from_address text NOT NULL,
  from_name text,
  subject text,
  body_preview text,
  received_at timestamptz NOT NULL DEFAULT now(),

  spam_score integer NOT NULL DEFAULT 0,
  spam_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,

  routing_action text,
  routing_reason text,

  status text NOT NULL DEFAULT 'received',
  -- received, processed, pending_review, quarantined, spam, failed, duplicate

  routed_ticket_id uuid NULL,
  parent_ticket_id uuid NULL,
  pending_email_id uuid NULL,

  error_message text,
  processed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_message_id
  ON public.inbound_email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_fingerprint
  ON public.inbound_email_events(email_fingerprint);
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_from_address
  ON public.inbound_email_events(lower(from_address));
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_status
  ON public.inbound_email_events(status);
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_received_at
  ON public.inbound_email_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_routed_ticket_id
  ON public.inbound_email_events(routed_ticket_id);

-- Trigger updated_at
CREATE TRIGGER trg_inbound_email_events_updated_at
  BEFORE UPDATE ON public.inbound_email_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Grants (apenas pessoal interno; clientes nunca acedem)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_email_events TO authenticated;
GRANT ALL ON public.inbound_email_events TO service_role;

-- RLS
ALTER TABLE public.inbound_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbound_email_events_select
  ON public.inbound_email_events
  FOR SELECT TO authenticated
  USING (public.is_authenticated_agent());

CREATE POLICY inbound_email_events_insert
  ON public.inbound_email_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_agent());

CREATE POLICY inbound_email_events_update
  ON public.inbound_email_events
  FOR UPDATE TO authenticated
  USING (public.is_authenticated_agent());

CREATE POLICY inbound_email_events_delete
  ON public.inbound_email_events
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role));
