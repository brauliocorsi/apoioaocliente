ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS order_lookup_status text NULL,
  ADD COLUMN IF NOT EXISTS order_lookup_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS order_lookup_error text NULL,
  ADD COLUMN IF NOT EXISTS order_snapshot jsonb NULL;

ALTER TABLE public.inbound_email_events
  ADD COLUMN IF NOT EXISTS extracted_order_number text NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_order_number_lookup
  ON public.tickets (order_number)
  WHERE order_number IS NOT NULL;