ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS parent_ticket_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_parent_ticket_id ON public.tickets(parent_ticket_id);