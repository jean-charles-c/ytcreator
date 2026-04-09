

# Régénération automatique des prompts après split/merge/delete

## Problème identifié

Quand on scinde (split), fusionne (merge) ou supprime un shot, seul le champ `source_sentence` est mis à jour. Les champs `description` et `prompt_export` restent inchangés (ou hérités de l'ancien shot). Résultat : des descriptions de type fallback ("Description visuelle du segment narratif...") persistent même après avoir cliqué sur "Générer tous les prompts", car ces opérations se font *après* la génération.

## Solution

Après chaque opération de split, merge ou delete, déclencher automatiquement une régénération du prompt pour les shots affectés via un appel à `generate-storyboard` en mode `prompt_only` ciblé sur la scène concernée.

## Changements

### 1. `src/pages/Editor.tsx` — Nouvelle fonction utilitaire

Créer une fonction `regeneratePromptsForScene(sceneId: string)` qui appelle la edge function `generate-storyboard` avec `{ project_id, scene_id, prompt_only: true }`. Cette fonction sera appelée à la fin des handlers `handleShotMerge`, `handleShotSplit` et `handleShotDelete`, après la mise à jour locale du state.

### 2. `handleShotMerge` (ligne ~1226)

Après le toast de succès, appeler `regeneratePromptsForScene(shot.scene_id)` pour que le shot fusionné obtienne une description riche correspondant à son nouveau texte combiné.

### 3. `handleShotSplit` (ligne ~1295)

Après le toast de succès, appeler `regeneratePromptsForScene(shot.scene_id)` pour que les deux shots issus de la scission obtiennent chacun une description riche.

### 4. `handleShotDelete` (dans le handler de suppression existant)

Après la redistribution du texte, appeler `regeneratePromptsForScene(scene.id)` pour que les shots restants aient des descriptions cohérentes avec leur nouveau texte.

### 5. Feedback utilisateur

Afficher un toast informatif "Régénération des prompts visuels en cours..." pendant l'appel, puis "Prompts visuels mis à jour" au retour. En cas d'erreur, afficher un avertissement non bloquant (le split/merge reste valide, seuls les prompts n'ont pas été mis à jour).

### 6. Rafraîchissement des shots

Après le retour de l'appel `prompt_only`, recharger les shots de la scène depuis la DB pour mettre à jour `description`, `prompt_export`, `shot_type` et `guardrails` dans le state local.

## Résumé

| Fichier | Modification |
|---------|-------------|
| `src/pages/Editor.tsx` | Ajout `regeneratePromptsForScene()` + appel après merge/split/delete |

Aucune modification de la edge function n'est nécessaire — le mode `prompt_only` avec `scene_id` fonctionne déjà correctement pour cibler une seule scène.

