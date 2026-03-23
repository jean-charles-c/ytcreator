
-- Video settings profiles
CREATE TABLE public.video_settings_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Standard Cinematic',
  duration_sec integer NOT NULL DEFAULT 5,
  aspect_ratio text NOT NULL DEFAULT '16:9',
  style text NOT NULL DEFAULT 'cinematic',
  camera_movement text NOT NULL DEFAULT 'static',
  scene_motion text NOT NULL DEFAULT 'moderate',
  mood text NOT NULL DEFAULT '',
  render_constraints text NOT NULL DEFAULT '',
  negative_prompt text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_settings_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video settings profiles" ON public.video_settings_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own video settings profiles" ON public.video_settings_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own video settings profiles" ON public.video_settings_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own video settings profiles" ON public.video_settings_profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Video prompts
CREATE TABLE public.video_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  source_shot_id text,
  source_scene_id text,
  display_order integer NOT NULL DEFAULT 1,
  prompt text NOT NULL DEFAULT '',
  negative_prompt text NOT NULL DEFAULT '',
  narrative_fragment text NOT NULL DEFAULT '',
  scene_title text NOT NULL DEFAULT '',
  duration_sec integer NOT NULL DEFAULT 5,
  aspect_ratio text NOT NULL DEFAULT '16:9',
  style text NOT NULL DEFAULT 'cinematic',
  camera_movement text NOT NULL DEFAULT 'static',
  scene_motion text NOT NULL DEFAULT 'moderate',
  mood text NOT NULL DEFAULT '',
  render_constraints text NOT NULL DEFAULT '',
  profile_id uuid REFERENCES public.video_settings_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  is_manually_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video prompts" ON public.video_prompts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own video prompts" ON public.video_prompts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own video prompts" ON public.video_prompts FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own video prompts" ON public.video_prompts FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Video prompt variants
CREATE TABLE public.video_prompt_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_id uuid NOT NULL REFERENCES public.video_prompts(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  prompt text NOT NULL DEFAULT '',
  negative_prompt text NOT NULL DEFAULT '',
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_prompt_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video prompt variants" ON public.video_prompt_variants FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own video prompt variants" ON public.video_prompt_variants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own video prompt variants" ON public.video_prompt_variants FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own video prompt variants" ON public.video_prompt_variants FOR DELETE TO authenticated USING (user_id = auth.uid());
