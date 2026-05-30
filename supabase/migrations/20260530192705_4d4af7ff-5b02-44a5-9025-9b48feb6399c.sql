ALTER TABLE public.phone_calls
  ADD COLUMN IF NOT EXISTS call_status TEXT,
  ADD COLUMN IF NOT EXISTS cdr_raw JSONB,
  ADD COLUMN IF NOT EXISTS cdr_answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cdr_ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cdr_src TEXT,
  ADD COLUMN IF NOT EXISTS cdr_dst TEXT;

CREATE INDEX IF NOT EXISTS idx_phone_calls_call_status ON public.phone_calls(call_status);
CREATE INDEX IF NOT EXISTS idx_phone_calls_source_created ON public.phone_calls(source, created_at DESC);

DROP VIEW IF EXISTS public.phone_calls_reconciliation;

CREATE VIEW public.phone_calls_reconciliation
WITH (security_invoker = true) AS
WITH normalized AS (
  SELECT
    id, source, direction, attended, call_status, created_at, extension,
    client_phone, ticket_id,
    regexp_replace(
      regexp_replace(coalesce(client_phone,''), '\D', '', 'g'),
      '^(00351|351)', ''
    ) AS phone_norm
  FROM public.phone_calls
),
matches AS (
  SELECT
    pc.id AS phone_call_id, pc.source, pc.direction, pc.attended, pc.call_status,
    pc.created_at, pc.extension, pc.client_phone, pc.ticket_id, pc.phone_norm,
    (SELECT count(*)::int FROM normalized m
      WHERE m.id <> pc.id AND m.phone_norm = pc.phone_norm AND m.phone_norm <> ''
        AND ((pc.source = 'letscall' AND m.source <> 'letscall')
          OR (pc.source <> 'letscall' AND m.source = 'letscall'))
        AND abs(extract(epoch FROM (m.created_at - pc.created_at))) <= 900
    ) AS match_count,
    (SELECT m.id FROM normalized m
      WHERE m.id <> pc.id AND m.phone_norm = pc.phone_norm AND m.phone_norm <> ''
        AND ((pc.source = 'letscall' AND m.source <> 'letscall')
          OR (pc.source <> 'letscall' AND m.source = 'letscall'))
        AND abs(extract(epoch FROM (m.created_at - pc.created_at))) <= 900
      ORDER BY abs(extract(epoch FROM (m.created_at - pc.created_at))) ASC
      LIMIT 1
    ) AS matched_call_id
  FROM normalized pc
)
SELECT
  phone_call_id, source, direction, attended, call_status, created_at, extension,
  client_phone, ticket_id, match_count, matched_call_id,
  CASE
    WHEN match_count = 0 AND source = 'letscall' THEN 'not_registered_in_system'
    WHEN match_count = 0 AND source <> 'letscall' THEN 'not_found_in_microsip'
    WHEN match_count = 1 THEN 'confirmed'
    WHEN match_count > 1 THEN 'ambiguous'
    ELSE 'unknown'
  END AS reconciliation_status
FROM matches;

GRANT SELECT ON public.phone_calls_reconciliation TO authenticated;