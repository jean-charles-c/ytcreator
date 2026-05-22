## Constat

Le désordre se trouve uniquement dans l'association **titre ↔ texte** des scènes legacy. Les `shots` (et leurs `image_url`) ont été générés à partir du `source_text` de chaque scène — ils sont donc visuellement cohérents avec le contenu, c'est le **titre affiché** (et le `scene_context`) qui pointe vers la mauvaise voiture.

Exemple : scène 9 → `source_text` parle bien de Pagani Huayra, et les visuels Kie associés sont des Pagani. Mais `title` = « L'Horloge à 150 000 Euros » (Bentley) et `scene_context.contexte_scene` contient « Chapitre 4 — Bentley… ». Quand on régénère un prompt, l'IA reçoit ce contexte Bentley et part en hors-piste.

## Cause racine (rappel)

`supabase/functions/send-narrative-to-segmentation/index.ts` ligne 112 trie les `narrative_scenes` par `scene_order` seul, ce qui entrelace les chapitres et désaligne ensuite les `rows.title` vs `rows.source_text` recomposés dans `projects.narration`.

## Correctif en deux temps, sans perte de visuels

### 1. Fix permanent de l'edge function (pour les futurs projets NFG)

`supabase/functions/send-narrative-to-segmentation/index.ts` :

- Après le chargement de `chapters` et `scenesRaw`, **trier en mémoire** `sourceScenes` par `chapterById.get(s.chapter_id).chapter_order` puis `s.scene_order` avant le filtre `validated_only` et le `map`.
- Aucun autre changement (idx, recomposition narration, insert) : tout suit automatiquement.

### 2. Réparation **in-place** du projet "La Facture Secrète"

Création d'une **migration SQL** qui, pour ce `project_id`, ré-aligne chaque `scenes` row sur le bon `narrative_scenes` :

1. Pour chaque `scenes` row du projet, retrouver le `narrative_scenes` correspondant par **match exact ou fuzzy** sur les ~120 premiers caractères normalisés de `source_text` (les contenus ont été insérés tels quels, donc le match est fiable).
2. Mettre à jour **uniquement** `scenes.title`, `scenes.scene_context`, `scenes.visual_intention`, `scenes.narrative_action`, `scenes.characters`, `scenes.location` avec les valeurs issues du `narrative_scenes` correctement apparié + son `narrative_chapters` parent.
3. **Ne pas toucher** à `source_text`, `source_text_fr`, `scene_order`, ni aux `shots`. Les `image_url`, `prompt_export`, `image_engine` sont préservés.
4. En complément, réécrire `projects.narration` en concaténant les `scenes` dans leur ordre actuel mais avec les titres corrigés (utile pour `analyze-context` et la parité ScriptCreator).

### 3. Effets secondaires à valider après la migration

- Les `prompt_export` restent valides (générés à partir du `source_text`, inchangé).
- Le `scene_context` corrigé (« Chapitre 3 — Pagani… ») améliorera la regénération individuelle d'un prompt (`regenerate-shot`) : plus de fuite Bentley dans la scène Pagani.
- Aucune resynchronisation Whisper/VO requise (les durées et l'audio dépendent du `source_text`, inchangé).

## Hors-scope

- Pas de suppression de `shots`, pas de réimport depuis l'historique NFG.
- Pas de toucher au pipeline VisualPrompts ni à `regenerate-shot` côté code.
- Si le matching fuzzy échoue pour une ou deux scènes marginales (texte trop court ou édité manuellement), la migration les listera dans un `RAISE NOTICE` et laissera ces lignes inchangées — vous pourrez corriger leur titre à la main dans l'éditeur.
