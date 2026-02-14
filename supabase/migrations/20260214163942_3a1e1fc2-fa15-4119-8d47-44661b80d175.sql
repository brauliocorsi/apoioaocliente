
-- Create storage bucket for email assets
INSERT INTO storage.buckets (id, name, public) VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Email assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');

-- Supervisors can upload
CREATE POLICY "Supervisors can upload email assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'email-assets');
