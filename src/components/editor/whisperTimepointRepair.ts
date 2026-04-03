import { getShotFragmentText, type VoiceOverShotSyncSource } from "./voiceOverShotSync";
import { enforceMonotonicTimestamps, matchShotsByText } from "./whisperTextMatcher";

export interface RepairableSceneOrderLike {
  id: string;
  scene_order: number;
}

export interface RepairableWhisperWordLike {
  word: string;
  start: number;
  end: number;
}

export interface RepairableShotTimepointLike {
  shotId: string;
  shotIndex: number;
  timeSeconds: number;
}

const TIMECODE_FPS = 24;
const MIN_STEP_SECONDS = 1 / TIMECODE_FPS;

function sortShotsBySceneAndOrder<T extends VoiceOverShotSyncSource>(
  shots: T[],
  scenesForSort: RepairableSceneOrderLike[]
): T[] {
  const sceneOrderMap = new Map(scenesForSort.map((scene) => [scene.id, scene.scene_order]));

  return [...shots].sort((a, b) => {
    const sceneOrderA = sceneOrderMap.get(a.scene_id) ?? 0;
    const sceneOrderB = sceneOrderMap.get(b.scene_id) ?? 0;
    if (sceneOrderA !== sceneOrderB) return sceneOrderA - sceneOrderB;
    return a.shot_order - b.shot_order;
  });
}

function isValidIncreasingSequence(
  values: Array<number | null>,
  lowerBound: number,
  upperBound: number
): values is number[] {
  let previous = lowerBound;

  for (const value of values) {
    if (value === null || !Number.isFinite(value)) return false;
    if (value <= previous) return false;
    if (value >= upperBound) return false;
    previous = value;
  }

  return true;
}

function distributeBetween(
  count: number,
  lowerBound: number,
  upperBound: number,
  includeLowerBound = false
): number[] {
  if (count <= 0) return [];

  if (includeLowerBound) {
    const denominator = Math.max(1, count);
    const step = (upperBound - lowerBound) / denominator;
    return Array.from({ length: count }, (_, index) => lowerBound + step * index);
  }

  const step = (upperBound - lowerBound) / (count + 1);
  return Array.from({ length: count }, (_, index) => lowerBound + step * (index + 1));
}

export function buildRepairedShotTimepoints<T extends VoiceOverShotSyncSource>(params: {
  shots: T[];
  scenesForSort: RepairableSceneOrderLike[];
  whisperWords: RepairableWhisperWordLike[];
  existingTimepoints?: RepairableShotTimepointLike[] | null;
  audioDuration: number;
}): RepairableShotTimepointLike[] {
  const { shots, scenesForSort, whisperWords, existingTimepoints, audioDuration } = params;
  const sortedShots = sortShotsBySceneAndOrder(shots, scenesForSort);
  const existingMap = new Map((existingTimepoints ?? []).map((tp) => [tp.shotId, tp.timeSeconds]));

  if (sortedShots.length === 0) return [];

  const safeAudioDuration = Math.max(audioDuration, sortedShots.length * MIN_STEP_SECONDS + MIN_STEP_SECONDS);

  const rawMatches = matchShotsByText(
    sortedShots.map((shot) => ({ id: shot.id, text: getShotFragmentText(shot) })),
    whisperWords
  );
  const matches = enforceMonotonicTimestamps(rawMatches, whisperWords);
  const matchedTimeMap = new Map(
    matches
      .filter((match) => match.whisperStartIdx !== null)
      .map((match) => [match.shotId, whisperWords[match.whisperStartIdx!]?.start ?? null])
      .filter((entry): entry is [string, number] => entry[1] !== null && Number.isFinite(entry[1]))
  );

  const repairedTimes = sortedShots.map((shot) => matchedTimeMap.get(shot.id) ?? existingMap.get(shot.id) ?? null);
  const anchorIndexes = sortedShots
    .map((shot, index) => (matchedTimeMap.has(shot.id) ? index : -1))
    .filter((index) => index >= 0);

  if (anchorIndexes.length === 0) {
    const existingOnly = sortedShots.map((shot) => existingMap.get(shot.id) ?? null);
    if (isValidIncreasingSequence(existingOnly, -Infinity, safeAudioDuration)) {
      return sortedShots.map((shot, index) => ({
        shotId: shot.id,
        shotIndex: index,
        timeSeconds: existingOnly[index],
      }));
    }

    const fallbackTimes = distributeBetween(sortedShots.length, 0, safeAudioDuration, true);
    return sortedShots.map((shot, index) => ({
      shotId: shot.id,
      shotIndex: index,
      timeSeconds: fallbackTimes[index],
    }));
  }

  const firstAnchorIndex = anchorIndexes[0];
  if (firstAnchorIndex > 0) {
    const upperBound = repairedTimes[firstAnchorIndex] as number;
    const prefix = repairedTimes.slice(0, firstAnchorIndex);
    const nextValues = isValidIncreasingSequence(prefix, -Infinity, upperBound)
      ? prefix
      : distributeBetween(firstAnchorIndex, 0, upperBound, true);
    nextValues.forEach((value, index) => {
      repairedTimes[index] = value;
    });
  }

  for (let anchorCursor = 0; anchorCursor < anchorIndexes.length - 1; anchorCursor += 1) {
    const leftIndex = anchorIndexes[anchorCursor];
    const rightIndex = anchorIndexes[anchorCursor + 1];
    const gapCount = rightIndex - leftIndex - 1;

    if (gapCount <= 0) continue;

    const lowerBound = repairedTimes[leftIndex] as number;
    const upperBound = repairedTimes[rightIndex] as number;
    const currentGap = repairedTimes.slice(leftIndex + 1, rightIndex);
    const nextValues = isValidIncreasingSequence(currentGap, lowerBound, upperBound)
      ? currentGap
      : distributeBetween(gapCount, lowerBound, upperBound);

    nextValues.forEach((value, offset) => {
      repairedTimes[leftIndex + offset + 1] = value;
    });
  }

  const lastAnchorIndex = anchorIndexes[anchorIndexes.length - 1];
  if (lastAnchorIndex < sortedShots.length - 1) {
    const lowerBound = repairedTimes[lastAnchorIndex] as number;
    const suffixCount = sortedShots.length - lastAnchorIndex - 1;
    const suffix = repairedTimes.slice(lastAnchorIndex + 1);
    const nextValues = isValidIncreasingSequence(suffix, lowerBound, safeAudioDuration)
      ? suffix
      : distributeBetween(suffixCount, lowerBound, safeAudioDuration);
    nextValues.forEach((value, offset) => {
      repairedTimes[lastAnchorIndex + offset + 1] = value;
    });
  }

  let previousTime = -Infinity;
  const maxReservedTail = (index: number) => MIN_STEP_SECONDS * (sortedShots.length - index - 1);

  return sortedShots.map((shot, index) => {
    const minAllowed = index === 0 ? 0 : previousTime + MIN_STEP_SECONDS;
    const maxAllowed = Math.max(minAllowed, safeAudioDuration - maxReservedTail(index));
    const rawTime = repairedTimes[index];
    const boundedTime = Number.isFinite(rawTime)
      ? Math.min(maxAllowed, Math.max(minAllowed, rawTime as number))
      : minAllowed;

    previousTime = boundedTime;

    return {
      shotId: shot.id,
      shotIndex: index,
      timeSeconds: boundedTime,
    };
  });
}
