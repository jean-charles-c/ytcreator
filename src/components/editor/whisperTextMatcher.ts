/**
 * Text-based matching of shot fragments to Whisper transcript words.
 *
 * Strategy: strict sequential matching.
 * - Shot 1 anchors at whisper word 0.
 * - For each subsequent shot, search the next SEARCH_WINDOW words for an
 *   exact 3-word match on the shot's leading words.
 * - If no match is found, mark the shot as "blocked" and STOP.
 *   The user can manually fix the blocked shot, then matching resumes.
 */

interface WhisperWordLike {
  word: string;
  start: number;
  end: number;
}

/**
 * Normalise a word for comparison:
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

/** How many whisper words to look ahead from the previous match. */
const SEARCH_WINDOW = 50;

/** Minimum consecutive words that must match exactly. */
const REQUIRED_MATCH_COUNT = 3;

export interface StrictMatchResult {
  shotId: string;
  whisperStartIdx: number | null;
  matchedWords: number;
  /** True if this shot blocked the sequential chain */
  blocked: boolean;
}

/**
 * Strict sequential matching:
 * - Shot 0 → anchored at whisper word 0
 * - Shot N → search in [prevMatch+1 … prevMatch+SEARCH_WINDOW] for exact 3-word match
 * - On failure → mark blocked, all subsequent shots get null
 *
 * @param manualAnchors  Map of shotId → whisperStartIdx for manually fixed shots.
 *                       When a blocked shot has a manual anchor, matching resumes from there.
 */
export function matchShotsStrictSequential(
  shots: { id: string; text: string }[],
  whisperWords: WhisperWordLike[],
  manualAnchors?: Map<string, number>
): StrictMatchResult[] {
  const results: StrictMatchResult[] = [];
  if (shots.length === 0) return results;

  const anchors = manualAnchors ?? new Map<string, number>();

  // Shot 0 always anchors at word 0
  let searchFrom = 0;
  let blocked = false;

  for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
    const shot = shots[shotIdx];

    // If we're blocked, check if this shot has a manual anchor to resume
    if (blocked) {
      const manualIdx = anchors.get(shot.id);
      if (manualIdx !== undefined && manualIdx !== null) {
        // Resume from manual anchor
        results.push({
          shotId: shot.id,
          whisperStartIdx: manualIdx,
          matchedWords: REQUIRED_MATCH_COUNT,
          blocked: false,
        });
        searchFrom = manualIdx + 1;
        blocked = false;
        continue;
      }
      // Still blocked
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0, blocked: false });
      continue;
    }

    // First shot: anchor at word 0
    if (shotIdx === 0) {
      results.push({
        shotId: shot.id,
        whisperStartIdx: 0,
        matchedWords: REQUIRED_MATCH_COUNT,
        blocked: false,
      });
      searchFrom = 1;
      continue;
    }

    // Check for manual anchor first
    const manualIdx = anchors.get(shot.id);
    if (manualIdx !== undefined && manualIdx !== null) {
      results.push({
        shotId: shot.id,
        whisperStartIdx: manualIdx,
        matchedWords: REQUIRED_MATCH_COUNT,
        blocked: false,
      });
      searchFrom = manualIdx + 1;
      continue;
    }

    const leadWords = extractLeadingWords(shot.text, REQUIRED_MATCH_COUNT);

    if (leadWords.length < REQUIRED_MATCH_COUNT) {
      // Not enough words to match — block
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0, blocked: true });
      blocked = true;
      continue;
    }

    // Search in [searchFrom … searchFrom + SEARCH_WINDOW]
    const searchEnd = Math.min(searchFrom + SEARCH_WINDOW, whisperWords.length);
    let foundIdx: number | null = null;

    for (let i = searchFrom; i < searchEnd; i++) {
      let allMatch = true;
      for (let j = 0; j < REQUIRED_MATCH_COUNT; j++) {
        if (i + j >= whisperWords.length) {
          allMatch = false;
          break;
        }
        if (norm(whisperWords[i + j].word) !== leadWords[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== null) {
      results.push({
        shotId: shot.id,
        whisperStartIdx: foundIdx,
        matchedWords: REQUIRED_MATCH_COUNT,
        blocked: false,
      });
      searchFrom = foundIdx + 1;
    } else {
      // Blocked!
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0, blocked: true });
      blocked = true;
    }
  }

  return results;
}

// ── Legacy exports kept for whisperTimepointRepair ──

export interface TextMatchResult {
  shotId: string;
  whisperStartIdx: number | null;
  matchedWords: number;
}

/**
 * Legacy wrapper: converts strict results to the old format used by repair logic.
 */
export function matchShotsByText(
  shots: { id: string; text: string }[],
  whisperWords: WhisperWordLike[]
): TextMatchResult[] {
  return matchShotsStrictSequential(shots, whisperWords).map((r) => ({
    shotId: r.shotId,
    whisperStartIdx: r.whisperStartIdx,
    matchedWords: r.matchedWords,
  }));
}

/**
 * Post-process matched results to enforce monotonically increasing timestamps.
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
      return { ...r, whisperStartIdx: null, matchedWords: 0 };
    }

    lastValidTime = time;
    return r;
  });
}
