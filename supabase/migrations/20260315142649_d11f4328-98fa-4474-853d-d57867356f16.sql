CREATE TABLE IF NOT EXISTS public.favorite_voice_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  language_code text NOT NULL DEFAULT 'fr-FR',
  voice_gender text NOT NULL DEFAULT 'FEMALE',
  style text NOT NULL DEFAULT 'neutral',
  speaking_rate real NOT NULL DEFAULT 1.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.favorite_voice_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorite voice"
  ON public.favorite_voice_profile FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own favorite voice"
  ON public.favorite_voice_profile FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own favorite voice"
  ON public.favorite_voice_profile FOR UPDATE
  TO authenticated USING (user_id = auth.uid());