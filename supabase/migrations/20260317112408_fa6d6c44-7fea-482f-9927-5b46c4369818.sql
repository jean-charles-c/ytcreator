ALTER TABLE public.favorite_voice_profile
  ADD COLUMN IF NOT EXISTS pitch real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_after_comma integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS narration_profile text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS dynamic_pause_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_pause_variation integer NOT NULL DEFAULT 300;