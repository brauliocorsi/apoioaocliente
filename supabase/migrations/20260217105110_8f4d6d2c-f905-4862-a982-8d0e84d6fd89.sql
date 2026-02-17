
-- Table for supervisor approval requests on resolutions
CREATE TABLE public.resolution_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  supervisor_id uuid NOT NULL,
  proposed_type text NOT NULL, -- 'resolved' or 'cancelled'
  proposed_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  supervisor_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.resolution_approvals ENABLE ROW LEVEL SECURITY;

-- Agents can view approvals for tickets they can see
CREATE POLICY "approvals_select_agents" ON public.resolution_approvals
  FOR SELECT TO authenticated
  USING (is_authenticated_agent());

-- Agents can create approval requests
CREATE POLICY "approvals_insert_agents" ON public.resolution_approvals
  FOR INSERT TO authenticated
  WITH CHECK (is_authenticated_agent() AND requested_by = auth.uid());

-- Supervisors can update (approve/reject)
CREATE POLICY "approvals_update_supervisors" ON public.resolution_approvals
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Agents can delete their own pending requests
CREATE POLICY "approvals_delete_own" ON public.resolution_approvals
  FOR DELETE TO authenticated
  USING (is_authenticated_agent() AND requested_by = auth.uid() AND status = 'pending');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.resolution_approvals;
