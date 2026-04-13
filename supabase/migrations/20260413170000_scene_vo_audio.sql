-- Per-scene VO audio storage for targeted regeneration
CREATE TABLE scene_vo_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  duration_seconds NUMERIC,
  sample_rate INTEGER DEFAULT 24000,
  scene_order INTEGER NOT NULL,
  voice_name TEXT,
  speaking_rate NUMERIC,
  text_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, scene_id)
);

ALTER TABLE scene_vo_audio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scene audio"
  ON scene_vo_audio FOR ALL
  USING (auth.uid() = user_id);
