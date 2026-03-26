
-- ══════════════════════════════════════════════════════════════
-- Table: external_uploads — manually uploaded images (not from script)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.external_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.external_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own external uploads"
  ON public.external_uploads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own external uploads"
  ON public.external_uploads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own external uploads"
  ON public.external_uploads FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own external uploads"
  ON public.external_uploads FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- Table: video_generations — each generation attempt for a visual
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.video_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Source reference: either a shot id (gallery) or an external_upload id
  source_type TEXT NOT NULL DEFAULT 'gallery' CHECK (source_type IN ('gallery', 'external_upload')),
  source_shot_id UUID REFERENCES public.shots(id) ON DELETE SET NULL,
  source_upload_id UUID REFERENCES public.external_uploads(id) ON DELETE SET NULL,
  source_image_url TEXT NOT NULL,
  -- Provider & generation params
  provider TEXT NOT NULL DEFAULT 'kling' CHECK (provider IN ('kling', 'runway_gen3', 'runway_gen4', 'luma')),
  prompt_used TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  duration_sec INTEGER NOT NULL DEFAULT 5,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  -- Status & results
  status TEXT NOT NULL DEFAULT 'not_generated' CHECK (status IN ('not_generated', 'pending', 'processing', 'completed', 'error')),
  result_video_url TEXT,
  result_thumbnail_url TEXT,
  error_message TEXT,
  provider_job_id TEXT,
  -- Metrics
  generation_time_ms INTEGER,
  estimated_cost_usd NUMERIC(8, 4),
  provider_metadata JSONB DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.video_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video generations"
  ON public.video_generations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own video generations"
  ON public.video_generations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own video generations"
  ON public.video_generations FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own video generations"
  ON public.video_generations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Index for fast lookups by source
CREATE INDEX idx_video_generations_source_shot ON public.video_generations(source_shot_id) WHERE source_shot_id IS NOT NULL;
CREATE INDEX idx_video_generations_source_upload ON public.video_generations(source_upload_id) WHERE source_upload_id IS NOT NULL;
CREATE INDEX idx_video_generations_project ON public.video_generations(project_id);
CREATE INDEX idx_video_generations_status ON public.video_generations(status);
