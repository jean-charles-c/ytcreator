---
name: Shot Uniqueness Constraint
description: DB enforces UNIQUE(scene_id, shot_order) on shots; deferrable to allow transient renumbering
type: constraint
---
- DB constraint `shots_scene_id_shot_order_unique` UNIQUE(scene_id, shot_order) DEFERRABLE INITIALLY DEFERRED.
- Prevents duplicate shots within a scene (root cause: regenerations inserting without purging).
- `generate-storyboard` MUST: (1) DELETE orphans first, (2) move surviving shots to negative shot_order temporary slots, (3) then UPDATE/INSERT to final order.
- Any new INSERT path on `shots` must guarantee unique (scene_id, shot_order) per scene.
