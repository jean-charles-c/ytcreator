-- ============================================================
-- Narrative Form Generator — Schema
-- ============================================================

-- 1. narrative_sources
CREATE TABLE public.narrative_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  youtube_url TEXT,
  title TEXT,
  channel TEXT,
  duration_seconds INTEGER,
  language TEXT DEFAULT 'fr',
  transcript TEXT,
  transcript_source TEXT NOT NULL DEFAULT 'manual', -- 'auto' | 'manual'
  fetch_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'fetched' | 'manual' | 'failed'
  status TEXT NOT NULL DEFAULT 'source_input', -- 'source_input' | 'sources_ready'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative sources"
  ON public.narrative_sources FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own narrative sources"
  ON public.narrative_sources FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own narrative sources"
  ON public.narrative_sources FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own narrative sources"
  ON public.narrative_sources FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_narrative_sources_user ON public.narrative_sources(user_id);

-- 2. narrative_analyses
CREATE TABLE public.narrative_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  title TEXT,
  summary TEXT,
  structure JSONB DEFAULT '{}'::jsonb,
  patterns JSONB DEFAULT '{}'::jsonb,
  tone JSONB DEFAULT '{}'::jsonb,
  rhythm JSONB DEFAULT '{}'::jsonb,
  writing_rules JSONB DEFAULT '{}'::jsonb,
  recommendations JSONB DEFAULT '{}'::jsonb,
  ai_model TEXT,
  status TEXT NOT NULL DEFAULT 'analysis_in_progress', -- 'analysis_in_progress' | 'analysis_completed' | 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative analyses"
  ON public.narrative_analyses FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own narrative analyses"
  ON public.narrative_analyses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own narrative analyses"
  ON public.narrative_analyses FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own narrative analyses"
  ON public.narrative_analyses FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_narrative_analyses_user ON public.narrative_analyses(user_id);

-- 3. narrative_forms (privées par utilisateur)
CREATE TABLE public.narrative_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  analysis_id UUID REFERENCES public.narrative_analyses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL DEFAULT '',
  narrative_signature JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'narrative_form_saved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative forms"
  ON public.narrative_forms FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own narrative forms"
  ON public.narrative_forms FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own narrative forms"
  ON public.narrative_forms FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own narrative forms"
  ON public.narrative_forms FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_narrative_forms_user ON public.narrative_forms(user_id);
CREATE INDEX idx_narrative_forms_analysis ON public.narrative_forms(analysis_id);

-- 4. pitch_batches
CREATE TABLE public.pitch_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  analysis_id UUID REFERENCES public.narrative_analyses(id) ON DELETE CASCADE,
  form_id UUID REFERENCES public.narrative_forms(id) ON DELETE SET NULL,
  instructions TEXT,
  ai_model TEXT,
  status TEXT NOT NULL DEFAULT 'pitch_batch_generated', -- 'generating' | 'pitch_batch_generated' | 'failed'
  batch_index INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pitch_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pitch batches"
  ON public.pitch_batches FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own pitch batches"
  ON public.pitch_batches FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own pitch batches"
  ON public.pitch_batches FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own pitch batches"
  ON public.pitch_batches FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_pitch_batches_user ON public.pitch_batches(user_id);
CREATE INDEX idx_pitch_batches_analysis ON public.pitch_batches(analysis_id);

-- 5. story_pitches
CREATE TABLE public.story_pitches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pitch_batch_id UUID NOT NULL REFERENCES public.pitch_batches(id) ON DELETE CASCADE,
  pitch_order INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  hook TEXT,
  synopsis TEXT,
  angle TEXT,
  target_audience TEXT,
  tone TEXT,
  estimated_format TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'selected' | 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.story_pitches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own story pitches"
  ON public.story_pitches FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own story pitches"
  ON public.story_pitches FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own story pitches"
  ON public.story_pitches FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own story pitches"
  ON public.story_pitches FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_story_pitches_batch ON public.story_pitches(pitch_batch_id);
CREATE INDEX idx_story_pitches_user ON public.story_pitches(user_id);

