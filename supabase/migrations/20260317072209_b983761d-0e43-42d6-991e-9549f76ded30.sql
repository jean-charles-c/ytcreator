INSERT INTO storage.buckets (id, name, public) VALUES ('video-exports', 'video-exports', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload video exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'video-exports');

CREATE POLICY "Authenticated users can read own video exports"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'video-exports');

CREATE POLICY "Authenticated users can delete own video exports"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'video-exports');

CREATE POLICY "Public read access for video exports"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'video-exports');