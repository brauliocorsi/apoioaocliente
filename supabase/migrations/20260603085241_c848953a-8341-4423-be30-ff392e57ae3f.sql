
-- 1. Restrict decision_rules SELECT to authenticated agents
DROP POLICY IF EXISTS rules_select ON public.decision_rules;
CREATE POLICY rules_select ON public.decision_rules
  FOR SELECT TO authenticated
  USING (public.is_authenticated_agent());

-- 2. Restrict email_templates SELECT to authenticated agents
DROP POLICY IF EXISTS email_templates_select ON public.email_templates;
CREATE POLICY email_templates_select ON public.email_templates
  FOR SELECT TO authenticated
  USING (public.is_authenticated_agent());

-- 3. Restrict email-assets upload to supervisors
DROP POLICY IF EXISTS "Supervisors can upload email assets" ON storage.objects;
CREATE POLICY "Supervisors can upload email assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-assets' AND public.has_role(auth.uid(), 'supervisor'::public.app_role));

-- 4. Remove broad listing SELECT on email-assets (public bucket: files still served via public URL)
DROP POLICY IF EXISTS "Email assets are publicly accessible" ON storage.objects;

-- 5. Tighten ticket-attachments storage policies to verify ticket ownership (path = {ticket_id}/filename)
DROP POLICY IF EXISTS clients_read_ticket_attachments ON storage.objects;
CREATE POLICY clients_read_ticket_attachments
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
        AND t.client_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS clients_upload_ticket_attachments ON storage.objects;
CREATE POLICY clients_upload_ticket_attachments
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
        AND t.client_user_id = auth.uid()
    )
  );

-- 6. Fix mutable search_path on SLA helper functions
ALTER FUNCTION public.sla_default_first_response_hours(text) SET search_path = public;
ALTER FUNCTION public.sla_default_resolution_hours(text) SET search_path = public;

-- 7. Restrict realtime.messages (broadcast/presence) to authenticated agents only.
--    The app uses postgres_changes (governed by source-table RLS), so this does not break client realtime flows.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents only realtime messages select" ON realtime.messages;
DROP POLICY IF EXISTS "Agents only realtime messages insert" ON realtime.messages;
CREATE POLICY "Agents only realtime messages select"
  ON realtime.messages FOR SELECT TO authenticated
  USING (public.is_authenticated_agent());
CREATE POLICY "Agents only realtime messages insert"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_agent());
