
-- Add closed_at and closed_by to phone_calls for finalization tracking
ALTER TABLE public.phone_calls
  ADD COLUMN closed_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN closed_by uuid DEFAULT NULL;
