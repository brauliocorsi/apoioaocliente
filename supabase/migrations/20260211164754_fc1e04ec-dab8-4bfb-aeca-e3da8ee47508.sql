
-- Create ticket_statuses table
CREATE TABLE public.ticket_statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  sort_order INT NOT NULL DEFAULT 0,
  pauses_sla BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  is_closed BOOLEAN DEFAULT false,
  default_assign UUID,
  sla_minutes INT
);

ALTER TABLE public.ticket_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_statuses_select" ON public.ticket_statuses FOR SELECT USING (true);
CREATE POLICY "ticket_statuses_insert" ON public.ticket_statuses FOR INSERT WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));
CREATE POLICY "ticket_statuses_update" ON public.ticket_statuses FOR UPDATE USING (has_role(auth.uid(), 'supervisor'::app_role));
CREATE POLICY "ticket_statuses_delete" ON public.ticket_statuses FOR DELETE USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Seed with current statuses
INSERT INTO public.ticket_statuses (id, name, color, sort_order, pauses_sla, is_resolved, is_closed) VALUES
  ('novo', 'Novo', '#3b82f6', 1, false, false, false),
  ('em_analise', 'Em análise', '#8b5cf6', 2, false, false, false),
  ('aguarda_cliente', 'Aguarda cliente', '#f59e0b', 3, true, false, false),
  ('aguarda_logistica', 'Aguarda logística', '#f97316', 4, false, false, false),
  ('aguarda_tecnico', 'Aguarda técnico', '#a855f7', 5, false, false, false),
  ('resolvido', 'Resolvido', '#22c55e', 6, false, true, false),
  ('encerrado', 'Encerrado', '#6b7280', 7, false, false, true);

-- Convert tickets.status from ENUM to TEXT
ALTER TABLE public.tickets ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.tickets ALTER COLUMN status TYPE TEXT USING status::TEXT;
ALTER TABLE public.tickets ALTER COLUMN status SET DEFAULT 'novo';
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_fk FOREIGN KEY (status) REFERENCES public.ticket_statuses(id);

DROP TYPE IF EXISTS ticket_status;

-- Add columns to categories/subcategories/tickets
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS default_assign UUID;
ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS default_assign UUID;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sla_stage_deadline_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT now();

-- RLS for categories update/delete
CREATE POLICY "categories_update" ON public.categories FOR UPDATE USING (has_role(auth.uid(), 'supervisor'::app_role));
CREATE POLICY "categories_delete" ON public.categories FOR DELETE USING (has_role(auth.uid(), 'supervisor'::app_role));

-- RLS for subcategories update/delete
CREATE POLICY "subcategories_update" ON public.subcategories FOR UPDATE USING (has_role(auth.uid(), 'supervisor'::app_role));
CREATE POLICY "subcategories_delete" ON public.subcategories FOR DELETE USING (has_role(auth.uid(), 'supervisor'::app_role));
