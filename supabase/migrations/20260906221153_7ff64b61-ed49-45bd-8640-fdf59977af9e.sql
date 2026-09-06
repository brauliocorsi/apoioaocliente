CREATE TABLE public.wms_delivery_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id text NOT NULL,
  incident_id uuid NOT NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  order_number text,
  route_id text,
  attempt_id text,
  note_id text,
  occurred_at timestamptz,
  driver_id text,
  driver_name text,
  delivery_outcome text,
  product_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments_status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wms_delivery_incidents_unique UNIQUE (source_project_id, incident_id)
);

GRANT SELECT ON public.wms_delivery_incidents TO authenticated;
GRANT ALL ON public.wms_delivery_incidents TO service_role;

ALTER TABLE public.wms_delivery_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view WMS incidents"
ON public.wms_delivery_incidents FOR SELECT TO authenticated
USING (public.is_authenticated_agent());

CREATE TRIGGER trg_wms_delivery_incidents_updated_at
BEFORE UPDATE ON public.wms_delivery_incidents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_wms_delivery_incidents_ticket ON public.wms_delivery_incidents(ticket_id);
CREATE INDEX idx_wms_delivery_incidents_order ON public.wms_delivery_incidents(order_number);

CREATE OR REPLACE FUNCTION public.wms_upsert_assistance(
  _source_project_id text,
  _incident_id uuid,
  _payload_hash text,
  _payload jsonb,
  _created_by uuid
)
RETURNS TABLE(ticket_id uuid, ticket_number integer, deduplicated boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.wms_delivery_incidents%ROWTYPE;
  v_ticket record;
  v_incident_id uuid;
BEGIN
  SELECT * INTO v_existing FROM public.wms_delivery_incidents
   WHERE source_project_id = _source_project_id AND incident_id = _incident_id;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM _payload_hash THEN
      RAISE EXCEPTION 'wms_incident_conflict' USING ERRCODE = 'P0001';
    END IF;
    SELECT t.id, t.ticket_number INTO v_ticket FROM public.tickets t WHERE t.id = v_existing.ticket_id;
    RETURN QUERY SELECT v_ticket.id, v_ticket.ticket_number, true;
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
  ) RETURNING id, ticket_number INTO v_ticket;

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
  RETURNING id INTO v_incident_id;

  IF v_incident_id IS NULL THEN
    -- Concurrent insert won the race: drop our ticket and return the winner's.
    DELETE FROM public.tickets WHERE id = v_ticket.id;
    SELECT * INTO v_existing FROM public.wms_delivery_incidents
     WHERE source_project_id = _source_project_id AND incident_id = _incident_id;
    IF v_existing.payload_hash IS DISTINCT FROM _payload_hash THEN
      RAISE EXCEPTION 'wms_incident_conflict' USING ERRCODE = 'P0001';
    END IF;
    SELECT t.id, t.ticket_number INTO v_ticket FROM public.tickets t WHERE t.id = v_existing.ticket_id;
    RETURN QUERY SELECT v_ticket.id, v_ticket.ticket_number, true;
    RETURN;
  END IF;

  INSERT INTO public.ticket_events (ticket_id, user_id, event_type, content, metadata)
  VALUES (
    v_ticket.id, NULL, 'wms_delivery_assistance',
    'Assistência aberta pelo entregador na app de entregas',
    jsonb_build_object(
      'source', 'wms',
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
END $$;

REVOKE ALL ON FUNCTION public.wms_upsert_assistance(text, uuid, text, jsonb, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wms_upsert_assistance(text, uuid, text, jsonb, uuid) TO service_role;