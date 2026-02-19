
CREATE TABLE public.ticket_read_status (
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, agent_id)
);

ALTER TABLE public.ticket_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_status_select" ON public.ticket_read_status
  FOR SELECT USING (is_authenticated_agent() AND agent_id = auth.uid());

CREATE POLICY "read_status_insert" ON public.ticket_read_status
  FOR INSERT WITH CHECK (is_authenticated_agent() AND agent_id = auth.uid());

CREATE POLICY "read_status_update" ON public.ticket_read_status
  FOR UPDATE USING (is_authenticated_agent() AND agent_id = auth.uid());
