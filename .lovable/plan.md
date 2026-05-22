## Décision

Suppression complète du `fallbackPrompt` dans le pipeline. Si l'IA ne renvoie pas un prompt exploitable pour un shot, on laisse `prompt_export = NULL`. L'utilisateur régénérera manuellement via le bouton « Régénérer le prompt » du shot ou « Générer tous les prompts ».

## Changements code

### 1. `supabase/functions/generate-storyboard/index.ts`

- Supprimer la fonction `fallbackPrompt(...)`.
- Dans `buildSegmentShot(...)` (~ligne 500) :
  - Remplacer `baseShot?.prompt_export || fallbackPrompt(segment, scene, shotType)` par `baseShot?.prompt_export ?? null`.
  - Quand `reuseGeneratedContent` est `false` (nouveau shot issu de split / repair / post-split / redistribution), `prompt_export` reste `null`.
- Dans la branche AI principale et la branche `prompt-only` : si l'IA ne renvoie pas de `prompt_export` (ou retourne une string vide / trop courte), inscrire `prompt_export = null` au lieu de fallback.
- Idem pour `description` : si pas de description AI, mettre `null` (au lieu d'un texte template).
- Conséquence souhaitée : la scène/shot apparaîtra comme « incomplet » dans VisualPrompts → `isComplete` la traitera au prochain clic global, conformément à la règle déjà mémorisée *Structural Edits No Auto Prompts*.

### 2. `supabase/functions/regenerate-shot/index.ts`

- Vérifier la même chose : si l'IA échoue, retourner une erreur explicite et **ne pas écrire** un prompt template. Le shot conserve son ancienne valeur (ou `null`).

### 3. Anti-redondance (`supabase/functions/_shared/visual-redundancy-detector.ts` + `generate-storyboard/index.ts` lignes 1324-1335)

- Supprimer toute logique qui s'appuyait sur la présence d'un fallback uniforme (la rotation caméra reste, mais devient le seul mécanisme actif côté backend).
- Conserver `analyzeRedundancy` à titre de **logging** uniquement (pas d'action automatique sur les prompts).

## Réparation du projet « La Facture Secrète »

Migration SQL ciblée :
- Pour tous les shots des scènes 8 à 11 du projet `13993aa0-a35f-4827-bcb6-4b0224a773ba` dont `prompt_export` contient `Rolls-Royce Boat Tail` ou une mention `Lieu :` ne correspondant pas à la `scenes.location` actuelle : `UPDATE shots SET prompt_export = NULL, description = NULL` (les `image_url` et `source_sentence` sont conservés).
- L'utilisateur clique ensuite « Générer tous les prompts » dans VisualPrompts → seuls les shots vides seront repeuplés, avec le bon contexte Bentley / Pagani.

## Hors périmètre

- Pas de modification de la segmentation, du voice-over, du timeline assembly, ni des images déjà générées.
- Pas de migration touchant `source_text`, `scene_order` ou les `shots` autres que le nettoyage de `prompt_export` / `description`.

Validation puis j'enchaîne : suppression du fallback (1, 2, 3) + migration de nettoyage.
