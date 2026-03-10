CREATE POLICY "client_users_delete_supervisor"
ON public.client_users
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'supervisor'::app_role));