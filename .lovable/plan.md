# Fix race condition style visuel "none"

## Problème
Le hook `useVisualStyle` retourne `"none"` (DEFAULT_VISUAL_STYLE_ID) pendant le fetch async de la valeur DB. Si une génération de prompts démarre dans cette fenêtre, certains shots reçoivent `"none"` → "Aucun style imposé" ou fallback "photographie documentaire" au lieu de "Dark silhouette contour outline".

## Changements

### 1. `src/components/editor/visualStyle/useVisualStyle.ts`
- Ajouter état `isReady: boolean` (false quand `projectId` fourni, true sinon).
- Passe à `true` après réponse DB (succès, erreur, ou ligne absente).
- Exposer `isReady` dans le retour du hook.

### 2. `src/pages/Editor.tsx`
- Sur chaque déclencheur de génération (storyboard, régénération scène, régénération shot, régénération globale prompts/visuels) :
  - Si `!visualStyle.isReady` → `toast.error("Style visuel en cours de chargement, réessayez dans un instant")` et `return`.

### 3. `src/components/editor/ChapterCollapse.tsx` & `ChapterItem.tsx`
- Propager `visualStyleReady` en prop.
- `disabled` sur les boutons "Régénérer" + tooltip "Style visuel en cours de chargement…" tant que `false`.

### 4. Garde-fou backend
**`supabase/functions/generate-storyboard/index.ts`** et **`supabase/functions/regenerate-shot/index.ts`** :
- Si `visual_style === "none"` reçu, lire `project_scriptcreator_state.visual_style_global` ; si la DB a une autre valeur, l'utiliser.

## Correction manuelle après déploiement
1. Vérifier que "Dark silhouette contour outline" est actif dans le sélecteur global.
2. **Tout régénérer (force) — Prompts**.
3. **Tout régénérer (force) — Visuels**.

## Fichiers
- `src/components/editor/visualStyle/useVisualStyle.ts`
- `src/pages/Editor.tsx`
- `src/components/editor/ChapterCollapse.tsx`
- `src/components/editor/ChapterItem.tsx`
- `supabase/functions/generate-storyboard/index.ts`
- `supabase/functions/regenerate-shot/index.ts`

Aucune migration DB. Push GitHub à la fin.
