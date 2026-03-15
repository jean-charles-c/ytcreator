-- Persist ScriptCreator state per project
CREATE TABLE IF NOT EXISTS public.project_scriptcreator_state (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  extracted_text TEXT,
  analysis JSONB,
  doc_structure JSONB,
  generated_script TEXT,
  seo_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_scriptcreator_state ENABLE ROW LEVEL SECURITY;

-- Access limited to the owner of the related project
CREATE POLICY "Users can view scriptcreator state of their projects"
ON public.project_scriptcreator_state
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_scriptcreator_state.project_id
      AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert scriptcreator state of their projects"
ON public.project_scriptcreator_state
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_scriptcreator_state.project_id
      AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update scriptcreator state of their projects"
ON public.project_scriptcreator_state
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_scriptcreator_state.project_id
      AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete scriptcreator state of their projects"
ON public.project_scriptcreator_state
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_scriptcreator_state.project_id
      AND projects.user_id = auth.uid()
  )
);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_project_scriptcreator_state_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_scriptcreator_state_updated_at
ON public.project_scriptcreator_state;

CREATE TRIGGER trg_project_scriptcreator_state_updated_at
BEFORE UPDATE ON public.project_scriptcreator_state
FOR EACH ROW
EXECUTE FUNCTION public.touch_project_scriptcreator_state_updated_at();