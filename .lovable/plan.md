## Objectif

Dans le tab "VO" → bloc "Alignement Whisper par shot", quand un shot est corrigé manuellement (anchor manuel avec `manualSelectionEndIdx`), son timecode de fin (ex. shot 19 → 83.953 s) doit forcer le timecode de début du shot suivant (shot 20) à être strictement égal à cette valeur. Aujourd'hui, le shot suivant garde son `startTime` issu du matching Whisper, ce qui crée un décrochage.

## Comportement actuel

- `getManualSelectionEndTime` calcule un `endTime` spécial pour les shots manuels.
- `recalculateWhisperShotEndTimesWithManualRanges` réécrit `endTime` du shot manuel, **mais ne touche pas au `startTime` du shot suivant**.
- `recalculateWhisperShotEndTimes` dérive ensuite `endTime` du shot précédent à partir du `startTime` du shot suivant — donc tout shot non manuel hérite de son voisin, mais l'inverse n'est pas vrai.

## Changement proposé

Modifier `recalculateWhisperShotEndTimesWithManualRanges` (`src/components/editor/whisperManualSelectionTiming.ts`) pour, en plus d'écrire le `endTime` manuel du shot N, **propager ce `endTime` comme `startTime` du shot N+1** (s'il existe et a déjà un `startTime` non-null), puis relancer `recalculateWhisperShotEndTimes` afin que les `endTime` en aval restent cohérents.

Algorithme (pass séquentiel sur les shots triés) :

1. Premier passage `recalculateWhisperShotEndTimes` (état actuel).
2. Itérer dans l'ordre. Pour chaque shot manuel avec `manualEndTime` valide :
   - écrire `shot.endTime = boundedManualEndTime`
   - si le shot suivant existe et a `startTime !== null` et `boundedManualEndTime > 0` → forcer `nextShot.startTime = boundedManualEndTime`
3. Re-dériver les `endTime` (deuxième passage `recalculateWhisperShotEndTimes`) pour aligner les fins en chaîne, **puis** ré-appliquer les `endTime` manuels (ils restent prioritaires).

Ce pattern garantit l'invariant : `shot[n+1].startTime === shot[n].endTime` dès qu'un anchor manuel est posé.

## Persistance

Le `startTime` corrigé du shot suivant doit aussi être sauvegardé dans `shot_timepoints` pour que le rechargement et la timeline (`assembleTimeline`) restent synchronisés. Vérifier les chemins de sauvegarde existants (`onSave`/handlers qui lisent `alignedShots[].startTime`) — comme ils sérialisent déjà `s.startTime`, la propagation faite en amont dans l'état suffit. Aucune migration DB requise.

## Tests

Mettre à jour `src/test/whisperManualSelectionTiming.test.ts` (créer si inexistant) avec un cas :
- 3 shots, shot N manuel avec `manualEndTime = 83.953`
- vérifier `shots[N].endTime === 83.953` et `shots[N+1].startTime === 83.953` et `shots[N].endTime === shots[N+1].startTime`.

## Fichiers impactés

- `src/components/editor/whisperManualSelectionTiming.ts` (logique principale)
- `src/test/whisperManualSelectionTiming.test.ts` (test ajouté/mis à jour)

Aucun changement UI ni DB.