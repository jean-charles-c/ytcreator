-- Create shots table
CREATE TABLE public.shots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  shot_order INTEGER NOT NULL,
  shot_type TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_export TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shots of their projects"
  ON public.shots FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = shots.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can insert shots to their projects"
  ON public.shots FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = shots.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can update shots of their projects"
  ON public.shots FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = shots.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can delete shots of their projects"
  ON public.shots FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = shots.project_id AND projects.user_id = auth.uid()));

CREATE INDEX idx_shots_scene_id ON public.shots(scene_id, shot_order);
CREATE INDEX idx_shots_project_id ON public.shots(project_id);

CREATE TRIGGER update_shots_updated_at
  BEFORE UPDATE ON public.shots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();