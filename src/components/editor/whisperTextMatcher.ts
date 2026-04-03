/**
 * Text-based matching of shot fragments to Whisper transcript words.
 *
 * Instead of matching by time proximity (which fails when Chirp and Whisper
 * timestamps diverge), this module finds each shot's first word(s) in the
 * sequential Whisper word list by normalised text comparison.
 */

interface WhisperWordLike {
  word: string;
  start: number;
  end: number;
}

/**
 * Normalise a word for fuzzy comparison:
 * lowercase, strip punctuation, collapse whitespace.
 */
function norm(w: string): string {
  return w
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, "")
    .trim();
}

/**
 * Extract the first N meaningful words from a shot text fragment.
 */
function extractLeadingWords(text: string, count = 3): string[] {
  return text
    .split(/\s+/)
    .map(norm)
    .filter((w) => w.length > 0)
    .slice(0, count);
}

export interface TextMatchResult {
  shotId: string;
  whisperStartIdx: number | null;
  /** Confidence: how many leading words matched */
  matchedWords: number;
}

/**
 * Maximum number of whisper words to look ahead from `searchFrom` before
 * giving up.  This prevents matching a common word that appears hundreds of
 * words later in the transcript, which would corrupt monotonicity.
 *
 * We use a generous window (300 words ≈ 2-3 minutes of speech) so that
 * even long gaps between shots are handled, while still preventing
 * cross-audio matches.
 */
const MAX_SEARCH_WINDOW = 300;

/**
 * For each shot (in order), find the whisper word index where the shot's
 * text begins, searching sequentially forward through the transcript.
 *
 * Uses a greedy sequential approach: each shot must start after the
 * previous one in the whisper stream.
 */
export function matchShotsByText(
  shots: { id: string; text: string }[],
  whisperWords: WhisperWordLike[]
): TextMatchResult[] {
  const results: TextMatchResult[] = [];
  let searchFrom = 0;

  for (const shot of shots) {
    const leadWords = extractLeadingWords(shot.text, 3);

    if (leadWords.length === 0) {
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0 });
      continue;
    }

    let bestIdx: number | null = null;
    let bestMatchCount = 0;

    const searchEnd = Math.min(searchFrom + MAX_SEARCH_WINDOW, whisperWords.length);

    // Search forward from the last matched position within the window
    for (let i = searchFrom; i < searchEnd; i++) {
      const wNorm = norm(whisperWords[i].word);

      // Check if this word matches the first lead word
      if (wNorm === leadWords[0] || leadWords[0].startsWith(wNorm) || wNorm.startsWith(leadWords[0])) {
        // Try to match subsequent words
        let matched = 1;
        for (let j = 1; j < leadWords.length && i + j < whisperWords.length; j++) {
          const nextWNorm = norm(whisperWords[i + j].word);
          if (nextWNorm === leadWords[j] || leadWords[j].startsWith(nextWNorm) || nextWNorm.startsWith(leadWords[j])) {
            matched++;
          } else {
            break;
          }
        }

        // Accept if we matched at least 1 word (prefer matches with more words)
        if (matched > bestMatchCount) {
          bestMatchCount = matched;
          bestIdx = i;
          // If we matched all lead words, no need to search further
          if (matched >= leadWords.length) break;
        }
      }
    }

    if (bestIdx !== null) {
      results.push({ shotId: shot.id, whisperStartIdx: bestIdx, matchedWords: bestMatchCount });
      searchFrom = bestIdx + 1;
    } else {
      // No match found within window — skip this shot
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0 });
    }
  }

  return results;
}

/**
 * Post-process matched results to enforce monotonically increasing timestamps.
 * If a matched shot has a timestamp that would go backwards, discard that match.
 */
export function enforceMonotonicTimestamps(
  results: TextMatchResult[],
  whisperWords: WhisperWordLike[]
): TextMatchResult[] {
  let lastValidTime = -1;

  return results.map((r) => {
    if (r.whisperStartIdx === null) return r;

    const time = whisperWords[r.whisperStartIdx]?.start ?? -1;
    if (time < lastValidTime) {
      // This match would go backwards — discard it
      return { ...r, whisperStartIdx: null, matchedWords: 0 };
    }

    lastValidTime = time;
    return r;
  });
}
