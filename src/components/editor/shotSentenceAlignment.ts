export interface ShotSentenceEntry {
  id: string;
  text: string;
  isNewScene?: boolean;
}

const SCRIPT_SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;
const MAX_MULTI_SENTENCES_PER_SHOT = 3;
const MAX_LOOKAHEAD_SENTENCES = 3;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function splitScriptSentences(scriptText: string): string[] {
  return scriptText
    .split(SCRIPT_SENTENCE_SPLIT_REGEX)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
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

  for (let length = 1; length <= maxLength; length++) {
    const combined = normalizedScriptSentences.slice(startIndex, startIndex + length).join(" ");
    if (textsMatch(shotTextNormalized, combined)) {
      return length;
    }
  }

  return 0;
}

export function alignShotSentencesToScript(
  shotEntries: ShotSentenceEntry[],
  scriptText: string
): ShotSentenceEntry[] {
  if (!scriptText.trim()) return shotEntries;

  const scriptSentences = splitScriptSentences(scriptText);
  if (scriptSentences.length === 0) return shotEntries;

  const normalizedScriptSentences = scriptSentences.map(normalizeText);
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
        text: scriptSentences.slice(scriptIndex, scriptIndex + directCoverageLength).join(" "),
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
        result.push({
          id: `_missing_${missingCounter++}`,
          text: scriptSentences[scriptIndex + offset],
          isNewScene: false,
        });
      }

      scriptIndex += matchedLookahead.offset;

      result.push({
        ...shot,
        text: scriptSentences
          .slice(scriptIndex, scriptIndex + matchedLookahead.coverageLength)
          .join(" "),
      });
      scriptIndex += matchedLookahead.coverageLength;
      continue;
    }

    if (scriptIndex < scriptSentences.length) {
      result.push({
        ...shot,
        text: scriptSentences[scriptIndex],
      });
      scriptIndex += 1;
      continue;
    }

    result.push(shot);
  }

  while (scriptIndex < scriptSentences.length) {
    result.push({
      id: `_missing_${missingCounter++}`,
      text: scriptSentences[scriptIndex],
      isNewScene: false,
    });
    scriptIndex += 1;
  }

  return result.length > 0 ? result : shotEntries;
}
