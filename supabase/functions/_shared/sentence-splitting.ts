const SENTENCE_DOT_PLACEHOLDER = "∯";

function protectAcronymDots(text: string): string {
  return text.replace(/\b(?:[A-ZÀ-ÖØ-Þ]\.){2,}/g, (match) =>
    match.replace(/\./g, SENTENCE_DOT_PLACEHOLDER)
  );
}

function restoreAcronymDots(text: string): string {
  return text.replace(new RegExp(SENTENCE_DOT_PLACEHOLDER, "g"), ".");
}

export function splitTextIntoSentences(text: string): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const protectedText = protectAcronymDots(normalized);
  const sentences = protectedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => restoreAcronymDots(sentence).trim())
    .filter(Boolean);

  return sentences.length > 0 ? sentences : [normalized];
}
