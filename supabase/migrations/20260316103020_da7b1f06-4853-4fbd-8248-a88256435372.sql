ALTER TABLE public.favorite_voice_profile
  ADD COLUMN IF NOT EXISTS volume_gain_db real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effects_profile_id text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS pause_between_paragraphs integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS pause_after_sentences integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sentence_start_boost integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sentence_end_slow integer NOT NULL DEFAULT 0;