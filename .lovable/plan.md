## Diagnostic

Le bouton « Générer tous les prompts » (`runStoryboard({ promptOnly: true })`) saute en réalité toutes les scènes dont **chaque shot a déjà un `prompt_export` non vide** (Editor.tsx, lignes 731‑756, fonction `isComplete`). C'est ce qui rend le bouton « inutile » sur certains shots : ils ont reçu un prompt avant même d'être ciblés.

D'où viennent ces prompts générés trop tôt ? De trois handlers structurels dans `src/pages/Editor.tsx` :

- `handleShotSplit` → ligne 1499 : `regeneratePromptsForScene(shot.scene_id)`
- `handleShotMergeWithNext` → ligne 1404 : idem
- `handleShotDelete` → ligne 1339 : idem

`regeneratePromptsForScene` (ligne 1248) appelle `generate-storyboard` en mode `prompt_only`, ce qui fait passer les shots de la scène entière par l'IA, **réécrit leur `prompt_export`** (storyboard/index.ts lignes 1102‑1170), puis retourne les shots avec un prompt complet. Résultat : dès qu'on scinde, fusionne ou supprime un shot, la scène entière reçoit silencieusement de nouveaux prompts. Ces prompts ne respectent pas forcément le style global / format / niveau sensible que l'utilisateur a sélectionnés au moment de cliquer « Générer tous les prompts ».

C'est exactement le comportement décrit : 43 shots du projet « Bugatti Chiron Super Sport 300+ » ont vu leur `prompt_export` rempli **avant** le clic sur le bouton (la base montre 71/71 shots avec `prompt_export` non nul, donc plusieurs scènes seront ensuite ignorées par `isComplete`).

## Correctif proposé

### 1. Ne plus auto-générer les prompts lors d'une modification structurelle
Dans `src/pages/Editor.tsx` :
- Supprimer les trois appels `regeneratePromptsForScene(...)` dans `handleShotSplit`, `handleShotMergeWithNext`, `handleShotDelete`.
- Pour les **nouveaux shots créés par split**, vider explicitement les champs dérivés afin qu'ils soient « non encore prompted » :
  - À l'INSERT du new shot dans `handleShotSplit` (ligne ~1465) : forcer `prompt_export: null`, `guardrails: null`, `description: ""` (ou le fragment brut), `shot_type: ""`.
- Pour le shot **modifié** par split/merge/delete (texte source change) : remettre `prompt_export = null` côté DB et état local, pour qu'il soit considéré « à régénérer ».
- Afficher un toast informatif après chaque opération : « Le shot a changé. Cliquez sur "Générer tous les prompts" pour mettre à jour les prompts visuels. »

### 2. Conserver `regeneratePromptsForScene` mais ne plus l'appeler automatiquement
La fonction reste utile pour le bouton « Régénérer les prompts de cette scène » (Editor.tsx ligne 3688), donc on la garde, mais elle n'est plus déclenchée par split/merge/delete.

### 3. Le bouton « Générer tous les prompts » continuera de fonctionner correctement
Comme les shots modifiés ont désormais `prompt_export = null`, leur scène ne sera plus marquée « complète » par `isComplete`, et le bouton les retraitera bien.
Le bouton « Tout régénérer (force) » reste disponible pour reforger la totalité.

### 4. Mémoire projet
Ajouter un mémo dans `mem/features/segmentation/` : **« split/merge/delete shots ne déclenchent jamais de génération de prompts ; les shots modifiés sont marqués prompt_export=null et attendent que l'utilisateur clique sur Générer tous les prompts. »**

## Fichiers touchés
- `src/pages/Editor.tsx` (handlers split/merge/delete + INSERT split)
- `mem/features/segmentation/structural-edits-no-auto-prompts.md` (nouveau)
- mise à jour de `mem/index.md`

Aucune migration DB nécessaire.
