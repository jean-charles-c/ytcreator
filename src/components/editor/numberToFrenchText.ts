/**
 * Converts all digit-based numbers in a French text to their word equivalents.
 * E.g. "La Ferrari F40 de 1987 avec 959 chevaux" → "La Ferrari F quarante de mille neuf cent quatre-vingt-sept avec neuf cent cinquante-neuf chevaux"
 */

const UNITS = [
  "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = [
  "", "dix", "vingt", "trente", "quarante", "cinquante",
  "soixante", "soixante", "quatre-vingt", "quatre-vingt",
];

function numberToFrench(n: number): string {
  if (n < 0) return "moins " + numberToFrench(-n);
  if (n === 0) return "zéro";
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 1 && t !== 8) return TENS[t] + " et un";
    return u === 0 ? TENS[t] : TENS[t] + "-" + UNITS[u];
  }
  if (n < 80) {
    const u = n - 60;
    if (u === 11) return "soixante et onze";
    return "soixante-" + UNITS[u];
  }
  if (n < 100) {
    const u = n - 80;
    if (u === 0) return "quatre-vingts";
    return "quatre-vingt-" + UNITS[u];
  }
  if (n < 200) {
    const r = n - 100;
    return r === 0 ? "cent" : "cent " + numberToFrench(r);
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const prefix = UNITS[h] + " cents";
    return r === 0 ? prefix : UNITS[h] + " cent " + numberToFrench(r);
  }
  if (n < 2000) {
    const r = n - 1000;
    return r === 0 ? "mille" : "mille " + numberToFrench(r);
  }
  if (n < 1_000_000) {
    const t = Math.floor(n / 1000);
    const r = n % 1000;
    const prefix = numberToFrench(t) + " mille";
    return r === 0 ? prefix : prefix + " " + numberToFrench(r);
  }
  if (n < 2_000_000) {
    const r = n - 1_000_000;
    return r === 0 ? "un million" : "un million " + numberToFrench(r);
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000);
    const r = n % 1_000_000;
    const prefix = numberToFrench(m) + " millions";
    return r === 0 ? prefix : prefix + " " + numberToFrench(r);
  }
  // Fallback: return as-is
  return String(n);
}

/**
 * Replace all numbers in a text with their French word equivalents.
 * Handles:
 * - Pure numbers: "1987" → "mille neuf cent quatre-vingt-sept"
 * - Mixed alphanumeric: "F40" → "F quarante"
 * - Decimal with comma: "3,5" → "trois virgule cinq"
 * - Large numbers with spaces: "100 000" → "cent mille"
 */
export function convertNumbersToFrench(text: string): string {
  // First, handle "large" numbers written with spaces like "100 000" or "1 000 000"
  let result = text.replace(/\b(\d{1,3}(?:\s\d{3})+)\b/g, (match) => {
    const n = parseInt(match.replace(/\s/g, ""), 10);
    if (isNaN(n) || n > 999_999_999) return match;
    return numberToFrench(n);
  });

  // Handle decimal numbers with comma: "3,5" → "trois virgule cinq"
  result = result.replace(/\b(\d+),(\d+)\b/g, (_, intPart, decPart) => {
    const intN = parseInt(intPart, 10);
    const decN = parseInt(decPart, 10);
    if (isNaN(intN) || isNaN(decN)) return _;
    return numberToFrench(intN) + " virgule " + numberToFrench(decN);
  });

  // Handle remaining tokens with digits
  result = result.replace(/\b([A-Za-zÀ-ÿ]*\d[\dA-Za-zÀ-ÿ]*)\b/g, (token) => {
    // Pure number
    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      if (n <= 999_999_999) return numberToFrench(n);
      return token;
    }
    // Mixed alphanumeric: split into letter/digit groups
    const parts = token.match(/[a-zA-ZÀ-ÿ]+|\d+/g);
    if (!parts) return token;
    return parts
      .map((p) => {
        if (/^\d+$/.test(p)) {
          const n = parseInt(p, 10);
          return n <= 999_999_999 ? numberToFrench(n) : p;
        }
        return p;
      })
      .join(" ");
  });

  return result;
}

/**
 * Check if a text contains any digits that could be converted.
 */
export function hasDigits(text: string): boolean {
  return /\d/.test(text);
}

/**
 * Count how many number tokens are in the text.
 */
export function countNumbers(text: string): number {
  const matches = text.match(/\b\d[\d\s,.]*\d\b|\b\d+\b/g);
  return matches ? matches.length : 0;
}
