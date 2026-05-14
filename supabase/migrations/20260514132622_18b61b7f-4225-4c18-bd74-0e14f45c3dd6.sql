ALTER TABLE public.video_generations
  DROP CONSTRAINT IF EXISTS video_generations_provider_check;

ALTER TABLE public.video_generations
  ADD CONSTRAINT video_generations_provider_check
  CHECK (provider IN (
    'kling',
    'runway_gen3',
    'runway_gen4',
    'luma',
    'stock_pexels',
    'stock_pixabay'
  ));