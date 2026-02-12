
DROP FUNCTION public.get_agent_profiles();

CREATE FUNCTION public.get_agent_profiles()
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, ur.role::text
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('agent', 'supervisor')
  ORDER BY ur.role DESC, p.full_name;
$$;
