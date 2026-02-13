
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  template_id TEXT
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_logs_select" ON public.email_logs
  FOR SELECT USING (is_authenticated_agent());

CREATE POLICY "email_logs_insert" ON public.email_logs
  FOR INSERT WITH CHECK (is_authenticated_agent());

-- Also allow service role inserts from edge functions (no RLS bypass needed, service role bypasses RLS)

CREATE INDEX idx_email_logs_created_at ON public.email_logs (created_at DESC);
CREATE INDEX idx_email_logs_ticket_id ON public.email_logs (ticket_id);
