
-- Tabela de ligações telefónicas
CREATE TABLE public.phone_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  invoice_number text,
  subject text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pendente',
  priority text NOT NULL DEFAULT 'P2',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  assigned_to uuid,
  ticket_id uuid REFERENCES public.tickets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de lembretes
CREATE TABLE public.phone_call_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_call_id uuid NOT NULL REFERENCES public.phone_calls(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  message text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS phone_calls
ALTER TABLE public.phone_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phone_calls_select" ON public.phone_calls FOR SELECT USING (is_authenticated_agent());
CREATE POLICY "phone_calls_insert" ON public.phone_calls FOR INSERT WITH CHECK (is_authenticated_agent() AND created_by = auth.uid());
CREATE POLICY "phone_calls_update" ON public.phone_calls FOR UPDATE USING (is_authenticated_agent());
CREATE POLICY "phone_calls_delete" ON public.phone_calls FOR DELETE USING (is_authenticated_agent());

-- RLS phone_call_reminders
ALTER TABLE public.phone_call_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phone_call_reminders_select" ON public.phone_call_reminders FOR SELECT USING (is_authenticated_agent());
CREATE POLICY "phone_call_reminders_insert" ON public.phone_call_reminders FOR INSERT WITH CHECK (is_authenticated_agent() AND created_by = auth.uid());
CREATE POLICY "phone_call_reminders_update" ON public.phone_call_reminders FOR UPDATE USING (is_authenticated_agent());
CREATE POLICY "phone_call_reminders_delete" ON public.phone_call_reminders FOR DELETE USING (is_authenticated_agent());

-- Trigger updated_at
CREATE TRIGGER update_phone_calls_updated_at
  BEFORE UPDATE ON public.phone_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Índices
CREATE INDEX idx_phone_calls_status ON public.phone_calls(status);
CREATE INDEX idx_phone_calls_priority ON public.phone_calls(priority);
CREATE INDEX idx_phone_calls_created_by ON public.phone_calls(created_by);
CREATE INDEX idx_phone_call_reminders_phone_call_id ON public.phone_call_reminders(phone_call_id);
CREATE INDEX idx_phone_call_reminders_remind_at ON public.phone_call_reminders(remind_at) WHERE is_completed = false;
