
-- Create storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-attachments', 'ticket-attachments', true);

-- Storage policies
CREATE POLICY "Authenticated agents can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-attachments' AND public.is_authenticated_agent());

CREATE POLICY "Authenticated agents can view attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-attachments' AND public.is_authenticated_agent());

CREATE POLICY "Authenticated agents can delete own attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'ticket-attachments' AND public.is_authenticated_agent());

-- Create ticket_attachments table
CREATE TABLE public.ticket_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_attachments_select" ON public.ticket_attachments
FOR SELECT USING (public.is_authenticated_agent());

CREATE POLICY "ticket_attachments_insert" ON public.ticket_attachments
FOR INSERT WITH CHECK (public.is_authenticated_agent());

CREATE POLICY "ticket_attachments_delete" ON public.ticket_attachments
FOR DELETE USING (public.is_authenticated_agent());
