/**
 * XMLMarkerBuilder — Generates FCP XML <marker> elements from validated chapters.
 * Markers are injected per-clip for DaVinci Resolve compatibility.
 */

import type { Chapter } from "./chapterTypes";
import type { Timeline } from "./timelineAssembly";
import type { ExportFps } from "./videoExportEngine";
import { escapeXml } from "./xmlExportUtils";
import { SECTION_TYPES, SECTION_META } from "./canonicalScriptTypes";

export interface ChapterMarker {
  name: string;
  comment: string;
  /** Index of the clip/segment this marker belongs to */
  clipIndex: number;
}

/**
 * Build markers from validated chapters, mapped to clip indices.
 * Each chapter maps to the segment whose sectionType matches.
 */
export function buildChapterMarkers(
  chapters: Chapter[],
  timeline: Timeline,
  _fps: ExportFps
): ChapterMarker[] {
  const validated = chapters.filter((ch) => ch.validated);
  if (validated.length === 0) return [];

  const segments = timeline.videoTrack.segments;

  return validated.map((ch) => {
    // Try to find segment by matching section type label in scene title
    let clipIndex = ch.index; // default: use chapter index

    // Match by section type — find corresponding segment
    if (ch.sectionType) {
      const meta = SECTION_META[ch.sectionType];
      if (meta) {
        const found = segments.findIndex(
          (seg) =>
            seg.sceneTitle?.toLowerCase().includes(meta.label.toLowerCase()) ||
            seg.sceneTitle?.toLowerCase().includes(ch.sectionType!.toLowerCase())
        );
        if (found >= 0) clipIndex = found;
      }
    }

    // Clamp to valid range
    clipIndex = Math.min(clipIndex, segments.length - 1);
    clipIndex = Math.max(0, clipIndex);

    return {
      name: ch.title,
      comment: ch.titleFR ? `FR: ${ch.titleFR}` : ch.startSentence.slice(0, 80),
      clipIndex,
    };
  });
}

/**
 * Generate FCP XML marker string for a specific clip index.
 * Returns empty string if no markers target this clip.
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
 * Generate sequence-level marker XML (kept as fallback).
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
          <in>0</in>
          <out>0</out>
        </marker>`
    )
    .join("");
}
