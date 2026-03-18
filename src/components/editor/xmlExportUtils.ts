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

function getBoundaryTimes(timeline: Timeline): number[] {
  const segments = timeline.videoTrack.segments;
  if (segments.length === 0) return [];

  const totalDuration = getSafeTotalDuration(timeline);
  const timepoints = timeline.shotTimepoints ?? [];

  if (timepoints.length > 0) {
    const timepointMap = new Map(timepoints.map((tp) => [tp.shotId, tp.timeSeconds]));
    const preciseStarts = segments.map((segment) => timepointMap.get(segment.id));

    if (preciseStarts.every((time): time is number => typeof time === "number" && Number.isFinite(time))) {
      return [...preciseStarts, totalDuration];
    }
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
