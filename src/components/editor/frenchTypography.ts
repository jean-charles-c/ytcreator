/**
 * French typography post-processing rules:
 * 1. Replace colons ":" with periods "."
 * 2. Ensure a space before ?, !, and ; (French typographic convention)
 */
export function applyFrenchTypography(text: string): string {
  return text
    // Replace colons with periods (but not in time formats like 12:30 or URLs)
    .replace(/(?<!\d):\s*/g, ". ")
    // Ensure space before ? ! ;
    .replace(/(\S)([?!;])/g, "$1 $2")
    // Clean up double spaces that may result
    .replace(/ {2,}/g, " ");
}
