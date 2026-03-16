
CREATE TABLE public.research_dossiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  angle TEXT,
  depth TEXT NOT NULL DEFAULT 'very deep',
  instructions TEXT,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.research_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own research dossiers"
  ON public.research_dossiers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own research dossiers"
  ON public.research_dossiers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own research dossiers"
  ON public.research_dossiers FOR DELETE TO authenticated
  USING (user_id = auth.uid());
