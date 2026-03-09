ALTER TABLE public.email_logs 
ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'accepted',
ADD COLUMN IF NOT EXISTS delivery_details text NULL,
ADD COLUMN IF NOT EXISTS smtp_response text NULL;