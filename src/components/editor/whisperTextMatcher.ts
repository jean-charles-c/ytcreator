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
 * Number-to-text equivalence map for French.
 * Allows matching "40" with "quarante", "F40" with "f quarante", etc.
 */
const NUMBER_TEXT_MAP: Record<string, string[]> = {
  "0": ["zéro", "zero"],
  "1": ["un", "une"],
  "2": ["deux"],
  "3": ["trois"],
  "4": ["quatre"],
  "5": ["cinq"],
  "6": ["six"],
  "7": ["sept"],
  "8": ["huit"],
  "9": ["neuf"],
  "10": ["dix"],
  "11": ["onze"],
  "12": ["douze"],
  "13": ["treize"],
  "14": ["quatorze"],
  "15": ["quinze"],
  "16": ["seize"],
  "20": ["vingt"],
  "30": ["trente"],
  "40": ["quarante"],
  "50": ["cinquante"],
  "60": ["soixante"],
  "80": ["quatrevingt", "quatrevingts"],
  "100": ["cent"],
  "200": ["deuxcent", "deuxcents"],
  "288": ["deuxcentquatrevinghuit", "deuxcentquatrevingthuit"],
  "1000": ["mille"],
  "1987": ["milleneufcentquatrevingsept"],
  "1947": ["milleneufcentquarantesept"],
};

/** Build reverse map: text → digit string */
const TEXT_TO_NUMBER = new Map<string, string>();
for (const [digit, texts] of Object.entries(NUMBER_TEXT_MAP)) {
  for (const t of texts) {
    TEXT_TO_NUMBER.set(t, digit);
  }
}

/**
 * Check if two normalised words are equivalent,
 * including number ↔ text matching.
 */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 0 || b.length === 0) return false;

  // Prefix matching (for partial words from Whisper)
  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }

  // Number ↔ text: check if one is a digit string and the other is its text form
  const aTexts = NUMBER_TEXT_MAP[a];
  if (aTexts && aTexts.includes(b)) return true;
  const bTexts = NUMBER_TEXT_MAP[b];
  if (bTexts && bTexts.includes(a)) return true;

  // Reverse: text → number
  const aNum = TEXT_TO_NUMBER.get(a);
  if (aNum === b) return true;
  const bNum = TEXT_TO_NUMBER.get(b);
  if (bNum === a) return true;

  return false;
}

/**
 * Extract the first N meaningful words from a shot text fragment.
 */
function extractLeadingWords(text: string, count = 5): string[] {
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
 * giving up.  We use a very generous window to handle long audio files
 * (15+ minutes = 3000+ words).
 */
const MAX_SEARCH_WINDOW = 2000;

/**
 * Words too short/common to be reliable as a sole first-word match.
 */
const WEAK_FIRST_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "en",
  "au", "aux", "ce", "ces", "sa", "son", "ses", "se", "si", "ou",
  "il", "elle", "on", "ne", "y", "a", "par", "pour", "sur", "dans",
  "que", "qui", "mais", "car", "donc",
]);

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
    const leadWords = extractLeadingWords(shot.text, 5);

    if (leadWords.length === 0) {
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0 });
      continue;
    }

    let bestIdx: number | null = null;
    let bestMatchCount = 0;

    const searchEnd = Math.min(searchFrom + MAX_SEARCH_WINDOW, whisperWords.length);

    // Determine minimum match count based on first word strength
    const firstWordWeak = WEAK_FIRST_WORDS.has(leadWords[0]);
    const minRequiredMatch = firstWordWeak && leadWords.length >= 2 ? 2 : 1;

    // Search forward from the last matched position within the window
    for (let i = searchFrom; i < searchEnd; i++) {
      const wNorm = norm(whisperWords[i].word);

      // Check if this word matches the first lead word
      if (wordsMatch(wNorm, leadWords[0])) {
        // Try to match subsequent words
        let matched = 1;
        for (let j = 1; j < leadWords.length && i + j < whisperWords.length; j++) {
          const nextWNorm = norm(whisperWords[i + j].word);
          if (wordsMatch(nextWNorm, leadWords[j])) {
            matched++;
          } else {
            break;
          }
        }

        // Accept if we matched enough words (prefer matches with more words)
        if (matched > bestMatchCount && matched >= minRequiredMatch) {
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
