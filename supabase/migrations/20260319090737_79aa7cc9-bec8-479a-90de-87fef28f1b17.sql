
-- Music history table
CREATE TABLE public.music_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer DEFAULT 0,
  duration_seconds integer DEFAULT 30,
  prompt text NOT NULL,
  genre text,
  mood text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.music_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own music" ON public.music_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own music" ON public.music_history
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own music" ON public.music_history
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Music settings persistence table
CREATE TABLE public.music_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  prompt text DEFAULT '',
  duration_seconds integer DEFAULT 30,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.music_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own music settings" ON public.music_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own music settings" ON public.music_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own music settings" ON public.music_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Storage bucket for music files
INSERT INTO storage.buckets (id, name, public) VALUES ('music-audio', 'music-audio', true);

-- Storage RLS for music-audio bucket
CREATE POLICY "Auth users can upload music" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'music-audio');

CREATE POLICY "Auth users can read music" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'music-audio');

CREATE POLICY "Auth users can delete own music" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'music-audio');

CREATE POLICY "Public can read music" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'music-audio');
