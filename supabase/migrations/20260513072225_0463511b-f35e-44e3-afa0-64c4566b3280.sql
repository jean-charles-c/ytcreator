-- Cache table for search-reference-images-v2
CREATE TABLE IF NOT EXISTS public.image_search_cache (
  query_hash         text PRIMARY KEY,
  query_text         text NOT NULL,
  validated_images   jsonb NOT NULL,
  source_breakdown   jsonb,
  enriched_query     jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

ALTER TABLE public.image_search_cache ENABLE ROW LEVEL SECURITY;

-- No public policies: only service_role (Edge Function) reads/writes.

CREATE INDEX IF NOT EXISTS idx_image_search_cache_expires_at
  ON public.image_search_cache(expires_at);