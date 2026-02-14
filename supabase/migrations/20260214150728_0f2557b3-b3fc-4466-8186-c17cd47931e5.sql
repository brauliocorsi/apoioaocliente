
-- Create phone_call_statuses table for dynamic Kanban columns
CREATE TABLE public.phone_call_statuses (
  id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  color text DEFAULT '#6b7280',
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE public.phone_call_statuses ENABLE ROW LEVEL SECURITY;

-- Policies: everyone can read, supervisors can manage
CREATE POLICY "phone_call_statuses_select" ON public.phone_call_statuses FOR SELECT USING (true);
CREATE POLICY "phone_call_statuses_insert" ON public.phone_call_statuses FOR INSERT WITH CHECK (is_authenticated_agent());
CREATE POLICY "phone_call_statuses_update" ON public.phone_call_statuses FOR UPDATE USING (is_authenticated_agent());
CREATE POLICY "phone_call_statuses_delete" ON public.phone_call_statuses FOR DELETE USING (is_authenticated_agent());

-- Insert default statuses
INSERT INTO public.phone_call_statuses (id, name, color, sort_order, is_default) VALUES
  ('pendente', 'Pendente', '#f59e0b', 0, true),
  ('em_andamento', 'Em Andamento', '#3b82f6', 1, false),
  ('concluido', 'Concluído', '#22c55e', 2, false),
  ('cancelado', 'Cancelado', '#6b7280', 3, false);