-- 6. generated_projects (table de liaison vers projects existants)
CREATE TABLE public.generated_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL, -- pointe vers public.projects.id (pas de FK pour éviter cascade)
  pitch_id UUID REFERENCES public.story_pitches(id) ON DELETE SET NULL,
  analysis_id UUID REFERENCES public.narrative_analyses(id) ON DELETE SET NULL,
  form_id UUID REFERENCES public.narrative_forms(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'project_created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

ALTER TABLE public.generated_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generated projects"
  ON public.generated_projects FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own generated projects"
  ON public.generated_projects FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own generated projects"
  ON public.generated_projects FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own generated projects"
  ON public.generated_projects FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_generated_projects_user ON public.generated_projects(user_id);
CREATE INDEX idx_generated_projects_project ON public.generated_projects(project_id);
CREATE INDEX idx_generated_projects_pitch ON public.generated_projects(pitch_id);

-- 7. narrative_outlines
CREATE TABLE public.narrative_outlines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL, -- pointe vers public.projects.id
  title TEXT,
  intention TEXT,
  target_duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'outline_created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_outlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative outlines"
  ON public.narrative_outlines FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own narrative outlines"
  ON public.narrative_outlines FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own narrative outlines"
  ON public.narrative_outlines FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own narrative outlines"
  ON public.narrative_outlines FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_narrative_outlines_user ON public.narrative_outlines(user_id);
CREATE INDEX idx_narrative_outlines_project ON public.narrative_outlines(project_id);

-- 8. narrative_chapters
CREATE TABLE public.narrative_chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  outline_id UUID NOT NULL REFERENCES public.narrative_outlines(id) ON DELETE CASCADE,
  chapter_order INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  summary TEXT,
  intention TEXT,
  estimated_duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative chapters"
  ON public.narrative_chapters FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own narrative chapters"
  ON public.narrative_chapters FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own narrative chapters"
  ON public.narrative_chapters FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own narrative chapters"
  ON public.narrative_chapters FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_narrative_chapters_outline ON public.narrative_chapters(outline_id);
CREATE INDEX idx_narrative_chapters_user ON public.narrative_chapters(user_id);

-- 9. narrative_scenes
CREATE TABLE public.narrative_scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  chapter_id UUID NOT NULL REFERENCES public.narrative_chapters(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  scene_order INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  visual_intention TEXT,
  scene_context JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'scenes_created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative scenes"
  ON public.narrative_scenes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own narrative scenes"
  ON public.narrative_scenes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own narrative scenes"
  ON public.narrative_scenes FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own narrative scenes"
  ON public.narrative_scenes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_narrative_scenes_chapter ON public.narrative_scenes(chapter_id);
CREATE INDEX idx_narrative_scenes_project ON public.narrative_scenes(project_id);
CREATE INDEX idx_narrative_scenes_user ON public.narrative_scenes(user_id);

-- 10. voiceover_scripts
CREATE TABLE public.voiceover_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  outline_id UUID REFERENCES public.narrative_outlines(id) ON DELETE SET NULL,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  estimated_duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'script_created', -- 'script_created' | 'sent_to_scriptcreator' | 'sent_to_segmentation'
  sent_to_scriptcreator_at TIMESTAMPTZ,
  sent_to_segmentation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voiceover_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voiceover scripts"
  ON public.voiceover_scripts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own voiceover scripts"
  ON public.voiceover_scripts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own voiceover scripts"
  ON public.voiceover_scripts FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own voiceover scripts"
  ON public.voiceover_scripts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_voiceover_scripts_project ON public.voiceover_scripts(project_id);
CREATE INDEX idx_voiceover_scripts_user ON public.voiceover_scripts(user_id);

-- ============================================================
-- Triggers updated_at sur toutes les nouvelles tables
-- (la fonction public.update_updated_at_column existe déjà)
-- ============================================================

CREATE TRIGGER trg_narrative_sources_updated BEFORE UPDATE ON public.narrative_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_narrative_analyses_updated BEFORE UPDATE ON public.narrative_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_narrative_forms_updated BEFORE UPDATE ON public.narrative_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pitch_batches_updated BEFORE UPDATE ON public.pitch_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_story_pitches_updated BEFORE UPDATE ON public.story_pitches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_generated_projects_updated BEFORE UPDATE ON public.generated_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_narrative_outlines_updated BEFORE UPDATE ON public.narrative_outlines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_narrative_chapters_updated BEFORE UPDATE ON public.narrative_chapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_narrative_scenes_updated BEFORE UPDATE ON public.narrative_scenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_voiceover_scripts_updated BEFORE UPDATE ON public.voiceover_scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();