/**
 * XMLMarkerBuilder — Generates FCP XML <marker> elements from validated chapters.
 * Markers are injected into the <sequence> element for DaVinci Resolve import.
 */

import type { Chapter } from "./chapterTypes";
import type { Timeline } from "./timelineAssembly";
import type { ExportFps } from "./videoExportEngine";
import { escapeXml } from "./xmlExportUtils";

export interface ChapterMarker {
  name: string;
  comment: string;
  /** Frame position in the timeline */
  frame: number;
}

/**
 * Match a chapter's startSentence to the closest shot segment in the timeline.
 * Returns the start frame of that segment.
 */
function resolveChapterFrame(
  chapter: Chapter,
  timeline: Timeline,
  fps: ExportFps
): number {
  const segments = timeline.videoTrack.segments;
  const timepoints = timeline.shotTimepoints ?? [];
  const needle = chapter.startSentence.toLowerCase().trim();

  // Try matching by source sentence
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const sentLower = (seg.sentence || seg.sentenceFr || "").toLowerCase();
    if (sentLower.includes(needle) || needle.includes(sentLower.slice(0, 40))) {
      // Use precise timepoint if available
      const tp = timepoints.find((t) => t.shotId === seg.id);
      if (tp) return Math.round(tp.timeSeconds * fps);
      return Math.round(seg.startTime * fps);
    }
  }

  // Fallback: match by section type → find first segment of that scene type
  if (chapter.sectionType) {
    // Approximate: distribute chapters proportionally
    const ratio = chapter.index / Math.max(1, segments.length);
    const segIdx = Math.min(Math.floor(ratio * segments.length), segments.length - 1);
    const seg = segments[segIdx];
    const tp = timepoints.find((t) => t.shotId === seg.id);
    if (tp) return Math.round(tp.timeSeconds * fps);
    return Math.round(seg.startTime * fps);
  }

  // Last resort: proportional placement
  const totalFrames = Math.ceil((timeline.totalDuration || 0) * fps);
  return Math.round((chapter.index / Math.max(1, 9)) * totalFrames);
}

/**
 * Build markers from validated chapters.
 */
export function buildChapterMarkers(
  chapters: Chapter[],
  timeline: Timeline,
  fps: ExportFps
): ChapterMarker[] {
  const validated = chapters.filter((ch) => ch.validated);
  if (validated.length === 0) return [];

  return validated.map((ch) => ({
    name: ch.title,
    comment: ch.titleFR ? `FR: ${ch.titleFR}` : ch.startSentence.slice(0, 80),
    frame: resolveChapterFrame(ch, timeline, fps),
  }));
}

/**
 * Generate FCP XML marker elements string.
 * These should be inserted inside the <sequence> element.
 */
export function generateMarkerXml(markers: ChapterMarker[], fps: ExportFps): string {
  if (markers.length === 0) return "";

  return markers
    .map(
      (m) => `
        <marker>
          <name>${escapeXml(m.name)}</name>
          <comment>${escapeXml(m.comment)}</comment>
          <in>${m.frame}</in>
          <out>${m.frame}</out>
        </marker>`
    )
    .join("");
}
