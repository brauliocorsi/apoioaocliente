-- Allow supervisors to update any agent's profile (for agent_color changes)
CREATE POLICY "profiles_update_supervisor"
ON public.profiles
FOR UPDATE
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
);