/**
 * Narrative Segmentation Engine (client-side mirror)
 *
 * Replaces mechanical character-count splitting with sense-based segmentation.
 * Each NarrativeUnit represents an illustrable visual moment from the narration.
 *
 * Hierarchy of segmentation criteria:
 *   1. Semantic unit (single coherent idea / visual moment)
 *   2. Narrative transition (change of subject, location, time, focus, action)
 *   3. Soft guard-rails (~40 chars min, ~100 chars max — with justified exceptions)
 */

// ── Types ──────────────────────────────────────────────────────────

export interface NarrativeUnit {
  /** Exact text fragment (verbatim from source) */
  text: string;
  /** Zero-based order in the scene */
  order: number;
  /** Why this cut was made */
  cutReason: "sentence_boundary" | "clause_transition" | "focus_shift" | "length_guardrail" | "full_scene";
  /** Character count */
  charCount: number;
}

export interface SegmentationResult {
  units: NarrativeUnit[];
  totalChars: number;
  hasExceptions: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

const MIN_CHARS_SOFT = 40;
const MAX_CHARS_SOFT = 100;
const MAX_CHARS_HARD = 180;

// ── Sentence splitting ─────────────────────────────────────────────

const splitIntoSentences = (text: string): string[] => {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [];
  return matches.map((s) => s.trim()).filter(Boolean);
};

// ── Narrative transition detection ─────────────────────────────────

interface TransitionSignal {
  type: "temporal" | "spatial" | "subject" | "contrast" | "enumeration";
  strength: number;
}

const TEMPORAL_MARKERS = /\b(then|later|after|before|meanwhile|soon|suddenly|eventually|finally|gradually|over time|by the time|when|while|during|at that point|from that moment)\b/i;
const TEMPORAL_MARKERS_FR = /\b(puis|ensuite|après|avant|pendant ce temps|soudain|finalement|progressivement|au fil du temps|lorsque|quand|alors|dès lors|à ce moment)\b/i;

const SPATIAL_MARKERS = /\b(in|at|near|inside|outside|beyond|across|throughout|here|there|elsewhere|further|nearby)\s+(the|a|an|this|that)\b/i;
const SPATIAL_MARKERS_FR = /\b(dans|à|près de|devant|derrière|au-delà|à travers|ici|là|ailleurs|plus loin)\s+(le|la|les|un|une|ce|cette)\b/i;

const CONTRAST_MARKERS = /\b(but|however|yet|nevertheless|although|despite|unlike|whereas|instead|on the contrary|in contrast)\b/i;
const CONTRAST_MARKERS_FR = /\b(mais|cependant|pourtant|néanmoins|malgré|contrairement|tandis que|en revanche|au contraire)\b/i;

function detectTransitions(text: string): TransitionSignal[] {
  const signals: TransitionSignal[] = [];
  if (TEMPORAL_MARKERS.test(text) || TEMPORAL_MARKERS_FR.test(text)) {
    signals.push({ type: "temporal", strength: 0.7 });
  }
  if (SPATIAL_MARKERS.test(text) || SPATIAL_MARKERS_FR.test(text)) {
    signals.push({ type: "spatial", strength: 0.6 });
  }
  if (CONTRAST_MARKERS.test(text) || CONTRAST_MARKERS_FR.test(text)) {
    signals.push({ type: "contrast", strength: 0.5 });
  }
  return signals;
}

// ── Clause-level splitting ─────────────────────────────────────────

const CLAUSE_BOUNDARIES_PATTERN = /(?:,\s+|\s*;\s+|\s*:\s+|\s*—\s*|\s*–\s+)/g;

function collectBoundaryPositions(text: string, regex: RegExp): number[] {
  regex.lastIndex = 0;
  const positions: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    positions.push(match.index + match[0].length);
  }

  return positions;
}

function pickBoundaryPosition(
  start: number,
  totalLength: number,
  remainingSegments: number,
  maxChars: number,
  candidates: number[]
): number | null {
  const remainingLength = totalLength - start;
  const minPos = start + Math.max(1, remainingLength - maxChars * (remainingSegments - 1));
  const maxPos = Math.min(totalLength - 1, start + maxChars);

  if (minPos > maxPos) return null;

  const idealPos = start + Math.ceil(remainingLength / remainingSegments);
  const validCandidates = candidates.filter((pos) => pos >= minPos && pos <= maxPos);
  if (validCandidates.length === 0) return null;

  return validCandidates.reduce((best, pos) =>
    Math.abs(pos - idealPos) < Math.abs(best - idealPos) ? pos : best
  );
}

