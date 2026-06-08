## Problème

Dans l'onglet **CP** (`src/components/editor/ContentPublishTab.tsx`), les boutons et blocs de copie (SCRIPT, SCRIPT AVEC MARKS, VO, SOUS-TITRES, TITRES, DESCRIPTIONS, TAGS, PROMPTS) ne copient rien dans la prévisualisation Lovable.

### Cause racine

1. **API Clipboard bloquée dans l'iframe de preview** : `navigator.clipboard.writeText(...)` exige un contexte sécurisé + la permission `clipboard-write` dans la `Permissions-Policy` de l'iframe. Dans l'aperçu Lovable, cette permission n'est pas accordée, donc la promesse est *rejetée silencieusement*. Comme aucun `.catch(...)` n'est attaché dans `CopyButton` ni dans `CopyableBlock`, l'utilisateur ne voit ni succès ni erreur — exactement le comportement décrit.
2. **Pas de fallback** : aucune méthode alternative (textarea hors écran + `document.execCommand('copy')`) n'est tentée quand l'API moderne échoue.
3. **Propagation des clics** : dans `CopyableBlock`, le `div` parent porte un `onClick` qui copie, et le `CopyButton` enfant ne fait pas `stopPropagation`. Quand l'utilisateur clique le bouton, deux copies sont tentées, deux toasts peuvent apparaître — comportement parasite.

## Correctif

Fichier touché : `src/components/editor/ContentPublishTab.tsx` uniquement (pas de logique métier, pas de backend).

### 1. Utilitaire de copie robuste

Ajouter en haut du fichier une fonction `copyToClipboard(text): Promise<boolean>` :

- Tente d'abord `navigator.clipboard.writeText(text)` (chemin nominal hors iframe).
- En cas de rejet ou d'API absente, exécute un fallback : créer un `<textarea>` invisible, le remplir, `select()`, puis `document.execCommand('copy')`, puis le retirer.
- Retourne `true` si l'une des deux méthodes a réussi, `false` sinon.

### 2. Intégration dans les composants

- `CopyButton.handleCopy` : `await copyToClipboard(text)`. Si succès → toast succès + état "copié" 2 s. Sinon → `toast.error("Copie impossible — sélectionnez puis Ctrl+C")`.
- `CopyableBlock` : même logique dans le `onClick` du `div`. Ajouter `e.stopPropagation()` dans le `onClick` du `CopyButton` interne pour éviter la double-copie.

### 3. Vérification

- Recharger l'onglet CP du projet "La Facture Secrète…" dans la preview.
- Cliquer sur le bouton copier d'un bloc SCRIPT : un toast de succès doit s'afficher et le contenu doit être réellement présent dans le presse-papier système (testable avec Ctrl+V dans un autre champ).
- Si l'iframe bloque toujours `execCommand`, l'utilisateur verra un toast d'erreur explicite plutôt qu'un silence.

## Hors périmètre

- Pas de changement de structure, de styles, de design tokens.
- Pas de modification des données ni des fonctions edge.
- Pas de modification d'autres onglets.
