
ALTER TABLE public.tickets ADD COLUMN resolution_type text;
ALTER TABLE public.tickets ADD COLUMN resolution_reason text;
ALTER TABLE public.tickets ADD COLUMN resolution_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN resolution_by uuid;
