
ALTER TABLE public.client_users ADD COLUMN last_seen_at timestamp with time zone DEFAULT now();

-- Allow agents to see last_seen_at (already covered by existing select policy)
-- Allow clients to update their own last_seen_at
