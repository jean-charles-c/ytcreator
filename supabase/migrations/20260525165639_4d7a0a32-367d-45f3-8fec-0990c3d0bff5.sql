
-- Ownership checks for vo-audio (paths: ${user.id}/...)
DROP POLICY IF EXISTS "Users can delete own VO audio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload VO audio" ON storage.objects;

CREATE POLICY "Users can delete own VO audio files"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'vo-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can upload own VO audio"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vo-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own VO audio"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'vo-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'vo-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Ownership checks for music-audio (paths: ${userId}/...)
DROP POLICY IF EXISTS "Auth users can delete own music" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload music" ON storage.objects;

CREATE POLICY "Auth users can delete own music"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'music-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Auth users can upload own music"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'music-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Auth users can update own music"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'music-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'music-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
