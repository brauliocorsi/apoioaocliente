ALTER TABLE public.inbound_email_events
  ADD COLUMN IF NOT EXISTS action_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_inbound_email_events_status
  ON public.inbound_email_events(status);

CREATE INDEX IF NOT EXISTS idx_inbound_email_events_received_at
  ON public.inbound_email_events(received_at DESC);