---
name: Entity Isolation (anti-contamination)
description: Prevents AI from mentioning recurring objects/brands from other scenes in a shot's prompt_export
type: feature
---
Anti-contamination des prompts visuels :
- `generate-storyboard` et `regenerate-shot` : injection de la règle `ENTITY_ISOLATION_RULE` (depuis `_shared/identity-lock-utils.ts`).
- `generate-storyboard` : plus de bloc global d'objets récurrents. Chaque scène reçoit son propre bloc filtré via `filterRecurringObjectsForScene` (mentions_scenes + match texte sur source_text + scene_context.objets_associes).
- UI (`ShotCard.tsx`) : `detectForeignEntities` scanne `prompt_export` côté client à partir de `allObjects` + `sceneOrder`. Si une entité étrangère est trouvée, badge ⚠️ orange + bouton "Nettoyer" qui supprime les phrases contenant le token étranger.
- Tokens stopword-filtrés (atelier, studio, salle, showroom…) pour éviter les faux positifs.
- Aucune migration DB : la détection est purement runtime/client.