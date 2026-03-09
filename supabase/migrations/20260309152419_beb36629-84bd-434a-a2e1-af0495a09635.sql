ALTER TABLE public.pending_emails
  DROP CONSTRAINT pending_emails_ticket_id_fkey;

ALTER TABLE public.pending_emails
  ADD CONSTRAINT pending_emails_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;