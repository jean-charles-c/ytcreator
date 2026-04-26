## Objectif

Décomposer l'unique style « Animation moderne (Pixar, Ghibli…) » en **6 styles distincts** et bien différenciés afin de garantir une ligne éditoriale graphique cohérente lors de la génération des visuels.

## Nouveaux styles à intégrer

| ID | Label (UI) |
|---|---|
| `pixar` | Pixar feature films |
| `ghibli` | Studio Ghibli backgrounds |
| `dreamworks` | DreamWorks Animation |
| `sonyanimation` | Sony Pictures Animation |
| `modern2dcartoon` | Cartoon 2D moderne / Storybook |
| `modern3dfeature` | Long-métrage 3D moderne (Pixar/DreamWorks inspired) |

Chaque style reçoit le `promptSuffix` (anglais, fourni par l'utilisateur) et un `promptSuffixFr` condensé pour `generate-storyboard`, suivant la convention existante.

## Modifications techniques

1. **`src/components/editor/visualStyle/types.ts`**
   - Supprimer l'entrée `modernanimation` du tableau `VISUAL_STYLES`.
   - Insérer à sa place les 6 nouveaux styles avec les prompts complets fournis.

2. **`supabase/functions/_shared/visual-styles.ts`**
   - Même opération sur `STYLE_SUFFIXES` (clé `modernanimation` retirée, 6 nouvelles clés ajoutées avec `promptSuffix` + `promptSuffixFr`).
   - Ce fichier est partagé par toutes les edge functions de génération → tous les pipelines bénéficient automatiquement des 6 nouveaux styles.

3. **Edge functions impactées** (re-déploiement automatique) :
   - `supabase/functions/generate-shot-image/index.ts`
   - `supabase/functions/generate-shot-image-kie/index.ts`
   - `supabase/functions/generate-storyboard/index.ts`
   - `supabase/functions/regenerate-shot/index.ts`

4. **Migration douce des projets existants**
   - Aucune migration DB requise : la valeur `modernanimation` éventuellement stockée dans `projects.visual_style_id`, `scenes.visual_style_id` ou `shots.visual_style_id` ne sera plus reconnue.
   - Ajout d'un **fallback en lecture** dans `getVisualStyleById` (côté client) et dans la résolution côté edge functions : si l'ID rencontré est `modernanimation`, le système le mappe automatiquement sur `pixar` (preset le plus proche du style historique), sans toucher la base. L'utilisateur pourra ensuite choisir explicitement l'un des 6 nouveaux styles.

## Vérifications post-déploiement

- Le sélecteur de style (Global / Scène / Shot) affiche bien les 6 nouvelles entrées et plus l'ancienne.
- L'aperçu « Prompt complet envoyé à l'IA » dans `ShotCard` montre le bon `promptSuffix` selon le style choisi.
- Les projets existants utilisant `modernanimation` continuent de générer (fallback Pixar) sans erreur.

## Hors-scope

- Pas de changement d'UI au-delà des nouvelles entrées dans le menu déroulant.
- Pas de modification du moteur de prompt (hiérarchie FRAMING/IDENTITY, sanitisation safety, filtrage location lock pour gros plans) — ces logiques restent intactes.
