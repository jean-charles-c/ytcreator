/**
 * Narrative Segmentation Engine
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
  /** Total characters covered */
  totalChars: number;
  hasExceptions: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

const MIN_CHARS_SOFT = 40;
const MAX_CHARS_SOFT = 120;
const MAX_CHARS_HARD = 180; // absolute ceiling before forced split

// ── Sentence splitting ─────────────────────────────────────────────

const splitIntoSentences = (text: string): string[] => {
  // Split on sentence-ending punctuation followed by space or end
  const matches = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [];
  return matches.map((s) => s.trim()).filter(Boolean);
};

// ── Narrative transition detection ─────────────────────────────────

interface TransitionSignal {
  type: "temporal" | "spatial" | "subject" | "contrast" | "enumeration";
  strength: number; // 0-1
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

// ── Clause-level splitting for long sentences ──────────────────────

const CLAUSE_BOUNDARIES = /(?:,\s+|\s*;\s+|\s*:\s+|\s*—\s*|\s*–\s+)/g;

function splitAtClauseBoundaries(sentence: string): string[] {
  if (sentence.length <= MAX_CHARS_SOFT) return [sentence];

  // Find clause boundaries
  const boundaries: number[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(CLAUSE_BOUNDARIES.source, "g");
  while ((match = regex.exec(sentence)) !== null) {
    boundaries.push(match.index + match[0].length);
  }

  if (boundaries.length === 0) {
    // No clause boundaries — check if truly multi-idea
    // If it's a single coherent idea, keep it whole (exception)
    if (sentence.length <= MAX_CHARS_HARD) return [sentence];
    // Forced split at word boundary near midpoint
    return forceSplitAtWordBoundary(sentence);
  }

  // Try to find optimal split points that keep segments in guard-rail range
  return greedyClauseSplit(sentence, boundaries);
}

function greedyClauseSplit(text: string, boundaries: number[]): string[] {
  const segments: string[] = [];
  let start = 0;

  for (const boundary of boundaries) {
    const currentLength = boundary - start;
    const remainingLength = text.length - boundary;

    // If current segment is in good range and remaining is also viable
    if (currentLength >= MIN_CHARS_SOFT && remainingLength >= MIN_CHARS_SOFT) {
      // Check if keeping going would exceed soft max
      const nextBoundary = boundaries.find((b) => b > boundary);
      const nextSegmentEnd = nextBoundary ?? text.length;
      const withNextLength = nextSegmentEnd - start;

      if (withNextLength > MAX_CHARS_SOFT && currentLength >= MIN_CHARS_SOFT) {
        segments.push(text.slice(start, boundary).trim());
        start = boundary;
      }
    }
  }

  // Add remaining
  const tail = text.slice(start).trim();
  if (tail) {
    // If tail is too short, merge with previous
    if (tail.length < MIN_CHARS_SOFT && segments.length > 0) {
      segments[segments.length - 1] += " " + tail;
    } else {
      segments.push(tail);
    }
  }

  return segments.length > 0 ? segments : [text];
}

function forceSplitAtWordBoundary(text: string): string[] {
  const words = text.split(/\s+/);
  const midWord = Math.ceil(words.length / 2);
  const first = words.slice(0, midWord).join(" ");
  const second = words.slice(midWord).join(" ");
  return [first, second].filter(Boolean);
}

// ── Core segmentation logic ────────────────────────────────────────

/**
 * Segment a scene's text into NarrativeUnits.
 *
 * Algorithm:
 * 1. Split into sentences
 * 2. For each sentence, check if it contains narrative transitions at clause level
 * 3. Long sentences with multiple ideas → split at clause boundaries
 * 4. Short sentences that are weak → merge with neighbor if same idea
 * 5. Apply soft guard-rails with justified exceptions
 */
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

  // Phase 1: Expand long multi-idea sentences into clause segments
  const expandedSegments: Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }> = [];

  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHARS_SOFT) {
      // Short enough — keep as-is
      expandedSegments.push({ text: sentence, cutReason: "sentence_boundary" });
    } else {
      // Check for narrative transitions within the sentence
      const transitions = detectTransitions(sentence);
      const hasInternalTransition = transitions.length > 0;

      if (hasInternalTransition || sentence.length > MAX_CHARS_SOFT) {
        // Split at clause boundaries
        const clauses = splitAtClauseBoundaries(sentence);
        if (clauses.length > 1) {
          clauses.forEach((clause) => {
            const reason = hasInternalTransition ? "clause_transition" : "length_guardrail";
            expandedSegments.push({ text: clause, cutReason: reason });
          });
        } else {
          // Couldn't split meaningfully — keep as exception
          expandedSegments.push({ text: sentence, cutReason: "sentence_boundary" });
        }
      } else {
        expandedSegments.push({ text: sentence, cutReason: "sentence_boundary" });
      }
    }
  }

  // Phase 2: Merge too-short segments with neighbors
  const mergedSegments = mergeShortSegments(expandedSegments);

  // Phase 3: Build final NarrativeUnits
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

  // Special case: single sentence scene
  if (units.length === 1) {
    units[0].cutReason = "full_scene";
  }

  return {
    units,
    totalChars: units.reduce((sum, u) => sum + u.charCount, 0),
    hasExceptions,
  };
}

function mergeShortSegments(
  segments: Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }>
): Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }> {
  if (segments.length <= 1) return segments;

  const result: Array<{ text: string; cutReason: NarrativeUnit["cutReason"] }> = [];

  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];

    if (current.text.length < MIN_CHARS_SOFT) {
      // Try to merge with previous or next
      if (result.length > 0) {
        const prev = result[result.length - 1];
        const mergedLen = prev.text.length + current.text.length + 1;
        // Merge with previous if result stays within soft max
        if (mergedLen <= MAX_CHARS_SOFT) {
          prev.text = prev.text + " " + current.text;
          continue;
        }
      }

      // Try to merge with next
      if (i + 1 < segments.length) {
        const next = segments[i + 1];
        const mergedLen = current.text.length + next.text.length + 1;
        if (mergedLen <= MAX_CHARS_SOFT) {
          segments[i + 1] = {
            text: current.text + " " + next.text,
            cutReason: next.cutReason,
          };
          continue;
        }
      }

      // Can't merge without exceeding — keep as exception
      result.push(current);
    } else {
      result.push(current);
    }
  }

  return result;
}

// ── Public helper: compute shot count from narrative segmentation ──

export function computeNarrativeShotCount(sceneText: string): number {
  const { units } = segmentSceneNarrative(sceneText);
  return Math.max(1, units.length);
}

// ── Public helper: get segments as string array (for compatibility) ──

export function getNarrativeSegments(sceneText: string): string[] {
  const { units } = segmentSceneNarrative(sceneText);
  return units.map((u) => u.text);
}
