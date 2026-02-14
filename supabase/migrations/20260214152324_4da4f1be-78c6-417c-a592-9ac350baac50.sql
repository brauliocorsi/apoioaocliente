
-- Allow supervisors to update macros
CREATE POLICY "macros_update"
ON public.macros
FOR UPDATE
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Allow supervisors to delete macros
CREATE POLICY "macros_delete"
ON public.macros
FOR DELETE
USING (has_role(auth.uid(), 'supervisor'::app_role));
