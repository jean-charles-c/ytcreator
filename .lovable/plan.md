

## Diagnostic

La triple passe Whisper fonctionne (les 1199 mots sont bien réécrits sur la bonne ligne `vo_audio_history`), mais Whisper **hallucine** sur ton audio shot 5 :
- Phrase manquante : « Le pays affiche une prospérité neuve. »
- Phrase dupliquée : « servent de banc d'essai à l'aube »

Pourquoi relancer ne change rien :
1. Les 3 passes parallèles tournent toutes à `temperature=0` → résultats identiques.
2. Aucun `prompt` (contexte du script) n'est envoyé à Whisper, donc rien ne le guide.

## Plan

### 1. Diversifier la triple passe (`supabase/functions/whisper-align/index.ts`)
- Passe A : `temperature=0`
- Passe B : `temperature=0.2`
- Passe C : `temperature=0.4`

### 2. Envoyer le script attendu en `prompt` Whisper
Construire un prompt à partir des ~200 premiers tokens des `orderedShots` et l'ajouter via `formData.append("prompt", scriptHint)` dans `callWhisperChunk`. C'est le levier le plus puissant contre les hallucinations (mots oubliés / phrases dupliquées).

### 3. Sélectionner la meilleure passe au lieu de toujours renvoyer A
Calculer `expectedWordCount` (somme des mots des shots) et choisir la passe dont `|words.length − expectedWordCount|` est le plus petit comme `finalWords`. Garder A/B/C dans le payload pour préserver l'UI de comparaison existante.

### 4. Éditeur manuel de transcription (`WhisperAlignmentEditor.tsx`)
Ajouter une action **« Éditer la transcription »** : ouvre une textarea pré-remplie avec les mots Whisper (un mot + timestamp par ligne). À la sauvegarde, persiste le tableau modifié dans `vo_audio_history.whisper_words` pour l'`audioEntryId` courant et redéclenche `vo-audio-timepoints-updated`. Filet de sécurité quand Whisper rate vraiment.

### Fichiers touchés
```text
supabase/functions/whisper-align/index.ts
src/components/editor/WhisperAlignmentEditor.tsx
```

Aucune migration DB nécessaire (`whisper_words` est déjà du `jsonb` libre).

### Pourquoi ça résout ton cas shot 5
Avec `temperature=0.2/0.4` ET un prompt biaisé contenant « Le pays affiche une prospérité neuve », au moins une passe a de fortes chances de récupérer la phrase manquante. La sélection « best-pass » la fera remonter automatiquement. Et si ça échoue encore, l'éditeur manuel permet d'insérer le segment sans reconsommer du quota Groq.

