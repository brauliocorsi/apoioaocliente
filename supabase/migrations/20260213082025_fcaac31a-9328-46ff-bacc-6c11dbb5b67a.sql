
-- Table to store system-wide settings (SMTP, etc.)
CREATE TABLE public.system_settings (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only supervisors can manage settings
CREATE POLICY "system_settings_select" ON public.system_settings
  FOR SELECT USING (is_authenticated_agent());

CREATE POLICY "system_settings_insert" ON public.system_settings
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "system_settings_update" ON public.system_settings
  FOR UPDATE USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "system_settings_delete" ON public.system_settings
  FOR DELETE USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Seed default SMTP settings
INSERT INTO public.system_settings (key, value) VALUES
  ('smtp_host', ''),
  ('smtp_port', '465'),
  ('smtp_user', ''),
  ('smtp_pass', ''),
  ('smtp_from_name', 'Apoio ao Cliente'),
  ('smtp_from_email', 'noreply@upmoveis.pt');
