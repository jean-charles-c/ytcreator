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

export interface ManualAnchorRange {
  startIdx: number;
  endIdx: number | null;
}

/**
 * Normalise a word for comparison:
 * lowercase, strip punctuation, collapse whitespace.
 */
function norm(w: string): string {
  return w
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, "")
    .trim();
}

/** Minimum consecutive words that must match exactly. */
const REQUIRED_MATCH_COUNT = 3;

/** Fallback: try 2-word match if 3-word fails (handles Whisper transcription errors). */
const FALLBACK_MATCH_COUNT = 2;

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

export interface StrictMatchResult {
  shotId: string;
  whisperStartIdx: number | null;
  matchedWords: number;
  /** True if this shot blocked the sequential chain */
  blocked: boolean;
  /** Ratio of shot words confirmed in whisper (0.0–1.0) */
  coverageRatio: number;
}

/**
 * Compute coverage ratio: compare all normalised words in the shot text
 * against the whisper words starting from the anchor index.
 * Uses sequential comparison (order matters).
 */
function computeCoverageRatio(
  shotText: string,
  whisperWords: WhisperWordLike[],
  anchorIdx: number
): number {
  const shotWords = shotText
    .split(/\s+/)
    .map(norm)
    .filter((w) => w.length > 0);
  if (shotWords.length === 0) return 0;

  let confirmed = 0;
  let wIdx = anchorIdx;
  for (const sw of shotWords) {
    if (wIdx >= whisperWords.length) break;
    if (norm(whisperWords[wIdx].word) === sw) {
      confirmed++;
    }
    wIdx++;
  }
  return confirmed / shotWords.length;
}

function resolveManualAnchorRange(
  value: number | ManualAnchorRange | undefined
): ManualAnchorRange | null {
  if (typeof value === "number") {
    return { startIdx: value, endIdx: null };
  }

  if (value && typeof value.startIdx === "number") {
    return {
      startIdx: value.startIdx,
      endIdx: typeof value.endIdx === "number" ? value.endIdx : null,
    };
  }

  return null;
}

function getManualResumeIndex(range: ManualAnchorRange, shotText: string): number {
  if (range.endIdx !== null) {
    return range.endIdx + 1;
  }

  const shotWordCount = shotText.split(/\s+/).filter((w) => w.length > 0).length;
  const minAdvance = Math.max(REQUIRED_MATCH_COUNT, Math.floor(shotWordCount * 0.5), 3);
  return range.startIdx + minAdvance;
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
  manualAnchors?: Map<string, number | ManualAnchorRange>
): StrictMatchResult[] {
  const results: StrictMatchResult[] = [];
  if (shots.length === 0) return results;

  const anchors = manualAnchors ?? new Map<string, number | ManualAnchorRange>();

  // Shot 0 always anchors at word 0
  let searchFrom = 0;

  for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
    const shot = shots[shotIdx];

    // First shot: anchor at word 0
    if (shotIdx === 0) {
      results.push({
        shotId: shot.id,
        whisperStartIdx: 0,
        matchedWords: REQUIRED_MATCH_COUNT,
        blocked: false,
        coverageRatio: computeCoverageRatio(shot.text, whisperWords, 0),
      });
      searchFrom = 1;
      continue;
    }

    // Check for manual anchor first
    const manualRange = resolveManualAnchorRange(anchors.get(shot.id));
    if (manualRange) {
      results.push({
        shotId: shot.id,
        whisperStartIdx: manualRange.startIdx,
        matchedWords:
          manualRange.endIdx !== null
            ? Math.max(1, manualRange.endIdx - manualRange.startIdx + 1)
            : REQUIRED_MATCH_COUNT,
        blocked: false,
        coverageRatio: computeCoverageRatio(shot.text, whisperWords, manualRange.startIdx),
      });
      searchFrom = getManualResumeIndex(manualRange, shot.text);
      continue;
    }

    const leadWords = extractLeadingWords(shot.text, REQUIRED_MATCH_COUNT);

    if (leadWords.length < FALLBACK_MATCH_COUNT) {
      // Not enough words to match — skip but DON'T block subsequent shots
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0, blocked: true, coverageRatio: 0 });
      continue;
    }

    // Search in [searchFrom … searchFrom + SEARCH_WINDOW]
    const searchEnd = Math.min(searchFrom + SEARCH_WINDOW, whisperWords.length);
    let foundIdx: number | null = null;
    let matchedCount = 0;

    // Pass 1: try exact 3-word match
    if (leadWords.length >= REQUIRED_MATCH_COUNT) {
      for (let i = searchFrom; i < searchEnd; i++) {
        let allMatch = true;
        for (let j = 0; j < REQUIRED_MATCH_COUNT; j++) {
          if (i + j >= whisperWords.length) { allMatch = false; break; }
          if (norm(whisperWords[i + j].word) !== leadWords[j]) { allMatch = false; break; }
        }
        if (allMatch) { foundIdx = i; matchedCount = REQUIRED_MATCH_COUNT; break; }
      }
    }

    // Pass 2: fallback to 2-word exact match if 3-word failed
    if (foundIdx === null) {
      for (let i = searchFrom; i < searchEnd; i++) {
        let allMatch = true;
        for (let j = 0; j < FALLBACK_MATCH_COUNT; j++) {
          if (i + j >= whisperWords.length) { allMatch = false; break; }
          if (norm(whisperWords[i + j].word) !== leadWords[j]) { allMatch = false; break; }
        }
        if (allMatch) { foundIdx = i; matchedCount = FALLBACK_MATCH_COUNT; break; }
      }
    }

    if (foundIdx !== null) {
      results.push({
        shotId: shot.id,
        whisperStartIdx: foundIdx,
        matchedWords: matchedCount,
        blocked: false,
        coverageRatio: computeCoverageRatio(shot.text, whisperWords, foundIdx),
      });
      const shotWordCount = shot.text.split(/\s+/).filter(w => w.length > 0).length;
      const minAdvance = Math.max(matchedCount, Math.floor(shotWordCount * 0.5), 3);
      searchFrom = foundIdx + minAdvance;
    } else {
      // ⚠️ AUTO-SKIP: mark this shot as blocked (red) but DO NOT propagate the block.
      // Subsequent shots keep trying from the same searchFrom — the cascade survives
      // a single bad shot (e.g. Whisper splitting "Sant'Agata" into "Santa Gata").
      results.push({ shotId: shot.id, whisperStartIdx: null, matchedWords: 0, blocked: true, coverageRatio: 0 });
      // searchFrom stays unchanged — the next shot will search the same window
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
