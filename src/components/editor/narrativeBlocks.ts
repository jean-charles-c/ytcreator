/**
 * NarrativeBlock — Unité textuelle séquentielle issue du pré-traitement.
 *
 * Chaque bloc conserve sa position d'origine et porte des signaux
 * contextuels légers utilisés en aval par le SegmentationEngine.
 * Aucune classification narrative n'est effectuée ici.
 */

/* ── Contextual signals ────────────────────────────── */

export interface BlockSignals {
  /** Contains a direct question (? detected) */
  hasQuestion: boolean;
  /** Mentions a location / place change indicator */
  hasLocationCue: boolean;
  /** Contains a temporal shift marker (years later, meanwhile, etc.) */
  hasTemporalShift: boolean;
  /** Contains a revelation / twist pattern */
  hasRevelation: boolean;
  /** Sentence count in this block */
  sentenceCount: number;
  /** Character length of trimmed content */
  charCount: number;
}

/* ── NarrativeBlock ────────────────────────────────── */

export interface NarrativeBlock {
  /** Zero-based sequential index preserving original order */
  index: number;
  /** Cleaned raw text content (trimmed, no stray artifacts) */
  content: string;
  /** Lightweight contextual signals */
  signals: BlockSignals;
}

/* ── Signal detection patterns ─────────────────────── */

const LOCATION_PATTERNS = [
  /\b(in|at|near|inside|outside|beneath|above|within)\s+(the\s+)?[A-Z]/,
  /\b(à|dans|près de|devant|derrière|sous|sur|au\s+(sein|cœur)\s+de)\s+/i,
  /\b(city|town|village|temple|church|cave|mountain|river|island|forest|laboratory|museum|library)\b/i,
  /\b(ville|temple|église|grotte|montagne|rivière|île|forêt|laboratoire|musée|bibliothèque)\b/i,
];

const TEMPORAL_PATTERNS = [
  /\b(\d+)\s+(years?|months?|decades?|centuries?|days?)\s+(later|earlier|before|after|ago)\b/i,
  /\b(meanwhile|at the same time|by then|soon after|years passed|time went by)\b/i,
  /\b(pendant ce temps|des années plus tard|quelques mois après|entre-temps|au même moment)\b/i,
  /\b(in\s+\d{3,4}|en\s+\d{3,4})\b/,
];

const REVELATION_PATTERNS = [
  /\b(but\s+(the\s+)?truth|the\s+real\s+(reason|story|answer)|what\s+(really|actually)\s+happened)\b/i,
  /\b(it\s+turns?\s+out|the\s+shocking\s+(truth|reality)|no\s+one\s+(knew|expected|realized))\b/i,
  /\b(en\s+réalité|la\s+vérité|le\s+vrai\s+(raison|secret)|ce\s+que\s+personne\s+ne\s+savait)\b/i,
  /\b(révélation|découverte\s+stupéfiante|retournement)\b/i,
];

/* ── Core functions ────────────────────────────────── */

function detectSignals(text: string): BlockSignals {
  return {
    hasQuestion: /\?/.test(text),
    hasLocationCue: LOCATION_PATTERNS.some((p) => p.test(text)),
    hasTemporalShift: TEMPORAL_PATTERNS.some((p) => p.test(text)),
    hasRevelation: REVELATION_PATTERNS.some((p) => p.test(text)),
    sentenceCount: countSentences(text),
    charCount: text.length,
  };
}

function countSentences(text: string): number {
  // Split on sentence-ending punctuation followed by space or end
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : (text.trim() ? 1 : 0);
}

/**
 * Clean raw text: collapse whitespace, remove stray markdown artifacts,
 * normalize line breaks. Does NOT alter word content or reorder anything.
 */
function cleanRawText(raw: string): string {
  return raw
    // Strip stray markdown headers
    .replace(/^#{1,3}\s+.+$/gm, "")
    // Strip bold-only lines (section labels that leaked)
    .replace(/^\*\*[^*]+\*\*\s*$/gm, "")
    // Strip horizontal rules
    .replace(/^-{3,}\s*$/gm, "")
    // Collapse runs of 3+ newlines into double
    .replace(/\n{3,}/g, "\n\n")
    // Collapse multiple spaces into one
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * Convert a raw script string into an ordered array of NarrativeBlocks.
 *
 * - Splits on double newlines (paragraph boundaries)
 * - Preserves original sequential order
 * - Discards empty blocks
 * - Attaches contextual signals without modifying text
 */
export function createNarrativeBlocks(rawScript: string): NarrativeBlock[] {
  if (!rawScript || !rawScript.trim()) return [];

  const cleaned = cleanRawText(rawScript);

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs.map((content, index) => ({
    index,
    content,
    signals: detectSignals(content),
  }));
}

/**
 * Reassemble NarrativeBlocks back into a single string.
 * Preserves order by index.
 */
export function reassembleBlocks(blocks: NarrativeBlock[]): string {
  return [...blocks]
    .sort((a, b) => a.index - b.index)
    .map((b) => b.content)
    .join("\n\n");
}
