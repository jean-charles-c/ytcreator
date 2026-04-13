-- Per-scene VO audio storage for targeted regeneration
CREATE TABLE IF NOT EXISTS public.scene_vo_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  duration_seconds NUMERIC,
  sample_rate INTEGER DEFAULT 24000,
  scene_order INTEGER NOT NULL,
  voice_name TEXT,
  speaking_rate NUMERIC,
  text_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, scene_id)
);

ALTER TABLE public.scene_vo_audio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scene audio"
  ON public.scene_vo_audio FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);