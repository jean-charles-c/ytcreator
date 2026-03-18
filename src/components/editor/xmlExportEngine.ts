import JSZip from "jszip";
import type { Timeline } from "./timelineAssembly";
import type { ExportFps } from "./videoExportEngine";
import { buildClipFrames, escapeXml } from "./xmlExportUtils";
import { buildChapterMarkers, generateMarkerXml } from "./xmlMarkerBuilder";
import type { Chapter } from "./chapterTypes";

/**
 * Fetch a file as ArrayBuffer, returns null on failure.
 */
async function fetchMedia(url: string): Promise<ArrayBuffer | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.arrayBuffer();
  } catch {
    return null;
  }
}

function getImageExtension(url: string): string {
  if (url.includes(".png")) return "png";
  if (url.includes(".webp")) return "webp";
  return "jpg";
}

/**
 * Generate FCP XML with local relative paths to bundled media.
 */
function generateXml(
  timeline: Timeline,
  fps: ExportFps,
  imageFileNames: Map<number, string>,
  audioFileName: string,
  exportUid: string,
  markersXml: string = ""
): string {
  const { videoTrack, audioTrack, totalDuration } = timeline;
  const segments = videoTrack.segments;

  // Handle frames: extra source frames before/after for transitions in NLEs
  const HANDLE_FRAMES = Math.round(fps * 2); // 2 seconds of handles on each side

  // Build frame ranges from precise timepoints when available.
  // This avoids cumulative drift caused by re-quantizing rounded timeline values.
  const clipFrames = buildClipFrames(timeline, fps);
  const totalFrames = clipFrames.length > 0
    ? clipFrames[clipFrames.length - 1].end
    : Math.ceil(totalDuration * fps);

  const clipItems = segments.map((seg, i) => {
    const { start: startFrame, end: endFrame } = clipFrames[i];
    const dur = endFrame - startFrame;
    const globalIndex = i + 1;
    const paddedIndex = String(globalIndex).padStart(3, "0");
    const name = `Shot_${paddedIndex} — ${escapeXml(seg.sceneTitle)}`;
    const description = escapeXml(seg.description);
    const sentence = escapeXml(seg.sentence || seg.sentenceFr || "");
    const localPath = imageFileNames.get(i) ?? "";
    const masterClipId = `masterclip-${exportUid}-img-${globalIndex}`;
    const fileId = `file-${exportUid}-img-${globalIndex}`;
    // Source duration = visible duration + handles on both sides
    const fileDuration = dur + HANDLE_FRAMES * 2;
    // in/out point into the source: start after the pre-handle
    const inPoint = HANDLE_FRAMES;
    const outPoint = HANDLE_FRAMES + dur;

    return `
      <clipitem id="clip-${exportUid}-${globalIndex}">
        <masterclipid>${masterClipId}</masterclipid>
        <name>${name}</name>
        <enabled>TRUE</enabled>
        <duration>${fileDuration}</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <start>${startFrame}</start>
        <end>${endFrame}</end>
        <in>${inPoint}</in>
        <out>${outPoint}</out>
        <stillframe>TRUE</stillframe>
        <stillframeoffset>0</stillframeoffset>
        <anamorphic>FALSE</anamorphic>
        <pixelaspectratio>square</pixelaspectratio>
        <sourcetrack>
          <mediatype>video</mediatype>
        </sourcetrack>
        <file id="${fileId}">
          <name>shot_${paddedIndex}</name>
          <pathurl>${escapeXml(localPath)}</pathurl>
          <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          <duration>${fileDuration}</duration>
          <media>
            <video>
              <duration>${fileDuration}</duration>
              <stillframe>TRUE</stillframe>
              <samplecharacteristics>
                <width>1920</width>
                <height>1080</height>
                <pixelaspectratio>square</pixelaspectratio>
                <fielddominance>none</fielddominance>
                <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
              </samplecharacteristics>
            </video>
          </media>
        </file>
        <comments>
          <mastercomment1>${sentence}</mastercomment1>
          <mastercomment2>${description}</mastercomment2>
          <mastercomment3>Type: ${escapeXml(seg.shotType)}</mastercomment3>
        </comments>
      </clipitem>`;
  }).join("\n");

  const audioEndFrame = Math.max(
    Math.round((audioTrack.durationEstimate || totalDuration) * fps),
    totalFrames
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project>
    <name>Timeline Export</name>
    <children>
      <sequence>
        <name>Main Sequence</name>
        <duration>${totalFrames}</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>${markersXml}
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <width>1920</width>
                <height>1080</height>
                <pixelaspectratio>square</pixelaspectratio>
                <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
              </samplecharacteristics>
            </format>
            <track>
${clipItems}
            </track>
          </video>
          <audio>
            <track>
              <clipitem id="audio-clip-${exportUid}-1">
                <name>${escapeXml(audioTrack.fileName)}</name>
                <duration>${audioEndFrame}</duration>
                <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
                <start>0</start>
                <end>${audioEndFrame}</end>
                <in>0</in>
                <out>${audioEndFrame}</out>
                <file id="audio-file-${exportUid}-1">
                  <name>${escapeXml(audioTrack.fileName)}</name>
                  <pathurl>${escapeXml(audioFileName)}</pathurl>
                  <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>${audioEndFrame}</duration>
                  <media><audio><channelcount>2</channelcount></audio></media>
                </file>
              </clipitem>
            </track>
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;
}

export interface XmlExportProgress {
  phase: "images" | "audio" | "packaging" | "done" | "error";
  percent: number;
  message: string;
}

/**
 * Export timeline as a ZIP containing the FCP XML + all media files.
 * Returns a Blob of the ZIP.
 */
export async function exportTimelineToXmlZip(
  timeline: Timeline,
  fps: ExportFps = 24,
  onProgress?: (p: XmlExportProgress) => void
): Promise<Blob> {
  const zip = new JSZip();
  const mediaFolder = zip.folder("media")!;
  const segments = timeline.videoTrack.segments;

  const imageFileNames = new Map<number, string>();

  // ── Download images ──
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress?.({
      phase: "images",
      percent: Math.round((i / segments.length) * 60),
      message: `Téléchargement image ${i + 1}/${segments.length}…`,
    });

    if (seg.imageUrl) {
      const ext = getImageExtension(seg.imageUrl);
      const fileName = `shot_${String(i + 1).padStart(3, "0")}.${ext}`;
      const data = await fetchMedia(seg.imageUrl);
      if (data) {
        mediaFolder.file(fileName, data);
        imageFileNames.set(i, `media/${fileName}`);
      }
    }
  }

  // ── Download audio ──
  onProgress?.({ phase: "audio", percent: 65, message: "Téléchargement audio…" });
  const audioExt = timeline.audioTrack.fileName.split(".").pop() || "mp3";
  const audioFileName = `narration.${audioExt}`;
  const audioData = await fetchMedia(timeline.audioTrack.audioUrl);
  if (audioData) {
    mediaFolder.file(audioFileName, audioData);
  }

  // ── Generate XML with relative paths ──
  onProgress?.({ phase: "packaging", percent: 80, message: "Génération du XML…" });
  const exportUid = crypto.randomUUID().slice(0, 8);
  const xml = generateXml(timeline, fps, imageFileNames, `media/${audioFileName}`, exportUid);
  zip.file("timeline.xml", xml);

  // ── Generate ZIP ──
  onProgress?.({ phase: "packaging", percent: 85, message: "Compression du package…" });
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (metadata) => {
      onProgress?.({
        phase: "packaging",
        percent: 85 + Math.round(metadata.percent * 0.14),
        message: `Compression… ${Math.round(metadata.percent)}%`,
      });
    }
  );

  onProgress?.({ phase: "done", percent: 100, message: "Package XML prêt !" });
  return blob;
}
