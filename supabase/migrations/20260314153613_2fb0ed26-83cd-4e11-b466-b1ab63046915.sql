-- Create scenes table
CREATE TABLE public.scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_text TEXT NOT NULL,
  visual_intention TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

-- RLS: users can only access scenes belonging to their projects
CREATE POLICY "Users can view scenes of their projects"
  ON public.scenes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can insert scenes to their projects"
  ON public.scenes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can update scenes of their projects"
  ON public.scenes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can delete scenes of their projects"
  ON public.scenes FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));

-- Index for fast lookup
CREATE INDEX idx_scenes_project_id ON public.scenes(project_id, scene_order);

-- Timestamp trigger
CREATE TRIGGER update_scenes_updated_at
  BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();