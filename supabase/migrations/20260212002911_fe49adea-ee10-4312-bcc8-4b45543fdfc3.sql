
CREATE OR REPLACE FUNCTION public.get_agent_profiles()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('agent', 'supervisor')
  ORDER BY p.full_name;
$$;
