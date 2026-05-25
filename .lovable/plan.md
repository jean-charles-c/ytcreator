## Affichage double : bandeau sticky + surlignage Whisper

Dans `src/components/editor/WhisperAlignmentEditor.tsx`, dans le bloc des mots cliquables (mode `isEditing`) :

### 1. Bandeau rouge sticky en haut du bloc
- Conteneur `sticky top-0 z-10` avec fond `bg-destructive/10`, bord inférieur rouge
- La phrase `shot.shotText` reste toujours visible même quand on scrolle les mots Whisper
- Chaque mot du shot est un span cliquable :
  - Si le mot est trouvé dans `whisperWords` (normalisation accents/casse), clic → `handleWordClick(matchIdx)` (sélectionne start puis end)
  - Si introuvable, mot grisé `opacity-50 cursor-not-allowed`
- Style : `text-destructive font-semibold italic`, hover `bg-destructive/20`

### 2. Surlignage rouge dans les mots Whisper
- Pré-calcul d'un `Set<number>` des indices Whisper qui correspondent à un mot du shot (matching normalisé séquentiel pour éviter les faux positifs)
- Dans le `.map(whisperWords)`, si `shotMatchIndices.has(idx)` :
  - Bordure rouge `ring-1 ring-destructive/50`
  - Texte `text-destructive` (sauf si déjà sélectionné, le bleu primary prime)
- Permet de repérer visuellement les mots à cliquer dans la liste Whisper

### 3. Logique de matching partagée
- Fonction locale `findShotWordsInWhisper(shotText, whisperWords)` qui renvoie `{ wordMatches: Map<shotWordIdx, whisperIdx>, matchedWhisperIndices: Set<number> }`
- Matching séquentiel : on avance dans `whisperWords` à partir du dernier index trouvé pour éviter les collisions sur mots répétés
- Normalisation : minuscule + suppression ponctuation/accents via `\p{L}\p{N}`

### Résultat UX
- Bandeau rouge toujours visible (sticky), cliquable mot par mot
- Mots Whisper correspondants surlignés en rouge → l'utilisateur voit immédiatement où cliquer dans la liste
- Aucune modification de la logique de sélection (`handleWordClick`, `selectionStart/End`) ni du backend

### Fichier modifié
- `src/components/editor/WhisperAlignmentEditor.tsx` (uniquement le bloc `isEditing` lignes ~1928-1963)
