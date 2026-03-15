-- Create storage bucket for VO audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('vo-audio', 'vo-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Create VO audio history table
CREATE TABLE IF NOT EXISTS public.vo_audio_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer DEFAULT 0,
  duration_estimate real DEFAULT 0,
  language_code text NOT NULL DEFAULT 'fr-FR',
  voice_gender text NOT NULL DEFAULT 'FEMALE',
  style text DEFAULT 'neutral',
  speaking_rate real DEFAULT 1.0,
  text_length integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.vo_audio_history ENABLE ROW LEVEL SECURITY;

-- RLS: users can only access their own VO audios
CREATE POLICY "Users can view own VO audios"
  ON public.vo_audio_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own VO audios"
  ON public.vo_audio_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own VO audios"
  ON public.vo_audio_history FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Storage RLS: authenticated users can upload to vo-audio
CREATE POLICY "Authenticated users can upload VO audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vo-audio');

CREATE POLICY "Anyone can read VO audio"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'vo-audio');

CREATE POLICY "Users can delete own VO audio files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vo-audio');