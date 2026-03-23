export interface ShotSentenceEntry {
  id: string;
  text: string;
  isNewScene?: boolean;
}

const SCRIPT_SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;
const MAX_MULTI_SENTENCES_PER_SHOT = 3;
const MAX_LOOKAHEAD_SENTENCES = 5;
const FUZZY_WORD_OVERLAP_THRESHOLD = 0.45;
/** Minimum ratio of shot text length vs script sentence length for reverse inclusion to count as a full match */
const REVERSE_INCLUSION_MIN_COVERAGE = 0.65;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ScriptSentence {
  text: string;
  /** True if this sentence starts a new paragraph (after a \n\n break) */
  isNewParagraph: boolean;
}

function splitScriptSentences(scriptText: string): ScriptSentence[] {
  const paragraphs = scriptText.split(/\n\s*\n/).filter((p) => p.trim());
  const result: ScriptSentence[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = paragraphs[pi]
      .split(SCRIPT_SENTENCE_SPLIT_REGEX)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (let si = 0; si < sentences.length; si++) {
      result.push({
        text: sentences[si],
        isNewParagraph: si === 0 && pi > 0,
      });
    }
  }

  return result;
}

function extractWords(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).filter(w => w.length > 2));
}

function wordOverlapRatio(a: string, b: string): number {
  const wordsA = extractWords(a);
  const wordsB = extractWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

/** Strict matching: exact or shot-includes-script (for multi-sentence blocks) */
function strictMatch(shotTextNormalized: string, scriptBlockNormalized: string): boolean {
  if (!shotTextNormalized || !scriptBlockNormalized) return false;
  if (shotTextNormalized === scriptBlockNormalized) return true;
  if (shotTextNormalized.includes(scriptBlockNormalized)) return true;
  return false;
}

/** Fuzzy matching: includes strict + reverse inclusion + word overlap (single sentences) */
function fuzzyMatch(shotTextNormalized: string, scriptSentenceNormalized: string): boolean {
  if (strictMatch(shotTextNormalized, scriptSentenceNormalized)) return true;
  // Reverse inclusion: script contains shot text (shot is shortened version)
  if (scriptSentenceNormalized.includes(shotTextNormalized) && shotTextNormalized.length > 10) return true;
  if (wordOverlapRatio(shotTextNormalized, scriptSentenceNormalized) >= FUZZY_WORD_OVERLAP_THRESHOLD) return true;
  return false;
}

function getCoverageLength(
  shotTextNormalized: string,
  normalizedScriptSentences: string[],
  startIndex: number
): number {
  const maxLength = Math.min(
    MAX_MULTI_SENTENCES_PER_SHOT,
    normalizedScriptSentences.length - startIndex
  );

  for (let length = maxLength; length >= 1; length--) {
    const combined = normalizedScriptSentences.slice(startIndex, startIndex + length).join(" ");
    if (length === 1) {
      // Single sentence: use fuzzy matching
      if (fuzzyMatch(shotTextNormalized, combined)) return length;
    } else {
      // Multi-sentence: use strict matching only
      if (strictMatch(shotTextNormalized, combined)) return length;
    }
  }

  return 0;
}

/**
 * Determine if the entry at scriptIndex starts a new paragraph.
 * Uses the paragraph info from scriptSentences, OR the shot's own isNewScene flag.
 */
function resolveIsNewScene(
  shot: ShotSentenceEntry | null,
  scriptSentences: ScriptSentence[],
  scriptIndex: number
): boolean {
  // If the script sentence starts a new paragraph, always mark as scene break
  if (scriptIndex < scriptSentences.length && scriptSentences[scriptIndex].isNewParagraph) {
    return true;
  }
  // Otherwise fall back to the shot's own flag
  return shot?.isNewScene === true;
}

export function alignShotSentencesToScript(
  shotEntries: ShotSentenceEntry[],
  scriptText: string
): ShotSentenceEntry[] {
  if (!scriptText.trim()) return shotEntries;

  const scriptSentences = splitScriptSentences(scriptText);
  if (scriptSentences.length === 0) return shotEntries;

  const normalizedScriptSentences = scriptSentences.map((s) => normalizeText(s.text));
  const result: ShotSentenceEntry[] = [];
  let scriptIndex = 0;
  let missingCounter = 0;

  for (const shot of shotEntries) {
    const normalizedShotText = normalizeText(shot.text);

    const directCoverageLength = getCoverageLength(
      normalizedShotText,
      normalizedScriptSentences,
      scriptIndex
    );

    if (directCoverageLength > 0) {
      result.push({
        ...shot,
        text: scriptSentences.slice(scriptIndex, scriptIndex + directCoverageLength).map((s) => s.text).join(" "),
        isNewScene: resolveIsNewScene(shot, scriptSentences, scriptIndex),
      });
      scriptIndex += directCoverageLength;
      continue;
    }

    let matchedLookahead: { offset: number; coverageLength: number } | null = null;
    const maxLookahead = Math.min(
      MAX_LOOKAHEAD_SENTENCES,
      scriptSentences.length - scriptIndex - 1
    );

    for (let offset = 1; offset <= maxLookahead; offset++) {
      const coverageLength = getCoverageLength(
        normalizedShotText,
        normalizedScriptSentences,
        scriptIndex + offset
      );

      if (coverageLength > 0) {
        matchedLookahead = { offset, coverageLength };
        break;
      }
    }

    if (matchedLookahead) {
      for (let offset = 0; offset < matchedLookahead.offset; offset++) {
        const si = scriptIndex + offset;
        result.push({
          id: `_missing_${missingCounter++}`,
          text: scriptSentences[si].text,
          isNewScene: resolveIsNewScene(null, scriptSentences, si),
        });
      }

      scriptIndex += matchedLookahead.offset;

      result.push({
        ...shot,
        text: scriptSentences
          .slice(scriptIndex, scriptIndex + matchedLookahead.coverageLength)
          .map((s) => s.text)
          .join(" "),
        isNewScene: resolveIsNewScene(shot, scriptSentences, scriptIndex),
      });
      scriptIndex += matchedLookahead.coverageLength;
      continue;
    }

    if (scriptIndex < scriptSentences.length) {
      result.push({
        ...shot,
        text: scriptSentences[scriptIndex].text,
        isNewScene: resolveIsNewScene(shot, scriptSentences, scriptIndex),
      });
      scriptIndex += 1;
      continue;
    }

    result.push(shot);
  }

  while (scriptIndex < scriptSentences.length) {
    result.push({
      id: `_missing_${missingCounter++}`,
      text: scriptSentences[scriptIndex].text,
      isNewScene: resolveIsNewScene(null, scriptSentences, scriptIndex),
    });
    scriptIndex += 1;
  }

  return result.length > 0 ? result : shotEntries;
}
