## Diagnostic

Dans `src/pages/Editor.tsx`, la logique qui éclate chaque véhicule détecté en 5 variantes (`vue avant`, `vue de côté`, `vue arrière`, `vue habitacle intérieur`, `vue de dessus`) n'existe **que** dans `handleSearchMoreRecurrences` (le bouton « Chercher plus de récurrences », lignes 937–974).

L'analyse contextuelle initiale (`handleReanalyzeContext`, lignes 875–910) — qui est celle déclenchée par défaut dans le tab Segmentation View pour le projet « BUGATTI EB 110 » — applique seulement `applyIdentityTemplates()` sans jamais expanser les véhicules. Résultat : on obtient une seule entrée « Bugatti EB 110 » au lieu des 5 vues attendues.

C'est pourquoi le système multi-vues paraît ne pas fonctionner : il n'est jamais appelé sur le premier passage.

## Plan

1. **Extraire** `VEHICLE_VIEWS` et la boucle d'expansion en helper local dans `Editor.tsx` :
   ```ts
   const expandVehiclesIntoViews = (objects: any[], onlyNewExcluding?: Set<string>) => { … }
   ```
   - Si `onlyNewExcluding` est fourni : on n'expanse que les véhicules dont le `nom` n'est pas déjà dans le set (comportement actuel de "search more").
   - Sinon : on expanse **tous** les véhicules (comportement à appliquer pour l'analyse initiale).
   - Le helper renvoie aussi les objets non-véhicules inchangés et appose `_view_angle_directive` puis le concatène à `identity_prompt` après `applyIdentityTemplates`.

2. **Appeler ce helper dans `handleReanalyzeContext`** juste après réception de `data.global_context` :
   - Filtrer pour ne pas réexpanser un véhicule qui possède déjà des `reference_images` non vides (objets protégés par `analyze-context`) ou dont le `nom` contient déjà un suffixe `(vue …)` — pour éviter de multiplier les variantes au fil des relances.
   - Appliquer `applyIdentityTemplates` puis le suffixe `VIEW ANGLE LOCK`.

3. **Refactorer `handleSearchMoreRecurrences`** pour réutiliser le même helper (passer le set des `excludeNames` afin de ne traiter que les nouveaux), supprimer la duplication actuelle.

4. **Garde-fou anti-doublon** : avant l'expansion, sauter tout véhicule dont `nom` matche `/\(vue [^)]+\)$/i` (déjà éclaté).

## Détails techniques

- Fichier touché : `src/pages/Editor.tsx` uniquement (logique frontend, pas de migration ni d'edge function).
- Pas de changement de schéma DB : les 5 variantes restent stockées comme entrées indépendantes dans `global_context.objets_recurrents` (modèle existant).
- Compatibilité : les projets ayant déjà reçu une seule entrée véhicule pourront déclencher manuellement l'expansion via « Chercher plus de récurrences » (comportement préservé) **ou** en relançant l'analyse contextuelle (nouveau).

## Hors scope

- Pas de changement à `analyze-context` edge function.
- Pas de modification de `ObjectRegistryPanel.tsx`.
- Pas de migration des données existantes du projet « BUGATTI EB 110 » : l'utilisateur relance l'analyse pour bénéficier du fix.
