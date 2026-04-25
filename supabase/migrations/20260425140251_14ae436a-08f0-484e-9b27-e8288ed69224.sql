-- Étape 10 — Enrichissement des story_pitches pour pitchs détaillés
ALTER TABLE public.story_pitches
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS concept text,
  ADD COLUMN IF NOT EXISTS point_of_view text,
  ADD COLUMN IF NOT EXISTS central_tension text,
  ADD COLUMN IF NOT EXISTS narrative_promise text,
  ADD COLUMN IF NOT EXISTS progression text,
  ADD COLUMN IF NOT EXISTS twists jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dominant_emotion text,
  ADD COLUMN IF NOT EXISTS form_compliance_justification text;

CREATE INDEX IF NOT EXISTS idx_pitch_batches_user_created
  ON public.pitch_batches (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_pitches_batch_order
  ON public.story_pitches (pitch_batch_id, pitch_order);

-- Trigger updated_at sur story_pitches (s'il n'existe pas déjà)
DROP TRIGGER IF EXISTS trg_story_pitches_updated_at ON public.story_pitches;
CREATE TRIGGER trg_story_pitches_updated_at
  BEFORE UPDATE ON public.story_pitches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pitch_batches_updated_at ON public.pitch_batches;
CREATE TRIGGER trg_pitch_batches_updated_at
  BEFORE UPDATE ON public.pitch_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();