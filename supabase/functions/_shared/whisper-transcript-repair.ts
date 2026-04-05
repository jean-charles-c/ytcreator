export interface WhisperRepairWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperRepairShot {
  id: string;
  text: string;
}

export interface WhisperTranscriptRepairRange {
  fromShotIndex: number;
  toShotIndex: number;
  insertedWordCount: number;
  gapStart: number;
  gapEnd: number;
  rejoinShotIndex: number | null;
}

export interface WhisperTranscriptRepairResult {
  words: WhisperRepairWord[];
  repairs: WhisperTranscriptRepairRange[];
}

const REQUIRED_MATCH_COUNT = 3;
const FALLBACK_MATCH_COUNT = 2;
const SEARCH_WINDOW = 50;
const MAX_REJOIN_LOOKAHEAD_SHOTS = 12;
const MIN_WORD_DURATION_SEC = 0.06;

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, "")
    .trim();
}

function extractLeadingWords(text: string, count = REQUIRED_MATCH_COUNT): string[] {
  return text
    .split(/\s+/)
    .map(norm)
    .filter((word) => word.length > 0)
    .slice(0, count);
}

function splitShotText(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function findShotStartIndex(
  shotText: string,
  whisperWords: WhisperRepairWord[],
  searchFrom: number,
  explicitSearchEnd?: number,
): number | null {
  const leadWords = extractLeadingWords(shotText, REQUIRED_MATCH_COUNT);
  if (leadWords.length < FALLBACK_MATCH_COUNT) return null;

  const searchEnd = Math.min(
    explicitSearchEnd ?? searchFrom + SEARCH_WINDOW,
    whisperWords.length,
  );

  if (leadWords.length >= REQUIRED_MATCH_COUNT) {
    for (let i = searchFrom; i < searchEnd; i++) {
      let allMatch = true;
      for (let j = 0; j < REQUIRED_MATCH_COUNT; j++) {
        if (i + j >= whisperWords.length || norm(whisperWords[i + j].word) !== leadWords[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return i;
    }
  }

  for (let i = searchFrom; i < searchEnd; i++) {
    let allMatch = true;
    for (let j = 0; j < FALLBACK_MATCH_COUNT; j++) {
      if (i + j >= whisperWords.length || norm(whisperWords[i + j].word) !== leadWords[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return i;
  }

  return null;
}

function buildSyntheticWords(
  shots: WhisperRepairShot[],
  gapStart: number,
  gapEnd: number,
): WhisperRepairWord[] {
  const tokens = shots.flatMap((shot) => splitShotText(shot.text));
  if (tokens.length === 0) return [];

  const minimumDuration = Math.max(tokens.length * MIN_WORD_DURATION_SEC, 0.2);
  const windowStart = Math.max(0, gapStart);
  const windowEnd = gapEnd > windowStart
    ? gapEnd
    : windowStart + minimumDuration;
  const totalDuration = Math.max(windowEnd - windowStart, minimumDuration);
  const step = totalDuration / tokens.length;

  return tokens.map((word, index) => {
    const start = windowStart + index * step;
    const end = index === tokens.length - 1
      ? windowStart + totalDuration
      : Math.min(windowStart + totalDuration, start + Math.max(MIN_WORD_DURATION_SEC, step * 0.92));

    return {
      word,
      start: Number(start.toFixed(3)),
      end: Number(Math.max(start + MIN_WORD_DURATION_SEC, end).toFixed(3)),
    };
  });
}

export function rebuildTranscriptText(words: WhisperRepairWord[]): string {
  return words
    .map((word) => word.word)
    .join(" ")
    .replace(/\s+([.,;:!?…])/g, "$1")
    .trim();
}

export function repairWhisperTranscriptWithShots(
  whisperWords: WhisperRepairWord[],
  shots: WhisperRepairShot[],
  audioDuration: number,
): WhisperTranscriptRepairResult {
  if (shots.length === 0) {
    return { words: whisperWords, repairs: [] };
  }

  const sanitizedWords = whisperWords
    .filter(
      (word) =>
        typeof word.word === "string" &&
        Number.isFinite(word.start) &&
        Number.isFinite(word.end),
    )
    .map((word) => ({ ...word }));

  if (sanitizedWords.length === 0) {
    return {
      words: buildSyntheticWords(shots, 0, Math.max(audioDuration, 0.2)),
      repairs: [
        {
          fromShotIndex: 0,
          toShotIndex: shots.length - 1,
          insertedWordCount: shots.flatMap((shot) => splitShotText(shot.text)).length,
          gapStart: 0,
          gapEnd: Number(Math.max(audioDuration, 0.2).toFixed(3)),
          rejoinShotIndex: null,
        },
      ],
    };
  }

  const workingWords = [...sanitizedWords];
  const repairs: WhisperTranscriptRepairRange[] = [];

  let shotIndex = 0;
  let searchFrom = 0;
  let safety = 0;

  while (shotIndex < shots.length && safety < shots.length * 4) {
    safety += 1;

    const currentMatchIndex = shotIndex === 0
      ? 0
      : findShotStartIndex(shots[shotIndex].text, workingWords, searchFrom);

    if (currentMatchIndex !== null) {
      searchFrom = currentMatchIndex + 1;
      shotIndex += 1;
      continue;
    }

    let rejoinShotIndex: number | null = null;
    let rejoinWordIndex: number | null = null;
    const candidateShotLimit = Math.min(shots.length, shotIndex + MAX_REJOIN_LOOKAHEAD_SHOTS + 1);

    for (let candidateShotIndex = shotIndex + 1; candidateShotIndex < candidateShotLimit; candidateShotIndex++) {
      const candidateWordIndex = findShotStartIndex(
        shots[candidateShotIndex].text,
        workingWords,
        searchFrom,
        workingWords.length,
      );
      if (candidateWordIndex !== null) {
        rejoinShotIndex = candidateShotIndex;
        rejoinWordIndex = candidateWordIndex;
        break;
      }
    }

    const gapStart = searchFrom > 0
      ? workingWords[Math.min(searchFrom - 1, workingWords.length - 1)].end
      : 0;
    const gapEnd = rejoinWordIndex !== null
      ? workingWords[rejoinWordIndex].start
      : Math.max(audioDuration, gapStart + 0.2);

    const missingShots = shots.slice(shotIndex, rejoinShotIndex ?? shots.length);
    const syntheticWords = buildSyntheticWords(missingShots, gapStart, gapEnd);

    if (syntheticWords.length === 0) {
      shotIndex += 1;
      continue;
    }

    if (rejoinWordIndex !== null) {
      workingWords.splice(rejoinWordIndex, 0, ...syntheticWords);
    } else {
      workingWords.push(...syntheticWords);
    }

    repairs.push({
      fromShotIndex: shotIndex,
      toShotIndex: (rejoinShotIndex ?? shots.length) - 1,
      insertedWordCount: syntheticWords.length,
      gapStart: Number(gapStart.toFixed(3)),
      gapEnd: Number(gapEnd.toFixed(3)),
      rejoinShotIndex,
    });

    if (rejoinWordIndex === null) {
      break;
    }
  }

  return { words: workingWords, repairs };
}