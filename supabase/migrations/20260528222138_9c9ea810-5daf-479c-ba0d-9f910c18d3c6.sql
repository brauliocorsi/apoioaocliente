
-- Fase 6 — SLA operacional real (aditivo)

-- 1) Novas colunas aditivas
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS next_customer_update_due_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sla_status text NULL,
  ADD COLUMN IF NOT EXISTS sla_breached boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_breach_reason text NULL,
  ADD COLUMN IF NOT EXISTS sla_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_paused_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_next_customer_update_due_at
  ON public.tickets (next_customer_update_due_at)
  WHERE next_customer_update_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_sla_breached
  ON public.tickets (sla_breached) WHERE sla_breached = true;

-- 2) Defaults de SLA por prioridade (horas corridas; limitação documentada)
--    Usados quando não existir sla_config para a categoria.
CREATE OR REPLACE FUNCTION public.sla_default_first_response_hours(_priority text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_priority,'p2'))
    WHEN 'p1' THEN 2
    WHEN 'urgente' THEN 2
    WHEN 'p2' THEN 4
    WHEN 'alta' THEN 4
    WHEN 'p3' THEN 24
    WHEN 'normal' THEN 24
    WHEN 'p4' THEN 48
    WHEN 'baixa' THEN 48
    ELSE 24 END
$$;

CREATE OR REPLACE FUNCTION public.sla_default_resolution_hours(_priority text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_priority,'p2'))
    WHEN 'p1' THEN 24
    WHEN 'urgente' THEN 24
    WHEN 'p2' THEN 48
    WHEN 'alta' THEN 48
    WHEN 'p3' THEN 120
    WHEN 'normal' THEN 120
    WHEN 'p4' THEN 240
    WHEN 'baixa' THEN 240
    ELSE 120 END
$$;

-- 3) Auto-preencher prazos no INSERT se ainda não tiverem
CREATE OR REPLACE FUNCTION public.tg_tickets_init_sla()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fr_hours integer;
  v_res_hours integer;
BEGIN
  IF NEW.sla_first_response_at IS NULL THEN
    v_fr_hours := public.sla_default_first_response_hours(NEW.priority::text);
    NEW.sla_first_response_at := NEW.created_at + (v_fr_hours || ' hours')::interval;
  END IF;
  IF NEW.sla_resolution_at IS NULL THEN
    v_res_hours := public.sla_default_resolution_hours(NEW.priority::text);
    NEW.sla_resolution_at := NEW.created_at + (v_res_hours || ' hours')::interval;
  END IF;
  IF NEW.next_customer_update_due_at IS NULL THEN
    NEW.next_customer_update_due_at := NEW.created_at + interval '48 hours';
  END IF;
  IF NEW.sla_status IS NULL THEN
    NEW.sla_status := 'on_track';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_init_sla ON public.tickets;
CREATE TRIGGER trg_tickets_init_sla
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_tickets_init_sla();

-- 4) Quando agente envia mensagem pública: preencher first_responded_at e
--    empurrar next_customer_update_due_at para +48h
CREATE OR REPLACE FUNCTION public.tg_ticket_messages_sla_marks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sender_type = 'agent' THEN
    UPDATE public.tickets
       SET first_responded_at = COALESCE(first_responded_at, NEW.created_at),
           next_customer_update_due_at = NEW.created_at + interval '48 hours',
           sla_status = CASE WHEN sla_paused THEN 'paused' ELSE 'on_track' END
     WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ticket_messages_sla_marks ON public.ticket_messages;
CREATE TRIGGER trg_ticket_messages_sla_marks
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_ticket_messages_sla_marks();

-- 5) Quando status muda para resolvido/fechado: marcar resolved_at e sla_status
CREATE OR REPLACE FUNCTION public.tg_tickets_sla_on_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_resolved boolean;
  v_is_closed boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT COALESCE(is_resolved,false), COALESCE(is_closed,false)
      INTO v_is_resolved, v_is_closed
      FROM public.ticket_statuses WHERE id = NEW.status;
    IF v_is_resolved AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF v_is_resolved THEN NEW.sla_status := 'resolved'; END IF;
    IF v_is_closed THEN NEW.sla_status := 'closed'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_sla_on_status ON public.tickets;
CREATE TRIGGER trg_tickets_sla_on_status
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_tickets_sla_on_status();
