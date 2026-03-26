-- Delete video_prompts linked to shots from false scenes first
DELETE FROM public.video_prompts
WHERE source_shot_id::uuid IN (
  SELECT id FROM public.shots WHERE scene_id IN (
    'a3866d93-9eab-40db-9c4b-525e1e240625',
    '61fda57f-da4d-4953-9ddf-ca70974be000',
    '01e7c98e-35c1-49c5-a4da-18e15327f7c4',
    '2a64b8a7-556d-4336-871d-4d18e942322d',
    '5cca74a2-0c62-465c-8332-809277a2d834',
    '05351b17-2b39-467d-81d1-2345d1c23cba',
    '5b6410fd-2aea-424e-96fa-eb7a8cf3c756'
  )
);

-- Delete shots belonging to false scenes (27-33)
DELETE FROM public.shots
WHERE scene_id IN (
  'a3866d93-9eab-40db-9c4b-525e1e240625',
  '61fda57f-da4d-4953-9ddf-ca70974be000',
  '01e7c98e-35c1-49c5-a4da-18e15327f7c4',
  '2a64b8a7-556d-4336-871d-4d18e942322d',
  '5cca74a2-0c62-465c-8332-809277a2d834',
  '05351b17-2b39-467d-81d1-2345d1c23cba',
  '5b6410fd-2aea-424e-96fa-eb7a8cf3c756'
);

-- Delete the false scenes themselves (27-33)
DELETE FROM public.scenes
WHERE id IN (
  'a3866d93-9eab-40db-9c4b-525e1e240625',
  '61fda57f-da4d-4953-9ddf-ca70974be000',
  '01e7c98e-35c1-49c5-a4da-18e15327f7c4',
  '2a64b8a7-556d-4336-871d-4d18e942322d',
  '5cca74a2-0c62-465c-8332-809277a2d834',
  '05351b17-2b39-467d-81d1-2345d1c23cba',
  '5b6410fd-2aea-424e-96fa-eb7a8cf3c756'
);