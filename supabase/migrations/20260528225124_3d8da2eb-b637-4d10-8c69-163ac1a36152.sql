
-- Fase 7 — Calendário laboral (Seg–Sáb 08:00–20:00 Europe/Lisbon) + pausa automática do SLA
-- Aditivo. Sem DROP/TRUNCATE/DELETE. Tickets antigos não são recalculados em massa.

-- 1) Colunas aditivas em tickets para pausa automática
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sla_paused_total_seconds integer NOT NULL DEFAULT 0;

-- 2) Colunas aditivas em ticket_statuses
ALTER TABLE public.ticket_statuses
  ADD COLUMN IF NOT EXISTS sla_pause_reason text NULL;
-- pauses_sla já existe.

-- 3) Helper: dia operacional (Seg–Sáb) em Europe/Lisbon
CREATE OR REPLACE FUNCTION public.is_business_day_lx(_d date)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  -- 0=Sunday, 1..6 Mon..Sat
  SELECT EXTRACT(DOW FROM _d)::int <> 0
$$;

-- 4) Próximo início de janela operacional (>= _ts)
CREATE OR REPLACE FUNCTION public.next_business_window_start(_ts timestamptz)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_local timestamp;
  v_date date;
  v_time time;
  v_start timestamp;
  v_end timestamp;
BEGIN
  v_local := (_ts AT TIME ZONE 'Europe/Lisbon');
  LOOP
    v_date := v_local::date;
    v_time := v_local::time;
    IF public.is_business_day_lx(v_date) THEN
      v_start := (v_date + time '08:00')::timestamp;
      v_end   := (v_date + time '20:00')::timestamp;
      IF v_local < v_start THEN
        RETURN (v_start AT TIME ZONE 'Europe/Lisbon');
      ELSIF v_local < v_end THEN
        RETURN (v_local AT TIME ZONE 'Europe/Lisbon');
      END IF;
    END IF;
    -- avança para o próximo dia 08:00
    v_local := ((v_date + 1) + time '08:00')::timestamp;
  END LOOP;
END $$;

-- 5) Adicionar N horas úteis a partir de _start
CREATE OR REPLACE FUNCTION public.add_business_hours(_start timestamptz, _hours numeric)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_remaining_secs numeric;
  v_cur timestamptz;
  v_local timestamp;
  v_date date;
  v_end_local timestamp;
  v_end_ts timestamptz;
  v_avail_secs numeric;
BEGIN
  IF _hours IS NULL OR _hours <= 0 THEN
    RETURN public.next_business_window_start(_start);
  END IF;
  v_remaining_secs := _hours * 3600.0;
  v_cur := public.next_business_window_start(_start);

  WHILE v_remaining_secs > 0 LOOP
    v_local := (v_cur AT TIME ZONE 'Europe/Lisbon');
    v_date := v_local::date;
    v_end_local := (v_date + time '20:00')::timestamp;
    v_end_ts := (v_end_local AT TIME ZONE 'Europe/Lisbon');
    v_avail_secs := EXTRACT(EPOCH FROM (v_end_ts - v_cur));
    IF v_remaining_secs <= v_avail_secs THEN
      RETURN v_cur + make_interval(secs => v_remaining_secs);
    END IF;
    v_remaining_secs := v_remaining_secs - v_avail_secs;
    -- saltar para próximo início operacional após v_end_ts
    v_cur := public.next_business_window_start(v_end_ts + interval '1 second');
  END LOOP;
  RETURN v_cur;
END $$;

-- 6) Minutos úteis entre dois instantes (>=0). Útil para relatórios futuros.
CREATE OR REPLACE FUNCTION public.business_minutes_between(_start timestamptz, _end timestamptz)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_cur timestamptz;
  v_local timestamp;
  v_date date;
  v_end_local timestamp;
  v_end_day_ts timestamptz;
  v_chunk_end timestamptz;
  v_total_secs numeric := 0;
