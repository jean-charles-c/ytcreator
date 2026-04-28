-- User-level library of recurring objects/characters/locations with reference images
CREATE TABLE public.recurring_object_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nom text NOT NULL,
  type text NOT NULL DEFAULT 'object',
  description_visuelle text NOT NULL DEFAULT '',
  epoque text NOT NULL DEFAULT '',
  identity_prompt text NOT NULL DEFAULT '',
  reference_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nom, type)
);

CREATE INDEX idx_recurring_object_library_user ON public.recurring_object_library(user_id);

ALTER TABLE public.recurring_object_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own library entries"
ON public.recurring_object_library FOR SELECT
TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own library entries"
ON public.recurring_object_library FOR INSERT
TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own library entries"
ON public.recurring_object_library FOR UPDATE
TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own library entries"
ON public.recurring_object_library FOR DELETE
TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER trg_recurring_object_library_updated_at
BEFORE UPDATE ON public.recurring_object_library
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();