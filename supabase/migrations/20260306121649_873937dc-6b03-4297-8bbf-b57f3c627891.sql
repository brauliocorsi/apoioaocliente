
CREATE POLICY "ticket_documents_select_clients" ON public.ticket_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_documents.ticket_id
        AND t.client_user_id = auth.uid()
    )
  );
