
-- Fase 8: Feriados portugueses + recálculo aditivo das funções de calendário

CREATE TABLE IF NOT EXISTS public.business_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  country text NOT NULL DEFAULT 'PT',
  region text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique por (data, país, região-ou-vazio)
CREATE UNIQUE INDEX IF NOT EXISTS business_holidays_unique_idx
  ON public.business_holidays (holiday_date, country, COALESCE(region, ''));

CREATE INDEX IF NOT EXISTS business_holidays_active_date_idx
  ON public.business_holidays (holiday_date) WHERE is_active = true;

-- GRANTs (auth-only: política só permite leitura a agentes, escrita a supervisores)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_holidays TO authenticated;
GRANT ALL ON public.business_holidays TO service_role;

ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_holidays_select ON public.business_holidays;
CREATE POLICY business_holidays_select ON public.business_holidays
  FOR SELECT TO authenticated
  USING (public.is_authenticated_agent());

DROP POLICY IF EXISTS business_holidays_insert ON public.business_holidays;
CREATE POLICY business_holidays_insert ON public.business_holidays
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'::public.app_role));

DROP POLICY IF EXISTS business_holidays_update ON public.business_holidays;
CREATE POLICY business_holidays_update ON public.business_holidays
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role));

DROP POLICY IF EXISTS business_holidays_delete ON public.business_holidays;
CREATE POLICY business_holidays_delete ON public.business_holidays
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role));

CREATE TRIGGER trg_business_holidays_updated_at
  BEFORE UPDATE ON public.business_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Função auxiliar: feriado nacional ativo
CREATE OR REPLACE FUNCTION public.is_pt_national_holiday(_d date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_holidays
    WHERE holiday_date = _d
      AND is_active = true
      AND country = 'PT'
      AND region IS NULL
  )
$$;

-- Atualizar is_business_day_lx para considerar feriados ativos.
-- Passa de IMMUTABLE para STABLE (depende de tabela).
CREATE OR REPLACE FUNCTION public.is_business_day_lx(_d date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(DOW FROM _d)::int <> 0
     AND NOT public.is_pt_national_holiday(_d)
$$;

-- Recriar funções de calendário como STABLE (dependem de is_business_day_lx que agora é STABLE)
CREATE OR REPLACE FUNCTION public.next_business_window_start(_ts timestamp with time zone)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
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
    v_local := ((v_date + 1) + time '08:00')::timestamp;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.add_business_hours(_start timestamp with time zone, _hours numeric)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
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
    v_cur := public.next_business_window_start(v_end_ts + interval '1 second');
  END LOOP;
  RETURN v_cur;
END $function$;

CREATE OR REPLACE FUNCTION public.business_minutes_between(_start timestamp with time zone, _end timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
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
END $function$;
