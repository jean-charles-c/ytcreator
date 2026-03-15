ALTER TABLE public.project_scriptcreator_state 
ADD COLUMN IF NOT EXISTS scene_versions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS shot_versions jsonb DEFAULT '[]'::jsonb;