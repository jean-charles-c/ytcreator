

## Diagnosis

The triple-pass whisper IS working correctly (logs confirm fresh 1199 words written to the right `vo_audio_history` row). The displayed transcript IS up to date.

The real problem: **Whisper itself is hallucinating** on this audio. Looking at the actual stored transcript around shot 5:

> "…Les ateliers tournent tard. La presse, elle, s'enflamme tôt. **servent de banc d'essai à l'aube.** Les routes d'Émilie-Romagne **servent de banc d'essai à l'aube.** Au centre,…"

Whisper:
- **Dropped** the real sentence "Le pays affiche une prospérité neuve."
- **Duplicated** "servent de banc d'essai à l'aube"

Two reasons re-running gives the same result:
1. All 3 parallel passes use `temperature=0` → deterministic → identical outputs → averaging cannot diverge.
2. No `prompt` (script context) is sent to Whisper, so it has no way to disambiguate near-duplicate phrasing in Chirp 3 HD audio.

## Plan

### 1. Diversify the triple pass (`supabase/functions/whisper-align/index.ts`)

Currently passes A/B/C all run at `temperature=0` → identical. Change to staggered temperatures so the model produces 3 *different* candidates:

- Pass A: `temperature=0` (greedy)
- Pass B: `temperature=0.2`
- Pass C: `temperature=0.4`

Then pick the candidate whose word count is **closest to the expected length** (sum of words in `orderedShots`) instead of always returning Pass A. This typically rescues dropped sentences.

### 2. Send the expected script as a Whisper `prompt`

Whisper supports a 244-token initial prompt that biases transcription toward expected vocabulary/phrasing. Build it from the first ~200 tokens of `orderedShots` text and pass `formData.append("prompt", scriptHint)` in `callWhisperChunk`. This is the single biggest accuracy improvement for hallucination-prone audio (drastically reduces dropped words and duplicated sentences).

### 3. Pick best pass instead of always Pass A

After repair, compute for each run:
- `expectedWordCount` = total words in ordered shots
- `delta` = `|run.words.length − expectedWordCount|`

Return the run with smallest `delta` as `finalWords` (currently always returns runA on lines 536-538). Keep all 3 in the `passA/B/C` payload so the existing comparison UI still works.

### 4. Editable whisper transcript in `WhisperAlignmentEditor.tsx` (manual escape hatch)

Even with diversified passes + script prompt, some Chirp audio cases will still fool Whisper. Add a small **"Éditer la transcription"** action under the existing transcript view that:

- Opens a textarea pre-filled with the current whisper transcript (one word per line with timestamps).
- On save, persists the edited word array back to `vo_audio_history.whisper_words` for the current `audioEntryId` and re-dispatches `vo-audio-timepoints-updated` to force re-matching.

This gives the user a way to insert "Le pays affiche une prospérité neuve." between two existing words without depending on Whisper.

### Files touched

```text
supabase/functions/whisper-align/index.ts    (passes 1-3: temperature variation, script prompt, best-pass selection)
src/components/editor/WhisperAlignmentEditor.tsx  (manual transcript editor section)
```

No DB migration needed — `whisper_words` already accepts arbitrary `jsonb`.

### Why this fixes the user's case

For their shot 5: with `temperature=0.2/0.4` AND a script prompt biased on "Le pays affiche une prospérité neuve", Whisper will almost certainly recover the dropped sentence on at least one pass. Best-pass selection then surfaces it. If it still fails on rare Chirp cases, the manual editor provides a final-resort fix without burning Groq quota.

