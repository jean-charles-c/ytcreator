CREATE POLICY "Authenticated users can update reference images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'reference-images')
WITH CHECK (bucket_id = 'reference-images');