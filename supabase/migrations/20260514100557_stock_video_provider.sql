-- ══════════════════════════════════════════════════════════════
-- Extend video_generations.provider CHECK to allow stock providers.
-- Stock videos imported from Pexels/Pixabay are stored as
-- video_generations rows (status = 'completed') with the CDN URL
-- in result_video_url. The existing export pipeline picks them up
-- automatically when selected_for_export = true.
-- ══════════════════════════════════════════════════════════════

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
