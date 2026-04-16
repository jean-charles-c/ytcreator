interface ShotTimepointLike {
  shotId: string;
  shotIndex: number;
  timeSeconds: number;
  manualEndTimeSeconds?: number | null;
}

const TIME_EPSILON_SECONDS = 1 / 240;

function normaliseOptionalTime(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function haveShotTimepointsChanged(
  previous: ShotTimepointLike[] | null | undefined,
  next: ShotTimepointLike[] | null | undefined
): boolean {
  const prevList = previous ?? [];
  const nextList = next ?? [];

  if (prevList.length !== nextList.length) return true;

  for (let index = 0; index < prevList.length; index += 1) {
    const prev = prevList[index];
    const curr = nextList[index];

    if (prev.shotId !== curr.shotId) return true;
    if (prev.shotIndex !== curr.shotIndex) return true;
    if (Math.abs(prev.timeSeconds - curr.timeSeconds) > TIME_EPSILON_SECONDS) return true;

    const prevManualEnd = normaliseOptionalTime(prev.manualEndTimeSeconds);
    const currManualEnd = normaliseOptionalTime(curr.manualEndTimeSeconds);
    if (prevManualEnd === null && currManualEnd !== null) return true;
    if (prevManualEnd !== null && currManualEnd === null) return true;
    if (
      prevManualEnd !== null &&
      currManualEnd !== null &&
      Math.abs(prevManualEnd - currManualEnd) > TIME_EPSILON_SECONDS
    ) {
      return true;
    }
  }

  return false;
}