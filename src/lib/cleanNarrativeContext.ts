/**
 * Strip boilerplate (identity locks, quality target, aspect ratio, anti-text-leak,
 * "Subject:" / "Visual details:" prefixes) from a stored prompt_export so that
 * only the actual narrative context remains in the UI editor.
 *
 * Mirrors supabase/functions/_shared/identity-lock-utils.ts but trimmed for
 * frontend display/edit.
 */
export function cleanNarrativeContext(input: string | null | undefined): string {
  if (!input) return "";
  let out = input;

  const endMarkers =
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
      "Ratio\\s+d['’]aspect\\s*:",
      "Aspect\\s+ratio\\s*:",
      "Subject\\s*:",
      "Visual\\s+details\\s*:",
      "Style\\s*:",
      "$",
    ].join("|") +
    ")";

  // Identity lock blocks (repeat passes for stacked blocks)
  const headerRe = /(CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK\s*:/i;
  let safety = 12;
  while (safety-- > 0 && headerRe.test(out)) {
    const blockRe = new RegExp(
      `(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\\s+IDENTITY\\s+LOCK\\s*:[\\s\\S]*?${endMarkers}`,
      "i",
    );
    const before = out;
    out = out.replace(blockRe, " ");
    if (out === before) break;
  }

  const orphans = [
    `VERSION\\s*\\/\\s*TIME\\s+PERIOD\\s+LOCK\\s*:[\\s\\S]*?${endMarkers}`,
    `TIME\\s+PERIOD\\s*\\/\\s*HISTORICAL\\s+STATE\\s+LOCK\\s*:[\\s\\S]*?${endMarkers}`,
    `REFERENCE\\s+IMAGES\\s+PROVIDED\\s*:[\\s\\S]*?${endMarkers}`,
    `NO\\s+(?:OBJECT|TEMPORAL|CHARACTER|LOCATION)\\s+DRIFT\\s*:[\\s\\S]*?${endMarkers}`,
    `Qualité\\s+visuelle\\s*:[\\s\\S]*?${endMarkers}`,
    `Quality\\s+target\\s*:[\\s\\S]*?${endMarkers}`,
    `Ratio\\s+d['’]aspect\\s*:[\\s\\S]*?${endMarkers}`,
    `Aspect\\s+ratio\\s*:[\\s\\S]*?${endMarkers}`,
    `Any\\s+visible\\s+writing[\\s\\S]*?${endMarkers}`,
    `Subject\\s*:[\\s\\S]*?${endMarkers}`,
    `Image\\s+documentaire\\s+historique[\\s\\S]*?${endMarkers}`,
    `Style\\s*:[\\s\\S]*?${endMarkers}`,
  ];
  for (const pat of orphans) {
    out = out.replace(new RegExp(pat, "gi"), " ");
  }

  // "Visual details:" is the actual narrative payload — keep its content, drop the label.
  out = out.replace(/Visual\s+details\s*:\s*/i, "");

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}