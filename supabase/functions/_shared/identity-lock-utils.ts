/**
 * Strip every legacy verbose Identity Lock block found in a prompt — whether
 * it sits at the very beginning OR is glued in the middle of the prompt body.
 *
 * Historical context: early storyboards stored the full identity lock block
 * (OBJECT/CHARACTER/LOCATION/VEHICLE IDENTITY LOCK + VERSION/TIME PERIOD LOCK
 * + REFERENCE IMAGES PROVIDED + NO ... DRIFT) directly inside `prompt_export`.
 * Newer code re-injects condensed identity anchors at render time from the
 * registry's `mentions_shots`, so leaving the legacy block intact:
 *   1) duplicates the lock,
 *   2) drowns the per-shot narrative fragment under ~1500 chars of boilerplate,
 *   3) anchors the model on whichever object happens to be locked first,
 *      producing visually identical images across consecutive shots.
 *
 * This stripper is intentionally tolerant: it accepts blocks at any position
 * and uses look-ahead markers to detect each block's end without depending
 * on exact whitespace.
 */
export const stripLegacyIdentityLockBlocks = (prompt: string): string => {
  if (!prompt) return prompt;

  let out = prompt;

  // 1. Remove every "(CHARACTER|LOCATION|OBJECT|VEHICLE) IDENTITY LOCK:" block.
  //    A block ends at the next legacy marker or at one of the suffix anchors
  //    that appear right after all locks in the historical format.
  const lockEndMarkers =
    "(?=" +
    [
      "(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\\s+IDENTITY\\s+LOCK\\s*:",
      "VERSION\\s*\\/\\s*TIME\\s+PERIOD\\s+LOCK\\s*:",
      "TIME\\s+PERIOD\\s*\\/\\s*HISTORICAL\\s+STATE\\s+LOCK\\s*:",
      "REFERENCE\\s+IMAGES\\s+PROVIDED\\s*:",
      "NO\\s+(?:OBJECT|TEMPORAL|CHARACTER|LOCATION)\\s+DRIFT\\s*:",
      "Image\\s+documentaire\\s+historique",
      "Qualité\\s+visuelle\\s*:",
      "Quality\\s+target\\s*:",
      "Any\\s+visible\\s+writing",
      "Ratio\\s+d'aspect\\s*:",
      "Aspect\\s+ratio\\s*:",
      "Style\\s*:",
      "$",
    ].join("|") +
    ")";

  // Repeat passes until no more legacy headers are found (handles N stacked locks).
  const headerRe = /(CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK\s*:/i;
  let safety = 12;
  while (safety-- > 0 && headerRe.test(out)) {
    const blockRe = new RegExp(
      `(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\\s+IDENTITY\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "i",
    );
    const before = out;
    out = out.replace(blockRe, " ");
    if (out === before) break; // no progress, avoid infinite loop
  }

  // 2. Remove orphan VERSION/TIME PERIOD LOCK and REFERENCE IMAGES PROVIDED
  //    blocks that may remain if the IDENTITY LOCK header itself was missing.
  const orphanBlocks = [
    new RegExp(
      `VERSION\\s*\\/\\s*TIME\\s+PERIOD\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
    new RegExp(
      `TIME\\s+PERIOD\\s*\\/\\s*HISTORICAL\\s+STATE\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
    new RegExp(
      `REFERENCE\\s+IMAGES\\s+PROVIDED\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
    new RegExp(
      `NO\\s+(?:OBJECT|TEMPORAL|CHARACTER|LOCATION)\\s+DRIFT\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
  ];
  for (const re of orphanBlocks) out = out.replace(re, " ");

  // 3. Compress whitespace and stray separators left behind by the strips.
  out = out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return out;
};

/**
 * Backwards-compatible alias: older call sites still import the prefix-only
 * stripper. Forward to the new full-body stripper which is a strict superset.
 */
export const stripLegacyIdentityLockPrefix = stripLegacyIdentityLockBlocks;