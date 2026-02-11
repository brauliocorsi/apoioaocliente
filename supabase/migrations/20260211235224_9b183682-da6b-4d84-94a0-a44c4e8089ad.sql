
-- Fix the overly permissive insert policy - restrict to authenticated users inserting their own record
DROP POLICY "client_users_insert_service" ON public.client_users;
CREATE POLICY "client_users_insert_own" ON public.client_users FOR INSERT WITH CHECK (auth.uid() = id);
