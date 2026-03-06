
CREATE TABLE public.delivery_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  client_phone text NOT NULL,
  confirmed boolean NOT NULL,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_confirmations_select" ON public.delivery_confirmations FOR SELECT USING (is_authenticated_agent());
CREATE POLICY "delivery_confirmations_insert" ON public.delivery_confirmations FOR INSERT WITH CHECK (is_authenticated_agent() AND created_by = auth.uid());
CREATE POLICY "delivery_confirmations_delete" ON public.delivery_confirmations FOR DELETE USING (is_authenticated_agent());
