
-- 1. Expand app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'client';
