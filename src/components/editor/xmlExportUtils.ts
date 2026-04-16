import type { Timeline } from "./timelineAssembly";
import type { ExportFps } from "./videoExportEngine";

const XML_INVALID_CHAR_REGEX = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g;

export function sanitizeXmlText(value: string): string {
  return value.replace(XML_INVALID_CHAR_REGEX, "");
}

export function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getSafeTotalDuration(timeline: Timeline): number {
  const lastSegment = timeline.videoTrack.segments[timeline.videoTrack.segments.length - 1];
  return Math.max(
    timeline.audioTrack.durationEstimate || 0,
    timeline.totalDuration || 0,
    lastSegment ? lastSegment.startTime + lastSegment.duration : 0
  );
}

function getExactClipTimes(timeline: Timeline): { start: number; end: number }[] | null {
  const segments = timeline.videoTrack.segments;
  if (segments.length === 0) return [];

  const totalDuration = getSafeTotalDuration(timeline);
  const timepoints = timeline.shotTimepoints ?? [];

  if (timepoints.length === 0) return null;

  const timepointMap = new Map<string, number>();
  const manualEndMap = new Map<string, number>();

  for (const timepoint of timepoints) {
    if (timepoint.shotId.startsWith("_missing_")) continue;
    timepointMap.set(timepoint.shotId, timepoint.timeSeconds);
    if (
      typeof timepoint.manualEndTimeSeconds === "number" &&
      Number.isFinite(timepoint.manualEndTimeSeconds)
    ) {
      manualEndMap.set(timepoint.shotId, timepoint.manualEndTimeSeconds);
    }
  }

  const clipTimes: { start: number; end: number }[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const start = timepointMap.get(segment.id);
    if (typeof start !== "number" || !Number.isFinite(start)) {
      return null;
    }

    const nextSegment = segments[index + 1];
    const nextStart = nextSegment ? timepointMap.get(nextSegment.id) : totalDuration;
    const rawEnd = manualEndMap.get(segment.id) ?? nextStart;
    if (typeof rawEnd !== "number" || !Number.isFinite(rawEnd)) {
      return null;
    }

    const end = Math.min(rawEnd, totalDuration);
    if (!(end > start)) {
      return null;
    }

    clipTimes.push({ start, end });
  }

  return clipTimes;
}

function getBoundaryTimes(timeline: Timeline): number[] {
  const segments = timeline.videoTrack.segments;
  if (segments.length === 0) return [];

  const totalDuration = getSafeTotalDuration(timeline);
  const exactClipTimes = getExactClipTimes(timeline);

  if (exactClipTimes) {
    return exactClipTimes.flatMap((clipTime, index) =>
      index === exactClipTimes.length - 1
        ? [clipTime.start, clipTime.end]
        : [clipTime.start]
    );
  }

  return [...segments.map((segment) => segment.startTime), totalDuration];
}

export function buildClipFrames(
  timeline: Timeline,
  fps: ExportFps
): { start: number; end: number }[] {
  const segments = timeline.videoTrack.segments;
  if (segments.length === 0) return [];

  const boundaryTimes = getBoundaryTimes(timeline);
  const boundaryFrames: number[] = [];

  for (let i = 0; i < boundaryTimes.length; i++) {
    const roundedFrame = Math.max(0, Math.round(boundaryTimes[i] * fps));

    if (i === 0) {
      boundaryFrames.push(0);
      continue;
    }

    boundaryFrames.push(Math.max(roundedFrame, boundaryFrames[i - 1] + 1));
  }

  return segments.map((_, index) => ({
    start: boundaryFrames[index],
    end: boundaryFrames[index + 1],
  }));
}
