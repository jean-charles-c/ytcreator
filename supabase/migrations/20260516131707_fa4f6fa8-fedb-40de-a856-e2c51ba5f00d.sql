WITH rebuilt AS (
  SELECT
    s.project_id,
    jsonb_build_object(
      'method', 'semantic',
      'lastUpdatedAt', now()::text,
      'chapters', jsonb_agg(
        jsonb_build_object(
          'id', 'scene_chapter_' || s.scene_order::text,
          'index', s.scene_order - 1,
          'sectionType', NULL,
          'startSentence', left(regexp_replace(split_part(coalesce(nullif(s.source_text_fr, ''), s.source_text, s.title), '.', 1), '\s+', ' ', 'g'), 120),
          'summary', '',
          'title', s.title,
          'variants', '[]'::jsonb,
          'titleFR', NULL,
          'validated', false,
          'sourceText', coalesce(nullif(s.source_text_fr, ''), s.source_text, s.title)
        )
        ORDER BY s.scene_order
      )
    ) AS chapter_state
  FROM public.scenes s
  WHERE s.project_id = 'f0692eb6-fd59-4d8a-803f-519a17a0e21b'
  GROUP BY s.project_id
)
UPDATE public.project_scriptcreator_state pcs
SET timeline_state = jsonb_set(
  coalesce(pcs.timeline_state, '{}'::jsonb),
  '{chapterState}',
  rebuilt.chapter_state,
  true
),
updated_at = now()
FROM rebuilt
WHERE pcs.project_id = rebuilt.project_id;