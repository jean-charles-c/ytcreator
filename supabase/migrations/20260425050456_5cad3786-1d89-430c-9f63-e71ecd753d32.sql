-- Enable scheduling extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- 1. KIE PRICING TABLE
-- ============================================
CREATE TABLE public.kie_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id TEXT NOT NULL,
  model_label TEXT NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('1K', '2K', '4K')),
  price_usd NUMERIC(10, 5) NOT NULL DEFAULT 0,
  supports_oref BOOLEAN NOT NULL DEFAULT false,
  supports_sref BOOLEAN NOT NULL DEFAULT false,
  supports_image_input BOOLEAN NOT NULL DEFAULT false,
  endpoint_path TEXT NOT NULL DEFAULT '/playground/createTask',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(model_id, quality)
);

ALTER TABLE public.kie_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read kie pricing"
ON public.kie_pricing
FOR SELECT
TO authenticated
USING (true);

-- Only service role can write (no public INSERT/UPDATE/DELETE policies)
CREATE TRIGGER update_kie_pricing_updated_at
BEFORE UPDATE ON public.kie_pricing
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_kie_pricing_model_active ON public.kie_pricing(model_id, is_active);

-- Seed with default static pricing (will be refreshed daily by cron)
INSERT INTO public.kie_pricing (model_id, model_label, quality, price_usd, supports_oref, supports_sref, supports_image_input, endpoint_path, notes) VALUES
  ('gpt-4o-image', 'GPT Image 1', '1K', 0.04, false, false, true, '/playground/createTask', 'OpenAI GPT-4o image model via Kie'),
  ('gpt-4o-image', 'GPT Image 1', '2K', 0.08, false, false, true, '/playground/createTask', 'OpenAI GPT-4o image model via Kie (HD)'),
  ('gpt-image-2', 'GPT Image 2', '1K', 0.06, false, false, true, '/playground/createTask', 'OpenAI GPT Image 2 next-gen'),
  ('gpt-image-2', 'GPT Image 2', '2K', 0.12, false, false, true, '/playground/createTask', 'OpenAI GPT Image 2 (HD)'),
  ('gpt-image-2', 'GPT Image 2', '4K', 0.24, false, false, true, '/playground/createTask', 'OpenAI GPT Image 2 (Ultra)'),
  ('mj-v7', 'Midjourney v7', '1K', 0.05, true, true, true, '/mj/generate', 'Midjourney v7 with omni-reference (--oref) and style-reference (--sref)'),
  ('mj-v7', 'Midjourney v7', '2K', 0.10, true, true, true, '/mj/generate', 'Midjourney v7 HD upscale'),
  ('flux-pro-1.1', 'Flux Pro 1.1', '1K', 0.04, false, false, true, '/playground/createTask', 'Black Forest Labs Flux Pro'),
  ('flux-pro-1.1', 'Flux Pro 1.1', '2K', 0.08, false, false, true, '/playground/createTask', 'Black Forest Labs Flux Pro HD'),
  ('flux-dev', 'Flux Dev', '1K', 0.01, false, false, true, '/playground/createTask', 'Flux Dev (cheap, fast)'),
  ('ideogram-v3', 'Ideogram v3', '1K', 0.03, false, false, true, '/playground/createTask', 'Best for legible text in images'),
  ('ideogram-v3', 'Ideogram v3', '2K', 0.06, false, false, true, '/playground/createTask', 'Ideogram v3 HD'),
  ('imagen-4', 'Imagen 4', '1K', 0.04, false, false, true, '/playground/createTask', 'Google Imagen 4 photorealistic'),
  ('imagen-4', 'Imagen 4', '2K', 0.08, false, false, true, '/playground/createTask', 'Google Imagen 4 HD'),
  ('grok-imagine', 'Grok Imagine', '1K', 0.07, false, false, true, '/playground/createTask', 'xAI Grok image generation'),
  ('qwen-image', 'Qwen Z-Image', '1K', 0.02, false, false, true, '/playground/createTask', 'Alibaba Qwen image model'),
  ('qwen-image', 'Qwen Z-Image', '2K', 0.04, false, false, true, '/playground/createTask', 'Alibaba Qwen image model HD');

-- ============================================
-- 2. ADD image_engine + image_quality to projects/scenes/shots
-- ============================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS image_engine TEXT,
  ADD COLUMN IF NOT EXISTS image_quality TEXT;

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS image_engine TEXT,
  ADD COLUMN IF NOT EXISTS image_quality TEXT;

ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS image_engine TEXT,
  ADD COLUMN IF NOT EXISTS image_quality TEXT;

COMMENT ON COLUMN public.projects.image_engine IS 'Default image engine for the project (e.g. nano-banana, gpt-image-2, mj-v7). NULL = use Lovable AI Nano Banana default.';
COMMENT ON COLUMN public.projects.image_quality IS 'Default image quality (1K, 2K, 4K). Only relevant for Kie engines.';
COMMENT ON COLUMN public.scenes.image_engine IS 'Override image engine for this scene. NULL = inherit from project.';
COMMENT ON COLUMN public.shots.image_engine IS 'Override image engine for this shot. NULL = inherit from scene/project.';