-- 1. Security definer helper to verify ownership of a storage object path
CREATE OR REPLACE FUNCTION public.user_owns_storage_path(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_segment text;
  uid uuid;
  pid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;
  first_segment := split_part(_name, '/', 1);
  IF first_segment IS NULL OR first_segment = '' THEN
    RETURN false;
  END IF;
  BEGIN
    pid := first_segment::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF pid = uid THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.projects WHERE id = pid AND user_id = uid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_storage_path(text) TO authenticated;

-- 2. shot-images: restrict DELETE/UPDATE to owner
DROP POLICY IF EXISTS "Users can delete shot images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update shot images" ON storage.objects;

CREATE POLICY "Users can delete own shot images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'shot-images' AND public.user_owns_storage_path(name));

CREATE POLICY "Users can update own shot images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'shot-images' AND public.user_owns_storage_path(name));

-- 3. video-exports: restrict DELETE to owner
DROP POLICY IF EXISTS "Authenticated users can delete own video exports" ON storage.objects;

CREATE POLICY "Authenticated users can delete own video exports"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'video-exports' AND public.user_owns_storage_path(name));

-- 4. reference-images: restrict DELETE/UPDATE to owner
DROP POLICY IF EXISTS "Authenticated users can delete reference images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update reference images" ON storage.objects;

CREATE POLICY "Authenticated users can delete own reference images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reference-images' AND public.user_owns_storage_path(name));

CREATE POLICY "Authenticated users can update own reference images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'reference-images' AND public.user_owns_storage_path(name));