/**
 * XMLMarkerBuilder — Generates sequence-level FCP XML <marker> elements from validated chapters.
 * Markers are injected at the timeline level for DaVinci Resolve compatibility.
 */

import type { Chapter } from "./chapterTypes";
import type { Timeline } from "./timelineAssembly";
import type { ExportFps } from "./videoExportEngine";
import { buildClipFrames, escapeXml } from "./xmlExportUtils";

export interface ChapterMarker {
  name: string;
  comment: string;
  /** Index of the clip/segment this marker belongs to */
  clipIndex: number;
  /** Timeline start frame of the marker */
  startFrame: number;
  /** Timeline start in seconds */
  startSeconds: number;
}


/**
 * Build markers from validated chapters, mapped to clip indices and timeline positions.
 * Each chapter maps to the segment whose sectionType matches.
 */
export function buildChapterMarkers(
  chapters: Chapter[],
  timeline: Timeline,
  fps: ExportFps
): ChapterMarker[] {
  const validated = chapters.filter((ch) => ch.validated);
  if (validated.length === 0) return [];

  const segments = timeline.videoTrack.segments;
  const clipFrames = buildClipFrames(timeline, fps);

  return validated.map((ch) => {
    let clipIndex = 0;

    // Strategy 1: Match by sourceText — find first segment whose sentence is inside chapter sourceText
    if (ch.sourceText) {
      const srcNorm = ch.sourceText.toLowerCase().trim();
      const found = segments.findIndex(
        (seg) => seg.sentence && srcNorm.includes(seg.sentence.toLowerCase().trim())
      );
      if (found >= 0) {
        clipIndex = found;
      } else {
        // Strategy 2: Match by startSentence — find segment whose sentence starts with chapter's startSentence
        const startNorm = ch.startSentence.toLowerCase().trim();
        if (startNorm) {
          const found2 = segments.findIndex(
            (seg) => seg.sentence && seg.sentence.toLowerCase().trim().startsWith(startNorm.slice(0, 40))
          );
          if (found2 >= 0) clipIndex = found2;
        }
      }
    }

    // Strategy 3: If still 0 and chapter has an index, use proportional mapping
    // ch.index is 0-8 for 9 sections; map to segment space proportionally
    if (clipIndex === 0 && ch.index > 0 && segments.length > 0) {
      clipIndex = Math.round((ch.index / 9) * segments.length);
    }

    clipIndex = Math.min(clipIndex, segments.length - 1);
    clipIndex = Math.max(0, clipIndex);

    const startFrame = clipFrames[clipIndex]?.start ?? 0;
    const startSeconds = startFrame / fps;

    return {
      name: ch.title,
      comment: ch.titleFR ? `FR: ${ch.titleFR}` : ch.startSentence.slice(0, 80),
      clipIndex,
      startFrame,
      startSeconds,
    };
  });
}

/**
 * Generate legacy clip-level marker XML for a specific clip index.
 * Kept as fallback, but Resolve import primarily relies on sequence-level markers.
 */
export function generateClipMarkerXml(
  markers: ChapterMarker[],
  clipIndex: number
): string {
  const clipMarkers = markers.filter((m) => m.clipIndex === clipIndex);
  if (clipMarkers.length === 0) return "";

  return clipMarkers
    .map(
      (m) => `
        <marker>
          <name>${escapeXml(m.name)}</name>
          <comment>${escapeXml(m.comment)}</comment>
          <in>0</in>
          <out>0</out>
        </marker>`
    )
    .join("");
}

/**
 * Generate sequence-level marker XML using proper XMEML child-element format.
 * Per Apple FCP7 spec: <marker> contains <name>, <comment>, <in>, <out> (in frames).
 * For a point marker (no range), in == out.
 */
export function generateMarkerXml(
  markers: ChapterMarker[],
  _fps: ExportFps
): string {
  if (markers.length === 0) return "";

  return markers
    .map(
      (m) => `
        <marker>
          <name>${escapeXml(m.name)}</name>
          <comment>${escapeXml(m.comment)}</comment>
          <in>${m.startFrame}</in>
          <out>${m.startFrame}</out>
        </marker>`
    )
    .join("");
}
