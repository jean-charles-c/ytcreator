
ALTER TABLE public.kie_pricing
  ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'per image',
  ADD COLUMN IF NOT EXISTS kie_slug text;

-- Drop existing duplicates if any to allow unique constraint creation
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY model_id, quality ORDER BY updated_at DESC, created_at DESC) AS rn
  FROM public.kie_pricing
)
DELETE FROM public.kie_pricing WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Add unique constraint for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kie_pricing_model_quality_unique'
  ) THEN
    ALTER TABLE public.kie_pricing
      ADD CONSTRAINT kie_pricing_model_quality_unique UNIQUE (model_id, quality);
  END IF;
END $$;
