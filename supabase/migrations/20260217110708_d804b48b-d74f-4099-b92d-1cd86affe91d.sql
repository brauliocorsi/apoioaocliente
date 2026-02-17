ALTER TABLE public.tickets ADD COLUMN resolution_client_reason text;
ALTER TABLE public.resolution_approvals ADD COLUMN proposed_client_reason text;