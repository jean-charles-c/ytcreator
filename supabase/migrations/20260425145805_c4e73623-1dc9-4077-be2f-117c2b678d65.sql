
ALTER TABLE public.narrative_scenes
  ADD COLUMN IF NOT EXISTS outline_id uuid,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS narrative_role text,
  ADD COLUMN IF NOT EXISTS dominant_emotion text,
  ADD COLUMN IF NOT EXISTS characters jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS objects jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transition_to_next text,
  ADD COLUMN IF NOT EXISTS voice_over_text text,
  ADD COLUMN IF NOT EXISTS validated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS generation_index integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_narrative_scenes_chapter_order
  ON public.narrative_scenes (chapter_id, scene_order);

CREATE INDEX IF NOT EXISTS idx_narrative_scenes_outline
  ON public.narrative_scenes (outline_id);
