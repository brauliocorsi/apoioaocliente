-- Add Let's Call integration fields to phone_calls
ALTER TABLE public.phone_calls
  ADD COLUMN IF NOT EXISTS letscall_linkedid TEXT,
  ADD COLUMN IF NOT EXISTS letscall_month INTEGER,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS ringing_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS attended BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_recording BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Unique index to make sync idempotent
CREATE UNIQUE INDEX IF NOT EXISTS phone_calls_letscall_linkedid_unique
  ON public.phone_calls(letscall_linkedid)
  WHERE letscall_linkedid IS NOT NULL;

CREATE INDEX IF NOT EXISTS phone_calls_source_idx ON public.phone_calls(source);
CREATE INDEX IF NOT EXISTS phone_calls_direction_idx ON public.phone_calls(direction);

-- Per-agent SIP extension for click-to-call
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS letscall_extension INTEGER;

-- System settings rows for JWT cache (created if missing)
INSERT INTO public.system_settings (key, value)
VALUES ('letscall_jwt', ''), ('letscall_jwt_expires_at', '')
ON CONFLICT (key) DO NOTHING;