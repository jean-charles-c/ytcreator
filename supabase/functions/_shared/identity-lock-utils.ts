/**
 * Strip a legacy verbose Identity Lock block (OBJECT/CHARACTER/LOCATION/VEHICLE
 * IDENTITY LOCK + VERSION/TIME PERIOD LOCK + REFERENCE IMAGES + NO ... DRIFT)
 * that may have been prepended to a previously-generated prompt_export.
 *
 * The full lock is re-injected at render time by generate-shot-image /
 * generate-shot-image-kie using the registry's `mentions_shots` (source of
 * truth). Leaving the legacy block stored at the top of `prompt_export`
 * either duplicates it or, worse, injects the lock for an object that
 * doesn't actually appear in the shot — biasing the model toward making
 * the recurring object the centered subject of every frame.
 */
export const stripLegacyIdentityLockPrefix = (prompt: string): string => {
  if (!prompt) return prompt;
  const lockHeaderRegex = /^\s*(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK\s*:/i;
  if (!lockHeaderRegex.test(prompt)) return prompt;
  // Find where the descriptive content really starts.
  const cutMarkers = [
    /\n\s*Style\s*:/i,
    /\n\s*Visual\s+style\s*:/i,
    /\n\s*FRAMING\s*&\s*ACTION\s*:/i,
    /\n\s*DETAILED\s+VISUAL\s+DESCRIPTION/i,
  ];
  for (const re of cutMarkers) {
    const m = prompt.match(re);
    if (m && typeof m.index === "number" && m.index > 0) {
      return prompt.slice(m.index).replace(/^\s+/, "");
    }
  }
  return prompt;
};