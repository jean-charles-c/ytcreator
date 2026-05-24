/**
 * Frontend mirror of supabase/functions/_shared/identity-lock-utils.ts
 * Strips legacy verbose IDENTITY LOCK / VERSION LOCK / REFERENCE IMAGES /
 * NO DRIFT / quality / aspect-ratio / anti-text-leak blocks from a
 * narrative-context string so only the human-readable "Style : ..."
 * narrative remains visible/editable in the UI.
 */
export function stripLegacyIdentityLockBlocks(prompt: string | null | undefined): string {
  if (!prompt) return "";
  let out = prompt;

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
      "Subject\\s*:",
      "Visual\\s+details\\s*:",
      "Style\\s*:",
      "$",
    ].join("|") +
    ")";

  const headerRe = /(CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK\s*:/i;
  let safety = 12;
  while (safety-- > 0 && headerRe.test(out)) {
    const blockRe = new RegExp(
      `(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\\s+IDENTITY\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "i",
    );
    const before = out;
    out = out.replace(blockRe, " ");
    if (out === before) break;
  }

  const orphanBlocks = [
    new RegExp(`Qualité\\s+visuelle\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`Quality\\s+target\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`Ratio\\s+d'aspect\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`Aspect\\s+ratio\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`Subject\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`VERSION\\s*\\/\\s*TIME\\s+PERIOD\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`TIME\\s+PERIOD\\s*\\/\\s*HISTORICAL\\s+STATE\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`REFERENCE\\s+IMAGES\\s+PROVIDED\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`NO\\s+(?:OBJECT|TEMPORAL|CHARACTER|LOCATION)\\s+DRIFT\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`Visual\\s+details\\s*:[\\s\\S]*?${lockEndMarkers}`, "gi"),
    new RegExp(`Image\\s+documentaire\\s+historique[\\s\\S]*?${lockEndMarkers}`, "gi"),
    // Anti-text-leak boilerplate ("Any visible writing ... independent from the prompt wording.")
    /Any\s+visible\s+writing[\s\S]*?(?:prompt\s+wording\.|independent\s+from\s+the\s+prompt\s+wording\.)/gi,
  ];
  for (const re of orphanBlocks) out = out.replace(re, " ");

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}