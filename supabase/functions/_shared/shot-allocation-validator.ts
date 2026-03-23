/**
 * ShotFragment Allocation Validator
 *
 * Validates that shot fragments form a proper partition of the scene text:
 * - Ordered (fragments follow reading order)
 * - Non-overlapping (no text assigned to multiple shots)
 * - Complete (all scene text is covered)
 * - Unique (no duplicate fragments)
 */

// ── Types ──────────────────────────────────────────────────────────

export interface AllocationIssue {
  type: "overlap" | "gap" | "duplicate" | "order_violation" | "orphan" | "empty_fragment";
  shotIndex: number;
  detail: string;
}

export interface AllocationReport {
  valid: boolean;
  coveragePercent: number;
  issues: AllocationIssue[];
  /** Positions of text covered by fragments */
  coveredRanges: Array<{ start: number; end: number; shotIndex: number }>;
  /** Uncovered text portions */
  gaps: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

const normalizeForMatch = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

// ── Core validation ────────────────────────────────────────────────

/**
 * Validate that shot source_sentences partition the scene source_text.
 */
export function validateAllocation(
  sceneText: string,
  shotFragments: string[]
): AllocationReport {
  const issues: AllocationIssue[] = [];
  const normalizedScene = normalizeForMatch(sceneText);
  const coveredRanges: AllocationReport["coveredRanges"] = [];

  if (!normalizedScene) {
    return { valid: true, coveragePercent: 100, issues: [], coveredRanges: [], gaps: [] };
  }

  // Check for empty fragments
  shotFragments.forEach((frag, idx) => {
    if (!frag || !frag.trim()) {
      issues.push({ type: "empty_fragment", shotIndex: idx, detail: `Shot ${idx + 1} has no source fragment` });
    }
  });

  // Check for duplicates
  const seen = new Map<string, number>();
  shotFragments.forEach((frag, idx) => {
    const key = normalizeForMatch(frag);
    if (!key) return;
    if (seen.has(key)) {
      issues.push({
        type: "duplicate",
        shotIndex: idx,
        detail: `Shot ${idx + 1} duplicates shot ${seen.get(key)! + 1}: "${frag.slice(0, 50)}..."`,
      });
    } else {
      seen.set(key, idx);
    }
  });

  // Find each fragment's position in scene text
  let lastEnd = -1;
  for (let idx = 0; idx < shotFragments.length; idx++) {
    const frag = shotFragments[idx];
    if (!frag || !frag.trim()) continue;

    const normalizedFrag = normalizeForMatch(frag);
    const searchStart = Math.max(0, lastEnd);
    const pos = normalizedScene.indexOf(normalizedFrag, searchStart);

    if (pos === -1) {
      // Try from beginning (might be out of order)
      const altPos = normalizedScene.indexOf(normalizedFrag);
      if (altPos === -1) {
        issues.push({
          type: "orphan",
          shotIndex: idx,
          detail: `Shot ${idx + 1} fragment not found in scene text: "${frag.slice(0, 60)}..."`,
        });
      } else {
        // Found but out of order
        issues.push({
          type: "order_violation",
          shotIndex: idx,
          detail: `Shot ${idx + 1} fragment found at position ${altPos} but expected after position ${lastEnd}`,
        });
        coveredRanges.push({ start: altPos, end: altPos + normalizedFrag.length, shotIndex: idx });
      }
    } else {
      // Check for gap between last fragment and this one
      if (lastEnd >= 0 && pos > lastEnd) {
        const gapText = normalizedScene.slice(lastEnd, pos).trim();
        if (gapText.length > 0) {
          // Small gaps (whitespace, punctuation) are acceptable
          const significantGap = gapText.replace(/[\s.,;:!?'"()-–—]/g, "");
          if (significantGap.length > 0) {
            issues.push({
              type: "gap",
              shotIndex: idx,
              detail: `Uncovered text between shots ${idx} and ${idx + 1}: "${gapText.slice(0, 50)}"`,
            });
          }
        }
      }

      // Check for overlap with previous range
      if (lastEnd > pos) {
        issues.push({
          type: "overlap",
          shotIndex: idx,
          detail: `Shot ${idx + 1} overlaps with previous shot (positions ${pos}-${pos + normalizedFrag.length} vs last end ${lastEnd})`,
        });
      }

      coveredRanges.push({ start: pos, end: pos + normalizedFrag.length, shotIndex: idx });
      lastEnd = pos + normalizedFrag.length;
    }
  }

  // Calculate coverage
  const coveredChars = new Set<number>();
  for (const range of coveredRanges) {
    for (let i = range.start; i < range.end; i++) {
      coveredChars.add(i);
    }
  }

  // Only count significant chars for coverage
  const significantChars = [...normalizedScene].filter((c, i) => !/[\s]/.test(c));
  const significantCovered = significantChars.filter((_, i) => {
    // Find position of this significant char in original string
    let sigIdx = 0;
    for (let j = 0; j < normalizedScene.length; j++) {
      if (!/[\s]/.test(normalizedScene[j])) {
        if (sigIdx === i) return coveredChars.has(j);
        sigIdx++;
      }
    }
    return false;
  });

  const coveragePercent = significantChars.length > 0
    ? Math.round((significantCovered.length / significantChars.length) * 100)
    : 100;

  // Find gaps
  const gaps: string[] = [];
  if (coveredRanges.length > 0) {
    const sorted = [...coveredRanges].sort((a, b) => a.start - b.start);
    // Check start
    if (sorted[0].start > 0) {
      const gapText = normalizedScene.slice(0, sorted[0].start).trim();
      if (gapText) gaps.push(gapText);
    }
    // Check between
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start > sorted[i - 1].end) {
        const gapText = normalizedScene.slice(sorted[i - 1].end, sorted[i].start).trim();
        if (gapText) gaps.push(gapText);
      }
    }
    // Check end
    const lastRange = sorted[sorted.length - 1];
    if (lastRange.end < normalizedScene.length) {
      const gapText = normalizedScene.slice(lastRange.end).trim();
      if (gapText) gaps.push(gapText);
    }
  }

  const hasBlockingIssues = issues.some((i) =>
    i.type === "overlap" || i.type === "duplicate" || i.type === "orphan"
  );

  return {
    valid: !hasBlockingIssues && coveragePercent >= 80,
    coveragePercent,
    issues,
    coveredRanges,
    gaps,
  };
}

/**
 * Auto-repair allocation by re-assigning fragments from narrative segments.
 * Returns corrected source_sentence values for each shot.
 */
export function repairAllocation(
  sceneText: string,
  narrativeSegments: string[],
  currentFragments: string[]
): string[] {
  // If counts match and allocation is valid, keep current
  if (currentFragments.length === narrativeSegments.length) {
    const report = validateAllocation(sceneText, currentFragments);
    if (report.valid) return currentFragments;
  }

  // Re-assign from narrative segments (deterministic source of truth)
  return narrativeSegments;
}
