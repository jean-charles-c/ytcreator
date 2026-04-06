
CREATE TABLE public.custom_pronunciations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phrase TEXT NOT NULL,
  pronunciation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_pronunciations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pronunciations" ON public.custom_pronunciations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own pronunciations" ON public.custom_pronunciations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pronunciations" ON public.custom_pronunciations
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own pronunciations" ON public.custom_pronunciations
  FOR DELETE TO authenticated USING (user_id = auth.uid());
