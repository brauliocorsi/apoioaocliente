
-- 1) Autoria: permitir tickets sem autor humano (origem integração)
ALTER TABLE public.tickets ALTER COLUMN created_by DROP NOT NULL;

-- 2) Registo por evidência, com idempotência por (origem, incidente, referência)
CREATE TABLE IF NOT EXISTS public.wms_incident_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id text NOT NULL,
  incident_id uuid NOT NULL,
  wms_incident_row_id uuid REFERENCES public.wms_delivery_incidents(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  storage_reference text NOT NULL,
  file_name text,
  mime_type text,
  file_size integer,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  copied_at timestamptz,
  ticket_attachment_id uuid REFERENCES public.ticket_attachments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wms_incident_attachments_status_chk
    CHECK (status IN ('pending','copied','error','skipped')),
  CONSTRAINT wms_incident_attachments_unique
    UNIQUE (source_project_id, incident_id, storage_reference)
);

CREATE INDEX IF NOT EXISTS wms_incident_attachments_ticket_idx
  ON public.wms_incident_attachments (ticket_id);
CREATE INDEX IF NOT EXISTS wms_incident_attachments_status_idx
  ON public.wms_incident_attachments (status);

GRANT SELECT ON public.wms_incident_attachments TO authenticated;
GRANT ALL ON public.wms_incident_attachments TO service_role;

ALTER TABLE public.wms_incident_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wms_incident_attachments_select_staff"
  ON public.wms_incident_attachments FOR SELECT TO authenticated
  USING (public.is_authenticated_agent());

CREATE TRIGGER trg_wms_incident_attachments_updated_at
  BEFORE UPDATE ON public.wms_incident_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3) Upsert da assistência: autoria de integração (sem pessoa) + registo de evidências
CREATE OR REPLACE FUNCTION public.wms_upsert_assistance(
  _source_project_id text,
  _incident_id uuid,
  _payload_hash text,
  _payload jsonb,
  _created_by uuid DEFAULT NULL
)
RETURNS TABLE(ticket_id uuid, ticket_number integer, deduplicated boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_existing public.wms_delivery_incidents%ROWTYPE;
  v_ticket record;
  v_new_incident uuid;
  v_att jsonb;
BEGIN
  SELECT * INTO v_existing FROM public.wms_delivery_incidents w
   WHERE w.source_project_id = _source_project_id AND w.incident_id = _incident_id;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM _payload_hash THEN
      RAISE EXCEPTION 'wms_incident_conflict' USING ERRCODE = 'P0001';
    END IF;
    SELECT t.id AS tid, t.ticket_number AS tnum INTO v_ticket FROM public.tickets t WHERE t.id = v_existing.ticket_id;
    RETURN QUERY SELECT v_ticket.tid, v_ticket.tnum, true;
    RETURN;
  END IF;

  INSERT INTO public.tickets (
    client_name, client_email, client_phone, order_number, subject, description,
    priority, status, created_by
  ) VALUES (
    COALESCE(NULLIF(_payload->'client'->>'name', ''), 'Cliente (entrega)'),
    NULLIF(_payload->'client'->>'email', ''),
    NULLIF(_payload->'client'->>'phone', ''),
    NULLIF(_payload->>'order_number', ''),
    COALESCE(NULLIF(_payload->>'subject', ''), 'Assistência de entrega'),
    NULLIF(_payload->>'description', ''),
    'P2', 'novo', _created_by
  ) RETURNING public.tickets.id, public.tickets.ticket_number INTO v_ticket;

  INSERT INTO public.wms_delivery_incidents (
    source_project_id, incident_id, ticket_id, order_number, route_id, attempt_id,
    note_id, occurred_at, driver_id, driver_name, delivery_outcome,
    product_lines, attachments, attachments_status, payload, payload_hash
  ) VALUES (
    _source_project_id, _incident_id, v_ticket.id,
    NULLIF(_payload->>'order_number', ''),
    NULLIF(_payload->>'route_id', ''),
    NULLIF(_payload->>'attempt_id', ''),
    NULLIF(_payload->>'note_id', ''),
    NULLIF(_payload->>'occurred_at', '')::timestamptz,
    NULLIF(_payload->>'driver_id', ''),
    NULLIF(_payload->>'driver_name', ''),
    NULLIF(_payload->>'delivery_outcome', ''),
    COALESCE(_payload->'product_lines', '[]'::jsonb),
    COALESCE(_payload->'attachments', '[]'::jsonb),
    CASE WHEN COALESCE(jsonb_array_length(_payload->'attachments'), 0) > 0 THEN 'pending' ELSE 'none' END,
    _payload, _payload_hash
  )
  ON CONFLICT (source_project_id, incident_id) DO NOTHING
  RETURNING public.wms_delivery_incidents.id INTO v_new_incident;

  IF v_new_incident IS NULL THEN
    DELETE FROM public.tickets t WHERE t.id = v_ticket.id;
    SELECT * INTO v_existing FROM public.wms_delivery_incidents w
     WHERE w.source_project_id = _source_project_id AND w.incident_id = _incident_id;
    IF v_existing.payload_hash IS DISTINCT FROM _payload_hash THEN
      RAISE EXCEPTION 'wms_incident_conflict' USING ERRCODE = 'P0001';
    END IF;
    SELECT t.id AS tid, t.ticket_number AS tnum INTO v_ticket FROM public.tickets t WHERE t.id = v_existing.ticket_id;
    RETURN QUERY SELECT v_ticket.tid, v_ticket.tnum, true;
    RETURN;
  END IF;

  -- Registo individual de cada evidência (idempotente)
  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'attachments', '[]'::jsonb))
  LOOP
    IF COALESCE(v_att->>'storage_reference', '') <> '' THEN
      INSERT INTO public.wms_incident_attachments (
        source_project_id, incident_id, wms_incident_row_id, ticket_id,
        storage_reference, file_name, mime_type, status
      ) VALUES (
        _source_project_id, _incident_id, v_new_incident, v_ticket.id,
        v_att->>'storage_reference',
        NULLIF(v_att->>'name', ''),
        NULLIF(v_att->>'mime_type', ''),
        'pending'
      )
      ON CONFLICT (source_project_id, incident_id, storage_reference) DO NOTHING;
    END IF;
  END LOOP;

  INSERT INTO public.ticket_events (ticket_id, user_id, event_type, content, metadata)
  VALUES (
    v_ticket.id, NULL, 'wms_delivery_assistance',
    'Assistência aberta pelo entregador na app de entregas',
    jsonb_build_object(
      'source', 'wms',
      'actor_type', 'integration',
      'source_project_id', _source_project_id,
      'incident_id', _incident_id,
      'driver_id', _payload->>'driver_id',
      'driver_name', _payload->>'driver_name',
      'route_id', _payload->>'route_id',
      'attempt_id', _payload->>'attempt_id',
      'note_id', _payload->>'note_id',
      'delivery_outcome', _payload->>'delivery_outcome',
      'occurred_at', _payload->>'occurred_at'
    )
  );

  RETURN QUERY SELECT v_ticket.id, v_ticket.ticket_number, false;
END $function$;
