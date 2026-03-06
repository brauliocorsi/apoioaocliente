
CREATE TABLE public.ticket_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_documents_select" ON public.ticket_documents
  FOR SELECT TO authenticated
  USING (is_authenticated_agent());

CREATE POLICY "ticket_documents_insert" ON public.ticket_documents
  FOR INSERT TO authenticated
  WITH CHECK (is_authenticated_agent());

CREATE POLICY "ticket_documents_delete" ON public.ticket_documents
  FOR DELETE TO authenticated
  USING (is_authenticated_agent());
