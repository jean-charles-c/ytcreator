ALTER TABLE public.narrative_analyses ADD COLUMN IF NOT EXISTS project_id uuid;
CREATE INDEX IF NOT EXISTS idx_narrative_analyses_project_id ON public.narrative_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_narrative_analyses_user_project ON public.narrative_analyses(user_id, project_id, created_at DESC);