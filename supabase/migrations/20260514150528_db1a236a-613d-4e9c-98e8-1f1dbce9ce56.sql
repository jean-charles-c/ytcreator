UPDATE public.shots
SET prompt_export = regexp_replace(
  prompt_export,
  ',\s*[^,"]+illustrant\s*:\s*"[^"]*"\.',
  '. Cinematic shot of the scene.',
  'g'
)
WHERE prompt_export ILIKE '%illustrant : %';