
-- Fix scene 3 shot order: "Octobre 1961..." should be shot 1
UPDATE public.shots SET shot_order = 1 WHERE id = 'e82b1fed-0b64-4773-afea-c909dad7fedd';
UPDATE public.shots SET shot_order = 2 WHERE id = '9b41b461-1762-4669-b116-38b0aa2c1f1f';
UPDATE public.shots SET shot_order = 3 WHERE id = '163e277b-5f3e-499e-961f-049a6c3f859a';
UPDATE public.shots SET shot_order = 4 WHERE id = '12081ee3-3219-4621-b52f-9d0ae4fea4b5';
UPDATE public.shots SET shot_order = 5 WHERE id = '1bd676dc-9e0f-4813-9879-2e68464436eb';
UPDATE public.shots SET shot_order = 6 WHERE id = '7da0daf4-463e-43fc-8522-771f600fce5c';
