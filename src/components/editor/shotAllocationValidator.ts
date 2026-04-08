/**
 * ShotFragment Allocation Validator (client-side mirror)
 *
 * Validates that shot fragments form a proper partition of the scene text.
 */

export interface AllocationIssue {
  type: "overlap" | "gap" | "duplicate" | "order_violation" | "orphan" | "empty_fragment";
  shotIndex: number;
  detail: string;
}

export interface AllocationReport {
  valid: boolean;
  coveragePercent: number;
  issues: AllocationIssue[];
  coveredRanges: Array<{ start: number; end: number; shotIndex: number }>;
  gaps: string[];
}

const normalizeForMatch = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

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
  // Strategy: first try sequential indexOf (fast path), then fallback to
  // individual search without sequence constraint to avoid cascading false positives.
  const fragmentPositions: Array<{ start: number; end: number; shotIndex: number } | null> = [];
  let lastEnd = -1;

  for (let idx = 0; idx < shotFragments.length; idx++) {
    const frag = shotFragments[idx];
    if (!frag || !frag.trim()) {
      fragmentPositions.push(null);
      continue;
    }

    const normalizedFrag = normalizeForMatch(frag);
    const searchStart = Math.max(0, lastEnd);
    const pos = normalizedScene.indexOf(normalizedFrag, searchStart);

    if (pos >= 0) {
      fragmentPositions.push({ start: pos, end: pos + normalizedFrag.length, shotIndex: idx });
      lastEnd = pos + normalizedFrag.length;
    } else {
      fragmentPositions.push(null); // will be resolved in fallback pass
    }
  }

  // Fallback pass: for fragments not found sequentially, search anywhere
  for (let idx = 0; idx < shotFragments.length; idx++) {
    if (fragmentPositions[idx] !== null) continue;
    const frag = shotFragments[idx];
    if (!frag || !frag.trim()) continue;

    const normalizedFrag = normalizeForMatch(frag);
    const pos = normalizedScene.indexOf(normalizedFrag);

    if (pos >= 0) {
      // Found but out of sequence — report as order_violation (warning-level), not orphan
      fragmentPositions[idx] = { start: pos, end: pos + normalizedFrag.length, shotIndex: idx };
      issues.push({
        type: "order_violation",
        shotIndex: idx,
        detail: `Shot ${idx + 1} fragment found but out of expected sequence`,
      });
    } else {
      issues.push({
        type: "orphan",
        shotIndex: idx,
        detail: `Shot ${idx + 1} fragment not found in scene text: "${frag.slice(0, 60)}..."`,
      });
    }
  }

  // Build coveredRanges and detect gaps/overlaps from resolved positions
  const resolvedPositions = fragmentPositions
    .filter((p): p is { start: number; end: number; shotIndex: number } => p !== null)
    .sort((a, b) => a.start - b.start);

  for (const rp of resolvedPositions) {
    coveredRanges.push(rp);
  }

  // Detect gaps between consecutive covered ranges
  for (let i = 1; i < resolvedPositions.length; i++) {
    const prev = resolvedPositions[i - 1];
    const curr = resolvedPositions[i];
    if (curr.start > prev.end) {
      const gapText = normalizedScene.slice(prev.end, curr.start).trim();
      if (gapText.length > 0) {
        const significantGap = gapText.replace(/[\s.,;:!?'"()\-–—]/g, "");
        if (significantGap.length > 0) {
          issues.push({
            type: "gap",
            shotIndex: curr.shotIndex,
            detail: `Uncovered text between shots: "${gapText.slice(0, 50)}"`,
          });
        }
      }
    }
    if (prev.end > curr.start) {
      issues.push({
        type: "overlap",
        shotIndex: curr.shotIndex,
        detail: `Shot ${curr.shotIndex + 1} overlaps with previous shot`,
      });
    }
  }

  // Calculate coverage (word-level)
  const sceneWords = normalizedScene.split(/\s+/).filter(Boolean);
  const fragText = shotFragments.map(normalizeForMatch).join(" ");
  const fragWords = new Set(fragText.split(/\s+/).filter(Boolean));
  let matchedWords = 0;
  for (const w of sceneWords) {
    if (fragWords.has(w)) matchedWords++;
  }
  const coveragePercent = sceneWords.length > 0
    ? Math.round((matchedWords / sceneWords.length) * 100)
    : 100;

  // Find gaps
  const gaps: string[] = [];
  if (coveredRanges.length > 0) {
    const sorted = [...coveredRanges].sort((a, b) => a.start - b.start);
    if (sorted[0].start > 0) {
      const g = normalizedScene.slice(0, sorted[0].start).trim();
      if (g) gaps.push(g);
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start > sorted[i - 1].end) {
        const g = normalizedScene.slice(sorted[i - 1].end, sorted[i].start).trim();
        if (g) gaps.push(g);
      }
    }
    const last = sorted[sorted.length - 1];
    if (last.end < normalizedScene.length) {
      const g = normalizedScene.slice(last.end).trim();
      if (g) gaps.push(g);
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

export function repairAllocation(
  sceneText: string,
  narrativeSegments: string[],
  currentFragments: string[]
): string[] {
  if (currentFragments.length === narrativeSegments.length) {
    const report = validateAllocation(sceneText, currentFragments);
    if (report.valid) return currentFragments;
  }
  return narrativeSegments;
}
