
-- Update client select policy on ticket_events to also exclude internal notes
DROP POLICY "ticket_events_select_clients" ON public.ticket_events;

CREATE POLICY "ticket_events_select_clients" ON public.ticket_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_events.ticket_id AND t.client_user_id = auth.uid()
    )
    AND event_type NOT IN ('approval_request', 'approval_approved', 'approval_rejected', 'note')
  );