BEGIN
  IF _end <= _start THEN RETURN 0; END IF;
  v_cur := public.next_business_window_start(_start);
  WHILE v_cur < _end LOOP
    v_local := (v_cur AT TIME ZONE 'Europe/Lisbon');
    v_date := v_local::date;
    v_end_local := (v_date + time '20:00')::timestamp;
    v_end_day_ts := (v_end_local AT TIME ZONE 'Europe/Lisbon');
    v_chunk_end := LEAST(v_end_day_ts, _end);
    IF v_chunk_end > v_cur THEN
      v_total_secs := v_total_secs + EXTRACT(EPOCH FROM (v_chunk_end - v_cur));
    END IF;
    v_cur := public.next_business_window_start(v_end_day_ts + interval '1 second');
  END LOOP;
  RETURN floor(v_total_secs / 60.0)::int;
END $$;

-- 7) Atualizar trg_tickets_init_sla para usar horas úteis.
CREATE OR REPLACE FUNCTION public.tg_tickets_init_sla()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fr_hours integer;
  v_res_hours integer;
BEGIN
  IF NEW.sla_first_response_at IS NULL THEN
    v_fr_hours := public.sla_default_first_response_hours(NEW.priority::text);
    NEW.sla_first_response_at := public.add_business_hours(NEW.created_at, v_fr_hours);
  END IF;
  IF NEW.sla_resolution_at IS NULL THEN
    v_res_hours := public.sla_default_resolution_hours(NEW.priority::text);
    NEW.sla_resolution_at := public.add_business_hours(NEW.created_at, v_res_hours);
  END IF;
  IF NEW.next_customer_update_due_at IS NULL THEN
    NEW.next_customer_update_due_at := public.add_business_hours(NEW.created_at, 48);
  END IF;
  IF NEW.sla_status IS NULL THEN
    NEW.sla_status := 'on_track';
  END IF;
  RETURN NEW;
END $$;

-- 8) Atualizar tg_ticket_messages_sla_marks para:
--    - usar horas úteis na próxima atualização ao cliente
--    - retomar SLA automaticamente quando cliente responde em ticket pausado
CREATE OR REPLACE FUNCTION public.tg_ticket_messages_sla_marks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_resolved boolean := false;
  v_is_closed boolean := false;
  v_paused boolean := false;
  v_paused_at timestamptz;
  v_pause_secs integer;
  v_reason text;
