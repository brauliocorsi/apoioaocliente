ALTER TABLE public.inbound_email_events
ADD COLUMN IF NOT EXISTS processing_locked_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS processing_locked_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_email_events_processing_lock
ON public.inbound_email_events (processing_locked_at)
WHERE processing_locked_at IS NOT NULL;