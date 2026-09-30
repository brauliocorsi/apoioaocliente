ALTER TABLE public.tickets DROP CONSTRAINT tickets_created_by_fkey,
  ADD CONSTRAINT tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tickets DROP CONSTRAINT tickets_assigned_to_fkey,
  ADD CONSTRAINT tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ticket_events DROP CONSTRAINT ticket_events_user_id_fkey,
  ADD CONSTRAINT ticket_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;