function splitLongSentence(text: string, preferredBoundaries: number[]): string[] {
  const requiredSegments = Math.max(1, Math.ceil(text.length / MAX_CHARS_SOFT));
  if (requiredSegments === 1) return [text];

  const wordBoundaries = Array.from(new Set(
    collectBoundaryPositions(text, /\s+/g)
  )).sort((a, b) => a - b);

  const segments: string[] = [];
  let start = 0;
  let remainingSegments = requiredSegments;

  while (remainingSegments > 1) {
    const preferredPos = pickBoundaryPosition(
      start,
      text.length,
      remainingSegments,
      MAX_CHARS_SOFT,
      preferredBoundaries.filter((pos) => pos > start)
    );

    const fallbackPos = pickBoundaryPosition(
      start,
      text.length,
      remainingSegments,
      MAX_CHARS_SOFT,
      wordBoundaries.filter((pos) => pos > start)
    );

    const splitPos = preferredPos ?? fallbackPos ?? Math.min(text.length - 1, start + MAX_CHARS_SOFT);
    const segment = text.slice(start, splitPos).trim();
    if (!segment) break;

    segments.push(segment);
    start = splitPos;
    remainingSegments -= 1;
  }

  const tail = text.slice(start).trim();
  if (tail) segments.push(tail);

  return segments.length > 0 ? segments : [text];
}

function splitAtClauseBoundaries(sentence: string): string[] {
  if (sentence.length <= MAX_CHARS_SOFT) return [sentence];

  const preferredBoundaries = Array.from(new Set(
    collectBoundaryPositions(sentence, new RegExp(CLAUSE_BOUNDARIES_PATTERN.source, "g"))
  )).sort((a, b) => a - b);

  if (preferredBoundaries.length === 0) {
    if (sentence.length <= MAX_CHARS_HARD) return [sentence];
    return forceSplitAtWordBoundary(sentence);
  }

  return splitLongSentence(sentence, preferredBoundaries);
}

function forceSplitAtWordBoundary(text: string): string[] {
  return splitLongSentence(text, []);
}

// ── Core segmentation ──────────────────────────────────────────────

export function segmentSceneNarrative(sceneText: string): SegmentationResult {
  const normalized = sceneText.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { units: [], totalChars: 0, hasExceptions: false };
  }

  const sentences = splitIntoSentences(normalized);
  if (sentences.length === 0) {
    return {
      units: [{ text: normalized, order: 0, cutReason: "full_scene", charCount: normalized.length }],
      totalChars: normalized.length,
      hasExceptions: false,
    };
  }

  // Phase 1: Expand long multi-idea sentences
  const expandedSegments: Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }> = [];

  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHARS_SOFT) {
      expandedSegments.push({ text: sentence, cutReason: "sentence_boundary" });
    } else {
      const transitions = detectTransitions(sentence);
      const hasInternalTransition = transitions.length > 0;

      if (hasInternalTransition || sentence.length > MAX_CHARS_SOFT) {
        const clauses = splitAtClauseBoundaries(sentence);
        if (clauses.length > 1) {
          clauses.forEach((clause) => {
            const reason = hasInternalTransition ? "clause_transition" : "length_guardrail";
            expandedSegments.push({ text: clause, cutReason: reason });
          });
        } else {
          expandedSegments.push({ text: sentence, cutReason: "sentence_boundary" });
        }
      } else {
        expandedSegments.push({ text: sentence, cutReason: "sentence_boundary" });
      }
    }
  }

  // Phase 2: Merge too-short segments
  const mergedSegments = mergeShortSegments(expandedSegments);

  // Phase 3: Build NarrativeUnits
  let hasExceptions = false;
  const units: NarrativeUnit[] = mergedSegments.map((seg, idx) => {
    if (seg.text.length > MAX_CHARS_SOFT || seg.text.length < MIN_CHARS_SOFT) {
      hasExceptions = true;
    }
    return {
      text: seg.text,
      order: idx,
      cutReason: seg.cutReason,
      charCount: seg.text.length,
    };
  });

  if (units.length === 1) {
    units[0].cutReason = "full_scene";
  }

  return { units, totalChars: units.reduce((sum, u) => sum + u.charCount, 0), hasExceptions };
}

function mergeShortSegments(
  segments: Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }>
): Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }> {
  if (segments.length <= 1) return segments;

  const result: Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }> = [];

  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];

    if (current.text.length < MIN_CHARS_SOFT) {
      if (result.length > 0) {
        const prev = result[result.length - 1];
        const mergedLen = prev.text.length + current.text.length + 1;
        if (mergedLen <= MAX_CHARS_SOFT) {
          prev.text = prev.text + " " + current.text;
          continue;
        }
      }
      if (i + 1 < segments.length) {
        const next = segments[i + 1];
        const mergedLen = current.text.length + next.text.length + 1;
        if (mergedLen <= MAX_CHARS_SOFT) {
          segments[i + 1] = { text: current.text + " " + next.text, cutReason: next.cutReason };
          continue;
        }
      }
      result.push(current);
    } else {
      result.push(current);
    }
  }

  return result;
}

// ── Public helpers ─────────────────────────────────────────────────

export function computeNarrativeShotCount(sceneText: string): number {
  const { units } = segmentSceneNarrative(sceneText);
  return Math.max(1, units.length);
}

export function getNarrativeSegments(sceneText: string): string[] {
  const { units } = segmentSceneNarrative(sceneText);
  return units.map((u) => u.text);
}
