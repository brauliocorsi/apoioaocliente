
-- Notifications table for @mentions and other agent notifications
CREATE TABLE public.agent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  sender_id uuid,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'mention',
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_notifications ENABLE ROW LEVEL SECURITY;

-- Agents can see their own notifications
CREATE POLICY "notifications_select_own" ON public.agent_notifications
  FOR SELECT USING (recipient_id = auth.uid() AND public.is_authenticated_agent());

-- Agents can update (mark read) their own notifications
CREATE POLICY "notifications_update_own" ON public.agent_notifications
  FOR UPDATE USING (recipient_id = auth.uid() AND public.is_authenticated_agent());

-- Agents can insert notifications (for mentions)
CREATE POLICY "notifications_insert_agents" ON public.agent_notifications
  FOR INSERT WITH CHECK (public.is_authenticated_agent());

-- Agents can delete their own notifications
CREATE POLICY "notifications_delete_own" ON public.agent_notifications
  FOR DELETE USING (recipient_id = auth.uid() AND public.is_authenticated_agent());

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_notifications;
