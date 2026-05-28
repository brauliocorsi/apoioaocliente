-- Phase 3: ticket as the center — operational next-action fields (additive, nullable, retrocompatible)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS next_action text NULL,
  ADD COLUMN IF NOT EXISTS next_action_due_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_next_action_due_at
  ON public.tickets (next_action_due_at)
  WHERE next_action_due_at IS NOT NULL;