BEGIN
  IF NEW.sender_type = 'agent' THEN
    SELECT COALESCE(s.is_resolved,false), COALESCE(s.is_closed,false)
      INTO v_is_resolved, v_is_closed
      FROM public.tickets t
      LEFT JOIN public.ticket_statuses s ON s.id = t.status
     WHERE t.id = NEW.ticket_id;

    IF v_is_resolved OR v_is_closed THEN
      UPDATE public.tickets
         SET first_responded_at = COALESCE(first_responded_at, NEW.created_at)
       WHERE id = NEW.ticket_id;
    ELSE
      UPDATE public.tickets
         SET first_responded_at = COALESCE(first_responded_at, NEW.created_at),
             next_customer_update_due_at = public.add_business_hours(NEW.created_at, 48),
             sla_status = CASE WHEN sla_paused THEN 'paused' ELSE 'on_track' END
       WHERE id = NEW.ticket_id;
    END IF;

  ELSIF NEW.sender_type = 'client' THEN
    -- Retomar SLA se o ticket está pausado por motivo "cliente" e não está resolvido/fechado.
    SELECT COALESCE(t.sla_paused,false), t.sla_paused_at, COALESCE(t.sla_paused_reason,''),
           COALESCE(s.is_resolved,false), COALESCE(s.is_closed,false)
      INTO v_paused, v_paused_at, v_reason, v_is_resolved, v_is_closed
      FROM public.tickets t
      LEFT JOIN public.ticket_statuses s ON s.id = t.status
     WHERE t.id = NEW.ticket_id;

    IF v_paused AND NOT v_is_resolved AND NOT v_is_closed AND v_reason ILIKE '%cliente%' THEN
      v_pause_secs := COALESCE(EXTRACT(EPOCH FROM (now() - v_paused_at))::int, 0);
      UPDATE public.tickets
         SET sla_paused = false,
             sla_paused_at = NULL,
             sla_paused_reason = NULL,
             sla_paused_total_seconds = COALESCE(sla_paused_total_seconds,0) + GREATEST(v_pause_secs,0),
             sla_first_response_at = CASE WHEN first_responded_at IS NULL AND sla_first_response_at IS NOT NULL
                                          THEN sla_first_response_at + make_interval(secs => GREATEST(v_pause_secs,0))
                                          ELSE sla_first_response_at END,
             sla_resolution_at = CASE WHEN resolved_at IS NULL AND sla_resolution_at IS NOT NULL
                                      THEN sla_resolution_at + make_interval(secs => GREATEST(v_pause_secs,0))
                                      ELSE sla_resolution_at END,
             next_customer_update_due_at = public.add_business_hours(NEW.created_at, 48),
             sla_status = 'on_track'
       WHERE id = NEW.ticket_id;

      INSERT INTO public.ticket_events (ticket_id, event_type, content, metadata)
      VALUES (NEW.ticket_id, 'sla_resumed',
              'SLA retomado automaticamente após resposta do cliente',
              jsonb_build_object('paused_seconds', GREATEST(v_pause_secs,0)));
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 9) Trigger BEFORE UPDATE em tickets para pausar/retomar com base no status.
CREATE OR REPLACE FUNCTION public.tg_tickets_sla_pause_on_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_pauses boolean := false;
  v_new_pauses boolean := false;
  v_new_reason text;
  v_is_resolved boolean := false;
  v_is_closed boolean := false;
  v_pause_secs integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(pauses_sla,false), sla_pause_reason, COALESCE(is_resolved,false), COALESCE(is_closed,false)
    INTO v_new_pauses, v_new_reason, v_is_resolved, v_is_closed
    FROM public.ticket_statuses WHERE id = NEW.status;
  SELECT COALESCE(pauses_sla,false) INTO v_old_pauses
    FROM public.ticket_statuses WHERE id = OLD.status;

  -- Não tocar se ticket está/vai para resolvido/fechado.
  IF v_is_resolved OR v_is_closed THEN
    RETURN NEW;
  END IF;

  -- Entrar em pausa
  IF v_new_pauses AND NOT COALESCE(NEW.sla_paused,false) THEN
    NEW.sla_paused := true;
    IF NEW.sla_paused_at IS NULL THEN NEW.sla_paused_at := now(); END IF;
    NEW.sla_paused_reason := COALESCE(v_new_reason, (SELECT name FROM public.ticket_statuses WHERE id = NEW.status));
    NEW.sla_status := 'paused';
  -- Sair da pausa
  ELSIF (NOT v_new_pauses) AND COALESCE(OLD.sla_paused,false) THEN
    v_pause_secs := COALESCE(EXTRACT(EPOCH FROM (now() - COALESCE(OLD.sla_paused_at, now())))::int, 0);
    NEW.sla_paused := false;
    NEW.sla_paused_at := NULL;
    NEW.sla_paused_reason := NULL;
    NEW.sla_paused_total_seconds := COALESCE(OLD.sla_paused_total_seconds,0) + GREATEST(v_pause_secs,0);
    IF NEW.first_responded_at IS NULL AND NEW.sla_first_response_at IS NOT NULL THEN
      NEW.sla_first_response_at := NEW.sla_first_response_at + make_interval(secs => GREATEST(v_pause_secs,0));
    END IF;
    IF NEW.resolved_at IS NULL AND NEW.sla_resolution_at IS NOT NULL THEN
      NEW.sla_resolution_at := NEW.sla_resolution_at + make_interval(secs => GREATEST(v_pause_secs,0));
    END IF;
    IF NEW.next_customer_update_due_at IS NOT NULL THEN
      NEW.next_customer_update_due_at := NEW.next_customer_update_due_at + make_interval(secs => GREATEST(v_pause_secs,0));
    END IF;
    NEW.sla_status := 'on_track';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_sla_pause_on_status ON public.tickets;
CREATE TRIGGER trg_tickets_sla_pause_on_status
  BEFORE UPDATE OF status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_tickets_sla_pause_on_status();

-- 10) Tentativa segura de marcar statuses conhecidos como pausadores (apenas exatos).
UPDATE public.ticket_statuses
   SET pauses_sla = true,
       sla_pause_reason = COALESCE(sla_pause_reason, 'Aguarda cliente')
 WHERE pauses_sla IS NOT TRUE
   AND name IN ('Aguarda cliente','Aguardando cliente','Aguardando informação');

UPDATE public.ticket_statuses
   SET pauses_sla = true,
       sla_pause_reason = COALESCE(sla_pause_reason, 'Aguarda fornecedor')
 WHERE pauses_sla IS NOT TRUE
   AND name IN ('Aguarda fornecedor','Aguardando fornecedor');
