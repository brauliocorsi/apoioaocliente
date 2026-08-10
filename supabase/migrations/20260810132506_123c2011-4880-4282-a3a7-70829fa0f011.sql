ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_email_logs_provider_message_id
  ON public.email_logs (provider_message_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_ticket_created
  ON public.email_logs (ticket_id, created_at DESC);

ALTER TABLE public.email_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;