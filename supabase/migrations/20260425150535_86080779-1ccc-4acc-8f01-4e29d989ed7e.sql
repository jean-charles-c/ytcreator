
ALTER TABLE public.voiceover_scripts
  ADD COLUMN IF NOT EXISTS pitch_id uuid,
  ADD COLUMN IF NOT EXISTS form_id uuid,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS generation_index integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_voiceover_scripts_project ON public.voiceover_scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_voiceover_scripts_outline ON public.voiceover_scripts(outline_id);
