ALTER TABLE public.project_scriptcreator_state
  ADD COLUMN IF NOT EXISTS narrative_form text,
  ADD COLUMN IF NOT EXISTS intention_note text,
  ADD COLUMN IF NOT EXISTS script_v2_raw text,
  ADD COLUMN IF NOT EXISTS script_v2_revised text,
  ADD COLUMN IF NOT EXISTS v2_enabled boolean DEFAULT false;