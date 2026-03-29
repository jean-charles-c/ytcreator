
-- Create storage bucket for reference images
INSERT INTO storage.buckets (id, name, public) VALUES ('reference-images', 'reference-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload reference images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reference-images');

-- Allow public read access
CREATE POLICY "Public can view reference images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'reference-images');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete reference images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reference-images');
