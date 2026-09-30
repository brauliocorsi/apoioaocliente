CREATE TABLE public.user_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id uuid NOT NULL,
  deleted_user_email text,
  deleted_user_name text,
  account_type text NOT NULL,
  deleted_by uuid,
  deleted_by_name text,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_deletion_audit TO authenticated;
GRANT ALL ON public.user_deletion_audit TO service_role;
ALTER TABLE public.user_deletion_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supervisors read deletion audit" ON public.user_deletion_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'supervisor'));