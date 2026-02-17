
-- Create table for message reactions (emoji reactions on chat messages)
CREATE TABLE public.message_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.ticket_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Agents can see all reactions
CREATE POLICY "reactions_select_agents" ON public.message_reactions
  FOR SELECT USING (is_authenticated_agent());

-- Clients can see reactions on their ticket messages
CREATE POLICY "reactions_select_clients" ON public.message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ticket_messages tm
      JOIN tickets t ON t.id = tm.ticket_id
      WHERE tm.id = message_reactions.message_id AND t.client_user_id = auth.uid()
    )
  );

-- Agents can insert reactions
CREATE POLICY "reactions_insert_agents" ON public.message_reactions
  FOR INSERT WITH CHECK (is_authenticated_agent() AND user_id = auth.uid());

-- Clients can insert reactions on their ticket messages
CREATE POLICY "reactions_insert_clients" ON public.message_reactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM ticket_messages tm
      JOIN tickets t ON t.id = tm.ticket_id
      WHERE tm.id = message_reactions.message_id AND t.client_user_id = auth.uid()
    )
  );

-- Users can delete their own reactions
CREATE POLICY "reactions_delete_own" ON public.message_reactions
  FOR DELETE USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
