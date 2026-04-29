-- 1) Nettoyage préventif global : supprime tout doublon résiduel sur l'ensemble des projets
DELETE FROM public.shots WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY scene_id, shot_order ORDER BY created_at ASC, id ASC) AS rn
    FROM public.shots
  ) ranked WHERE rn > 1
);

-- 2) Contrainte d'unicité DEFERRABLE pour autoriser les renumérotations transitoires
ALTER TABLE public.shots
  ADD CONSTRAINT shots_scene_id_shot_order_unique
  UNIQUE (scene_id, shot_order)
  DEFERRABLE INITIALLY DEFERRED;