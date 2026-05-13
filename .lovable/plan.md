## Problème

Quand on clique sur « Envoyer vers ScriptCreator » depuis le bloc « Script voix off final » (tab RsearchEngine), le texte qui atterrit dans `scriptInput` n'est plus identique à celui affiché dans RsearchEngine :

1. `VoiceoverScriptPanel.doSendToScriptCreator` retire les en-têtes `SCÈNE N — Titre` et reconcatène les blocs avant d'appeler `onSendToScriptCreator(cleanedContent, ...)`.
2. Côté `Editor.tsx`, le callback applique encore `cleanNarrationText(text)` à `narration` (peut altérer des sauts de ligne / tags), tandis que `pdfExtractedText` reçoit le texte déjà nettoyé.

Résultat : les en-têtes de scène disparaissent et la mise en forme diffère de la source.

## Correctif (frontend uniquement)

### 1. `src/components/editor/narrativeWorkflow/VoiceoverScriptPanel.tsx`

Dans `doSendToScriptCreator` :
- Ne plus stripper les en-têtes `SCÈNE N — Titre`. Envoyer **`script.content` tel quel** comme premier argument de `onSendToScriptCreator`.
- Garder la construction du `chapterPayload` (à partir de `chapters` + `scenesByChapter`, fallback en parsant les en-têtes `SCÈNE`) — c'est indépendant du texte envoyé.
- Supprimer la variable `cleanedContent` / la boucle `cleanedBlocks` devenue inutile.

### 2. `src/pages/Editor.tsx` (callback `onSendToScriptCreator`, ligne 2673-2682)

- Conserver le texte intact : `setPdfExtractedText(text)` reste, mais ne plus appliquer `cleanNarrationText` au passage. Soit on passe la même valeur à `setNarration(text)`, soit on retire `setNarration` (le ScriptCreator lit `pdfExtractedText`/`scriptInput` ; vérifier avant suppression).
- Ne rien changer d'autre (chapitres, segmentation, switch de tab).

## Vérification

1. Dans le projet « Protocoles d'Extinction… », régénérer ou réutiliser le script existant.
2. Cliquer « Envoyer vers ScriptCreator ».
3. Comparer visuellement le contenu du `scriptInput` (tab ScriptCreator) avec le bloc « Script voix off final » du tab RsearchEngine : les en-têtes `SCÈNE N — Titre` et la ponctuation doivent être identiques.
4. Vérifier que les chapitres vidéo sont toujours pré-remplis depuis le sommaire narratif (comportement précédent inchangé).

## Hors scope

- Pas de changement edge function.
- Pas de changement DB.
- Pas de modification du flux de chapitres ni de la segmentation narrative.
