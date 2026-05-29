
-- 1. extension column on phone_calls
ALTER TABLE public.phone_calls
  ADD COLUMN IF NOT EXISTS extension TEXT;

CREATE INDEX IF NOT EXISTS idx_phone_calls_extension ON public.phone_calls(extension);
CREATE INDEX IF NOT EXISTS idx_phone_calls_created_at ON public.phone_calls(created_at DESC);

-- 2. monitored_extensions
CREATE TABLE IF NOT EXISTS public.monitored_extensions (
  extension INTEGER PRIMARY KEY,
  label TEXT,
  assigned_profile_id UUID NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitored_extensions TO authenticated;
GRANT ALL ON public.monitored_extensions TO service_role;

ALTER TABLE public.monitored_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY monitored_extensions_select ON public.monitored_extensions
  FOR SELECT TO authenticated USING (public.is_authenticated_agent());

CREATE POLICY monitored_extensions_insert ON public.monitored_extensions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'::public.app_role));

CREATE POLICY monitored_extensions_update ON public.monitored_extensions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'supervisor'::public.app_role));

CREATE POLICY monitored_extensions_delete ON public.monitored_extensions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'supervisor'::public.app_role));

-- Seed default extensions
INSERT INTO public.monitored_extensions (extension, label) VALUES
  (200, 'Ramal 200'),
  (201, 'Ramal 201'),
  (202, 'Ramal 202')
ON CONFLICT (extension) DO NOTHING;

-- 3. microsip_extension_status
CREATE TABLE IF NOT EXISTS public.microsip_extension_status (
  extension INTEGER PRIMARY KEY,
  last_call_at TIMESTAMPTZ,
  last_direction TEXT,
  last_attended BOOLEAN,
  last_seen_source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.microsip_extension_status TO authenticated;
GRANT ALL ON public.microsip_extension_status TO service_role;

ALTER TABLE public.microsip_extension_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY microsip_extension_status_select ON public.microsip_extension_status
  FOR SELECT TO authenticated USING (public.is_authenticated_agent());

-- 4. Reconciliation view
CREATE OR REPLACE VIEW public.phone_calls_reconciliation
WITH (security_invoker = true) AS
WITH normalized AS (
  SELECT
    id,
    source,
    direction,
    attended,
    created_at,
    extension,
    client_phone,
    ticket_id,
    regexp_replace(
      regexp_replace(coalesce(client_phone,''), '\D', '', 'g'),
      '^(00351|351)', ''
    ) AS phone_norm
  FROM public.phone_calls
)
SELECT
  pc.id AS phone_call_id,
  pc.source,
  pc.direction,
  pc.attended,
  pc.created_at,
  pc.extension,
  pc.client_phone,
  pc.ticket_id,
  CASE
    WHEN pc.source = 'letscall' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM normalized m
        WHERE m.source <> 'letscall'
          AND m.phone_norm = pc.phone_norm
          AND m.phone_norm <> ''
          AND abs(extract(epoch FROM (m.created_at - pc.created_at))) <= 900
      ) THEN 'confirmed' ELSE 'not_registered_in_system' END
    ELSE
      CASE WHEN EXISTS (
        SELECT 1 FROM normalized m
        WHERE m.source = 'letscall'
          AND m.phone_norm = pc.phone_norm
          AND m.phone_norm <> ''
          AND abs(extract(epoch FROM (m.created_at - pc.created_at))) <= 900
      ) THEN 'confirmed' ELSE 'not_found_in_microsip' END
  END AS reconciliation_status
FROM normalized pc;

GRANT SELECT ON public.phone_calls_reconciliation TO authenticated;
