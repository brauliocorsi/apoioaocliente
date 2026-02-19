
-- ============================================================
-- TRIGGER 1: Auto-criar evento "created" ao inserir qualquer ticket
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_create_ticket_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.ticket_events (ticket_id, event_type, content, metadata)
  VALUES (NEW.id, 'created', 'Ticket criado', '{}'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_ticket_event ON public.tickets;
CREATE TRIGGER trg_auto_create_ticket_event
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_ticket_event();

-- ============================================================
-- TRIGGER 2: Auto-criar evento "status_change" ao mudar status
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_status_change_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.ticket_events (ticket_id, event_type, content, metadata)
    VALUES (
      NEW.id,
      'status_change',
      'Estado alterado: ' || OLD.status || ' → ' || NEW.status,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_status_change_event ON public.tickets;
CREATE TRIGGER trg_auto_status_change_event
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_status_change_event();

-- ============================================================
-- TRIGGER 3: Auto-calcular SLA ao inserir/actualizar ticket
-- (BEFORE trigger para modificar NEW antes de gravar)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_calculate_sla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sla record;
BEGIN
  -- Só recalcula se category_id está preenchido e mudou (ou é novo INSERT)
  IF NEW.category_id IS NOT NULL AND (
    TG_OP = 'INSERT'
    OR OLD.category_id IS DISTINCT FROM NEW.category_id
    OR OLD.priority IS DISTINCT FROM NEW.priority
  ) THEN
    -- Não sobrescreve se já estava calculado e category não mudou
    IF TG_OP = 'UPDATE' AND OLD.category_id = NEW.category_id AND OLD.priority = NEW.priority THEN
      RETURN NEW;
    END IF;

    SELECT first_response_minutes, resolution_minutes
    INTO v_sla
    FROM public.sla_config
    WHERE category_id = NEW.category_id
      AND priority = NEW.priority::public.ticket_priority
    LIMIT 1;

    IF FOUND THEN
      NEW.sla_first_response_at := NEW.created_at + (v_sla.first_response_minutes * interval '1 minute');
      NEW.sla_resolution_at     := NEW.created_at + (v_sla.resolution_minutes     * interval '1 minute');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_calculate_sla ON public.tickets;
CREATE TRIGGER trg_auto_calculate_sla
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_calculate_sla();

-- ============================================================
-- CORRECÇÃO RETROACTIVA: tickets existentes sem eventos
-- ============================================================

-- Evento "created" para todos os tickets que não têm nenhum evento
INSERT INTO public.ticket_events (ticket_id, event_type, content, metadata, created_at)
SELECT 
  t.id,
  'created',
  'Ticket criado',
  '{}'::jsonb,
  t.created_at
FROM public.tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_events te 
  WHERE te.ticket_id = t.id AND te.event_type = 'created'
);

-- Evento "status_change" para tickets que não estão em status inicial "novo"
-- e ainda não têm evento de status_change
INSERT INTO public.ticket_events (ticket_id, event_type, content, metadata, created_at)
SELECT
  t.id,
  'status_change',
  'Estado alterado: novo → ' || t.status,
  jsonb_build_object('from', 'novo', 'to', t.status),
  t.updated_at
FROM public.tickets t
WHERE t.status <> 'novo'
  AND NOT EXISTS (
    SELECT 1 FROM public.ticket_events te
    WHERE te.ticket_id = t.id AND te.event_type = 'status_change'
  );
