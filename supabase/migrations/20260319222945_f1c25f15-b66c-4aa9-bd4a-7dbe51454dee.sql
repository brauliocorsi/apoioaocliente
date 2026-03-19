
-- Table to track delayed orders from GestãoClick
CREATE TABLE public.delayed_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  client_name text NOT NULL,
  client_phone text,
  order_date date,
  situacao text,
  sla_deadline_at timestamp with time zone,
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table to register contact attempts for delayed orders
CREATE TABLE public.delayed_order_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delayed_order_id uuid REFERENCES public.delayed_orders(id) ON DELETE CASCADE NOT NULL,
  contacted_at timestamp with time zone NOT NULL DEFAULT now(),
  contact_type text NOT NULL DEFAULT 'phone',
  notes text,
  next_contact_at timestamp with time zone,
  phone_call_id uuid REFERENCES public.phone_calls(id) ON DELETE SET NULL,
  contacted_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delayed_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delayed_order_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for delayed_orders
CREATE POLICY "delayed_orders_select" ON public.delayed_orders FOR SELECT TO authenticated USING (is_authenticated_agent());
CREATE POLICY "delayed_orders_insert" ON public.delayed_orders FOR INSERT TO authenticated WITH CHECK (is_authenticated_agent() AND created_by = auth.uid());
CREATE POLICY "delayed_orders_update" ON public.delayed_orders FOR UPDATE TO authenticated USING (is_authenticated_agent());
CREATE POLICY "delayed_orders_delete" ON public.delayed_orders FOR DELETE TO authenticated USING (is_authenticated_agent());

-- RLS policies for delayed_order_contacts
CREATE POLICY "delayed_order_contacts_select" ON public.delayed_order_contacts FOR SELECT TO authenticated USING (is_authenticated_agent());
CREATE POLICY "delayed_order_contacts_insert" ON public.delayed_order_contacts FOR INSERT TO authenticated WITH CHECK (is_authenticated_agent() AND contacted_by = auth.uid());
CREATE POLICY "delayed_order_contacts_update" ON public.delayed_order_contacts FOR UPDATE TO authenticated USING (is_authenticated_agent());
CREATE POLICY "delayed_order_contacts_delete" ON public.delayed_order_contacts FOR DELETE TO authenticated USING (is_authenticated_agent());

-- Trigger for updated_at
CREATE TRIGGER update_delayed_orders_updated_at BEFORE UPDATE ON public.delayed_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
