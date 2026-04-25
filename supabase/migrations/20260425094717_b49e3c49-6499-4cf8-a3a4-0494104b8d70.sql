-- Fix Kie.ai endpoint paths: all market models use /jobs/createTask, MJ keeps /mj/generate
UPDATE public.kie_pricing
SET endpoint_path = '/jobs/createTask'
WHERE endpoint_path = '/playground/createTask';

-- Drop GPT Image 1 (gpt-4o-image) — no longer in Kie market lineup; keep GPT Image 2
DELETE FROM public.kie_pricing WHERE model_id = 'gpt-4o-image';

-- Drop Flux Dev / Flux Pro 1.1 — no longer in Kie market lineup; will be replaced by flux-2 family
DELETE FROM public.kie_pricing WHERE model_id IN ('flux-dev', 'flux-pro-1.1');

-- Insert Flux-2 (current Kie offering)
INSERT INTO public.kie_pricing (model_id, model_label, quality, price_usd, supports_oref, supports_sref, endpoint_path, is_active)
VALUES
  ('flux-2-flex', 'Flux 2 Flex', '1K', 0.030, false, false, '/jobs/createTask', true),
  ('flux-2-flex', 'Flux 2 Flex', '2K', 0.060, false, false, '/jobs/createTask', true),
  ('flux-2-pro',  'Flux 2 Pro',  '1K', 0.050, false, false, '/jobs/createTask', true),
  ('flux-2-pro',  'Flux 2 Pro',  '2K', 0.100, false, false, '/jobs/createTask', true)
ON CONFLICT (model_id, quality) DO NOTHING;