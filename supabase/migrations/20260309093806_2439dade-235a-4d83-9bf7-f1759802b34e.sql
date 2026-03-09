
-- Create email_threads table
CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  last_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index on email_address for fast lookups
CREATE INDEX idx_email_threads_email_address ON public.email_threads(email_address);
CREATE INDEX idx_email_threads_ticket_id ON public.email_threads(ticket_id);

-- Enable RLS
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

-- RLS policies: agents can read/write
CREATE POLICY "email_threads_select" ON public.email_threads FOR SELECT USING (is_authenticated_agent());
CREATE POLICY "email_threads_insert" ON public.email_threads FOR INSERT WITH CHECK (is_authenticated_agent());
CREATE POLICY "email_threads_update" ON public.email_threads FOR UPDATE USING (is_authenticated_agent());
CREATE POLICY "email_threads_delete" ON public.email_threads FOR DELETE USING (is_authenticated_agent());

-- Also allow service role (edge functions) to bypass RLS via service_role key
