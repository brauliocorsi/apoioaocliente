UPDATE public.tickets t
SET email_received_at = pe.created_at
FROM public.pending_emails pe
WHERE pe.ticket_id = t.id
  AND pe.status = 'approved'
  AND t.email_received_at IS NULL;