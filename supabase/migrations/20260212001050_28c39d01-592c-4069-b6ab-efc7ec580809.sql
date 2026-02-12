-- Allow clients to insert attachments on their own tickets
CREATE POLICY "ticket_attachments_insert_clients"
ON public.ticket_attachments
FOR INSERT
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM tickets t WHERE t.id = ticket_attachments.ticket_id AND t.client_user_id = auth.uid()
  )
);

-- Allow clients to view attachments on their own tickets
CREATE POLICY "ticket_attachments_select_clients"
ON public.ticket_attachments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tickets t WHERE t.id = ticket_attachments.ticket_id AND t.client_user_id = auth.uid()
  )
);

-- Allow clients to upload to storage bucket
CREATE POLICY "clients_upload_ticket_attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND auth.uid() IS NOT NULL
);

-- Allow clients to read from storage bucket
CREATE POLICY "clients_read_ticket_attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'ticket-attachments'
  AND auth.uid() IS NOT NULL
);