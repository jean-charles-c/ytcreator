
-- Create project_groups table
CREATE TABLE public.project_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Nouveau groupe',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add group_id to projects
ALTER TABLE public.projects ADD COLUMN group_id UUID REFERENCES public.project_groups(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.project_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_groups
CREATE POLICY "Users can view own groups" ON public.project_groups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own groups" ON public.project_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own groups" ON public.project_groups FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own groups" ON public.project_groups FOR DELETE TO authenticated USING (auth.uid() = user_id);
