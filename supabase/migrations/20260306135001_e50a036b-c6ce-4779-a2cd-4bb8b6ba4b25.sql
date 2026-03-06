
-- Table for post-delivery confirmations (checklist format)
CREATE TABLE public.post_delivery_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  delivery_date DATE,
  product_ok BOOLEAN NOT NULL DEFAULT false,
  assembly_ok BOOLEAN NOT NULL DEFAULT false,
  no_damage BOOLEAN NOT NULL DEFAULT false,
  client_satisfied BOOLEAN NOT NULL DEFAULT false,
  issues_reported TEXT,
  notes TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.post_delivery_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_delivery_select" ON public.post_delivery_confirmations FOR SELECT TO authenticated USING (is_authenticated_agent());
CREATE POLICY "post_delivery_insert" ON public.post_delivery_confirmations FOR INSERT TO authenticated WITH CHECK (is_authenticated_agent() AND created_by = auth.uid());
CREATE POLICY "post_delivery_update" ON public.post_delivery_confirmations FOR UPDATE TO authenticated USING (is_authenticated_agent());
CREATE POLICY "post_delivery_delete" ON public.post_delivery_confirmations FOR DELETE TO authenticated USING (is_authenticated_agent());
