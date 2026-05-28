UPDATE public.shots
SET description = '[À régénérer]',
    prompt_export = NULL,
    guardrails = NULL
WHERE id = 'd7de7c36-b97d-4314-be18-c54d8f03e9c7';

UPDATE public.project_scriptcreator_state
SET global_context = jsonb_set(
  global_context,
  '{objets_recurrents}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN obj->>'nom' = 'Carbone Apparent / Blue Royal Carbon' THEN
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  obj,
                  '{nom}',
                  to_jsonb('Blue Royal Carbon (Bugatti)'::text)
                ),
                '{mentions_scenes}',
                '[32, 33, 34]'::jsonb
              ),
              '{identity_prompt}',
              to_jsonb(regexp_replace(
                COALESCE(obj->>'identity_prompt', ''),
                'Carbone Apparent\s*/\s*',
                '',
                'gi'
              ))
            ),
            '{description_visuelle}',
            to_jsonb(regexp_replace(
              COALESCE(obj->>'description_visuelle', ''),
              'Carbone Apparent\s*/\s*',
              '',
              'gi'
            ))
          )
        ELSE obj
      END
    )
    FROM jsonb_array_elements(global_context->'objets_recurrents') AS obj
  )
)
WHERE project_id = '13993aa0-a35f-4827-bcb6-4b0224a773ba'
  AND global_context->'objets_recurrents' IS NOT NULL;