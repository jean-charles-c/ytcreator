ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS narrative_action text DEFAULT null,
  ADD COLUMN IF NOT EXISTS characters text DEFAULT null,
  ADD COLUMN IF NOT EXISTS location text DEFAULT null,
  ADD COLUMN IF NOT EXISTS scene_type text DEFAULT null,
  ADD COLUMN IF NOT EXISTS continuity text DEFAULT null;