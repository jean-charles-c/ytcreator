ALTER TABLE public.pitch_batches
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS item_count integer;