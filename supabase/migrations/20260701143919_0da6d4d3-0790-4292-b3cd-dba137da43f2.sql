
CREATE OR REPLACE FUNCTION public.is_authenticated_agent()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('agent'::public.app_role, 'supervisor'::public.app_role)
      AND COALESCE(p.is_active, true) = true
  )
$function$;

DROP POLICY IF EXISTS faq_items_select ON public.faq_items;
CREATE POLICY faq_items_select ON public.faq_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ticket_statuses_select ON public.ticket_statuses;
CREATE POLICY ticket_statuses_select ON public.ticket_statuses
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS phone_call_statuses_select ON public.phone_call_statuses;
CREATE POLICY phone_call_statuses_select ON public.phone_call_statuses
  FOR SELECT TO authenticated USING (true);
