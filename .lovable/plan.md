## Problème

Quand on génère un script voix off dans RsearchEngine (workflow NFG) puis on clique sur "Envoyer dans ScriptCreator" :
- le texte alimente bien `narration` (le bloc ScriptInput) ET `pdfExtractedText` (le pipeline PDF) ;
- l'utilisateur atterrit en haut de ScriptCreator, sur le pipeline PDF, avec une invitation à "Lancer l'analyse" / "Générer le script" — étapes inutiles puisque le script est déjà prêt ;
- le bloc ScriptInput (tout en bas) est replié par défaut, donc le script semble "disparu".

Le panneau "Texte source (scriptInput)" ajouté juste avant double l'info et entretient la confusion. On le retire.

## Objectif

Quand le texte vient du NFG, sauter intégralement le pipeline PDF et amener l'utilisateur directement sur le bloc ScriptInput, prêt à cliquer sur "Lancer la segmentation".

## Modifications

### 1. `src/pages/Editor.tsx` — distinguer la provenance NFG
- Ajouter un state `scriptInputAutoOpen` (compteur ou flag horodaté) qui se déclenche uniquement quand l'envoi vient du NFG.
- Dans `onSendToScriptCreator` de `<RsearchEngineTab>` :
  - alimenter `narration` uniquement (PAS `pdfExtractedText`, pour ne pas réveiller le pipeline PDF) ;
  - garder `setGeneratedScript(null)` et `setPdfAnalysis(null)` ;
  - incrémenter `scriptInputAutoOpen` ;
  - basculer sur l'onglet `script-creator`.
- Passer la nouvelle prop `scriptInputAutoOpen` à `<PdfDocumentaryTab>`.

### 2. `src/components/editor/PdfDocumentaryTab.tsx` — auto-ouverture du bloc ScriptInput
- Retirer le panneau "Texte source (scriptInput)" ajouté précédemment (lignes ~1298-1320) : duplication inutile maintenant que la cible est ScriptInput.
- Ajouter la prop `scriptInputAutoOpen?: number`.
- Remplacer le `Collapsible` non contrôlé du bloc ScriptInput (ligne 1849) par un `Collapsible` contrôlé via un state local `scriptInputOpen`.
- `useEffect` sur `scriptInputAutoOpen` : quand la valeur change, `setScriptInputOpen(true)` puis `scrollIntoView({ behavior: "smooth", block: "start" })` sur une `ref` attachée au bloc ScriptInput. Affiche un toast "Script voix off chargé dans ScriptInput".

### 3. Comportement final
- L'utilisateur clique "Envoyer dans ScriptCreator" depuis le panneau VO du NFG.
- ScriptCreator s'ouvre, déroule automatiquement ScriptInput, scrolle dessus, le texte est visible et éditable, le bouton "Lancer la segmentation" est actif immédiatement.
- Le pipeline PDF reste inchangé pour les autres usages (upload PDF classique).

## Détails techniques

- `scriptInputAutoOpen` est un `number` (timestamp) pour que chaque envoi successif redéclenche l'effet même si le bloc est resté ouvert.
- La `ref` de scroll est posée sur le `<Collapsible>` racine du bloc ScriptInput.
- Aucun changement de schéma DB, aucun edge function touché.
- Aucune régression attendue sur l'envoi RsearchEngine "classique" (dossier de recherche) : ce chemin continue de remplir `pdfExtractedText` comme avant — on ne modifie que le chemin VoiceoverScriptPanel → onSendToScriptCreator. On distinguera les deux chemins via un second paramètre booléen optionnel `targetScriptInput` passé par `VoiceoverScriptPanel` (et ignoré par `RsearchEngineTab.handleSendToScriptCreator` du dossier brut).
