/**
 * XMLMarkerBuilder — Generates sequence-level FCP XML <marker> elements from validated chapters.
 * Markers are injected at the timeline level for DaVinci Resolve compatibility.
 *
 * Mapping strategy: each chapter's sourceText is matched against the timeline segments'
 * sentences to find the first segment (= global shot) that belongs to this chapter.
 * The segment index IS the clip index on the timeline track.
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
 * Build markers from validated chapters.
 * Each chapter is mapped to the first timeline segment whose sentence appears
 * in the chapter's sourceText. This gives a direct, reliable alignment because
 * timeline segments are already sorted in global project order (scene_order × shot_order).
 */
export function buildChapterMarkers(
  chapters: Chapter[],
  timeline: Timeline,
  fps: ExportFps,
  /** When provided, search only these segments (already filtered for export) */
  exportSegments?: { id: string; sentence: string; sentenceFr: string | null }[],
  /** Pre-computed clip frames matching exportSegments */
  exportClipFrames?: { start: number; end: number }[]
): ChapterMarker[] {
  const validated = chapters.filter((ch) => ch.validated);
  if (validated.length === 0) return [];

  const segments = exportSegments ?? timeline.videoTrack.segments;
  const clipFrames = exportClipFrames ?? buildClipFrames(timeline, fps);

  return validated.map((ch) => {
    let clipIndex = 0;

    if (ch.sourceText) {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/,/g, "").trim();
      const srcNorm = norm(ch.sourceText);

      // Find the first segment whose sentence is contained in this chapter's source text
      const found = segments.findIndex((seg) => {
        const sent = norm(seg.sentence || "");
        return sent.length >= 5 && srcNorm.includes(sent);
      });

      if (found >= 0) {
        clipIndex = found;
      }
    }

    // Safety: fallback proportional mapping only if no text match and chapter is not the first
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
