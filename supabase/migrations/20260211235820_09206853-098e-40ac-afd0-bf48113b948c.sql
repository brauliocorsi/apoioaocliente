
-- Allow clients to insert tickets (their own)
CREATE POLICY "tickets_insert_clients" ON public.tickets
  FOR INSERT WITH CHECK (
    client_user_id = auth.uid() AND created_by = auth.uid()
  );

-- Allow clients to view their own ticket events (status changes visible)
CREATE POLICY "ticket_events_select_clients" ON public.ticket_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_events.ticket_id AND t.client_user_id = auth.uid())
  );

-- Update handle_new_user to not auto-assign agent role (check if role already exists)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  -- Only auto-assign agent role if no role exists yet
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  END IF;
  RETURN NEW;
END;
$$;
