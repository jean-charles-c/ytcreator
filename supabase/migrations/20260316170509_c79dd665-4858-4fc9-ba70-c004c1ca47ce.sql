-- Add image_url column to shots
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS image_url text;

-- Create storage bucket for shot images
INSERT INTO storage.buckets (id, name, public)
VALUES ('shot-images', 'shot-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to shot-images
CREATE POLICY "Users can upload shot images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shot-images');

-- Allow public read access
CREATE POLICY "Public read shot images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'shot-images');

-- Allow authenticated users to delete their shot images
CREATE POLICY "Users can delete shot images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'shot-images');

-- Allow authenticated users to update their shot images
CREATE POLICY "Users can update shot images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'shot-images');