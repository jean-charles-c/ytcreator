
ALTER TABLE public.favorite_voice_profile
  ADD COLUMN IF NOT EXISTS profile_name text NOT NULL DEFAULT 'Mon profil',
  ADD COLUMN IF NOT EXISTS voice_name text NOT NULL DEFAULT '';

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.favorite_voice_profile'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.favorite_voice_profile'::regclass AND attname = 'user_id');
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.favorite_voice_profile DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;
