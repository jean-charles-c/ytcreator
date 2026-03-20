import JSZip from "jszip";
import type { Timeline } from "./timelineAssembly";
import type { ExportFps } from "./videoExportEngine";
import { buildClipFrames, escapeXml } from "./xmlExportUtils";
import { buildChapterMarkers, generateMarkerXml } from "./xmlMarkerBuilder";
import type { Chapter } from "./chapterTypes";
import type { ManifestTimingEntry } from "./manifestTiming";

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

// ── Frame calculation from ManifestTiming ──────────────────────────

interface ClipFrame {
  start: number;
  end: number;
}

/**
 * Build clip frame ranges directly from ManifestTiming entries.
 *
 * Key rule: endFrame of clip i = startFrame of clip i+1.
 * This avoids cumulative drift caused by rounding start+duration independently.
 */
function buildClipFramesFromManifest(
  entries: ManifestTimingEntry[],
  fps: ExportFps
): ClipFrame[] {
  if (entries.length === 0) return [];

  const frames: ClipFrame[] = [];
  for (let i = 0; i < entries.length; i++) {
    const startFrame = Math.max(0, Math.round(entries[i].start * fps));
    // End = next entry's start frame, or last entry uses start+duration
    const endFrame = i < entries.length - 1
      ? Math.round(entries[i + 1].start * fps)
      : Math.round((entries[i].start + entries[i].duration) * fps);
    frames.push({
      start: startFrame,
      end: Math.max(endFrame, startFrame + 1),
    });
  }
  return frames;
}

// ── Segment info for XML generation ────────────────────────────────

interface XmlSegment {
  id: string;
  sceneTitle: string;
  description: string;
  sentence: string;
  sentenceFr: string | null;
  imageUrl: string | null;
  shotType: string;
}

/**
 * Generate FCP XML with local relative paths to bundled media.
 * When manifestEntries are provided, they are the sole source of truth for timing.
 */
function generateXml(
  segments: XmlSegment[],
  clipFrames: ClipFrame[],
  totalFrames: number,
  audioTrack: { fileName: string; durationEstimate: number },
  fps: ExportFps,
  imageFileNames: Map<number, string>,
  audioFileName: string,
  exportUid: string,
  markersXml: string = "",
  musicTracks: { fileName: string; localPath: string }[] = [],
  chapterTitles: { name: string; startFrame: number; endFrame: number }[] = []
): string {
  const HANDLE_FRAMES = Math.round(fps * 2);

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
    const fileDuration = dur + HANDLE_FRAMES * 2;
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
    Math.round((audioTrack.durationEstimate || 0) * fps),
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
            </track>${chapterTitles.length > 0 ? `
            <track>
${chapterTitles.map((ct, idx) => {
  const dur = ct.endFrame - ct.startFrame;
  return `              <generatoritem id="title-${exportUid}-${idx + 1}">
                        <name>${escapeXml(ct.name)}</name>
                        <duration>${dur}</duration>
                        <rate>
                            <timebase>${fps}</timebase>
                            <ntsc>FALSE</ntsc>
                        </rate>
                        <start>${ct.startFrame}</start>
                        <end>${ct.endFrame}</end>
                        <enabled>TRUE</enabled>
                        <in>0</in>
                        <out>${dur}</out>
                        <anamorphic>FALSE</anamorphic>
                        <alphatype>black</alphatype>
                        <effect>
                            <name>Text</name>
                            <effectid>Text</effectid>
                            <effectcategory>Text</effectcategory>
                            <effecttype>generator</effecttype>
                            <mediatype>video</mediatype>
                            <parameter>
                                <parameterid>str</parameterid>
                                <name>Text</name>
                                <value>${escapeXml(ct.name)}</value>
                            </parameter>
                            <parameter>
                                <parameterid>fontsize</parameterid>
                                <name>Font Size</name>
                                <value>72</value>
                            </parameter>
                            <parameter>
                                <parameterid>font</parameterid>
                                <name>Font</name>
                                <value>Arial</value>
                            </parameter>
                            <parameter>
                                <parameterid>fontcolor</parameterid>
                                <name>Font Color</name>
                                <value>
                                    <alpha>255</alpha>
                                    <red>255</red>
                                    <green>255</green>
                                    <blue>255</blue>
                                </value>
                            </parameter>
                            <parameter>
                                <parameterid>alignment</parameterid>
                                <name>Alignment</name>
                                <value>1</value>
                            </parameter>
                        </effect>
                        <filter>
                            <enabled>TRUE</enabled>
                            <start>0</start>
                            <end>${dur}</end>
                            <effect>
                                <name>Basic Motion</name>
                                <effectid>basic</effectid>
                                <effecttype>motion</effecttype>
                                <mediatype>video</mediatype>
                                <effectcategory>motion</effectcategory>
                                <parameter>
                                    <name>Scale</name>
                                    <parameterid>scale</parameterid>
                                    <value>100</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>10000</valuemax>
                                </parameter>
                                <parameter>
                                    <name>Center</name>
                                    <parameterid>center</parameterid>
                                    <value>
                                        <horiz>0</horiz>
                                        <vert>0</vert>
                                    </value>
                                </parameter>
                                <parameter>
                                    <name>Rotation</name>
                                    <parameterid>rotation</parameterid>
                                    <value>0</value>
                                    <valuemin>-100000</valuemin>
                                    <valuemax>100000</valuemax>
                                </parameter>
                                <parameter>
                                    <name>Anchor Point</name>
                                    <parameterid>centerOffset</parameterid>
                                    <value>
                                        <horiz>0</horiz>
                                        <vert>0</vert>
                                    </value>
                                </parameter>
                            </effect>
                        </filter>
                        <filter>
                            <enabled>TRUE</enabled>
                            <start>0</start>
                            <end>${dur}</end>
                            <effect>
                                <name>Crop</name>
                                <effectid>crop</effectid>
                                <effecttype>motion</effecttype>
                                <mediatype>video</mediatype>
                                <effectcategory>motion</effectcategory>
                                <parameter>
                                    <name>left</name>
                                    <parameterid>left</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                                <parameter>
                                    <name>right</name>
                                    <parameterid>right</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                                <parameter>
                                    <name>top</name>
                                    <parameterid>top</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                                <parameter>
                                    <name>bottom</name>
                                    <parameterid>bottom</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                            </effect>
                        </filter>
                        <filter>
                            <enabled>TRUE</enabled>
                            <start>0</start>
                            <end>${dur}</end>
                            <effect>
                                <name>Opacity</name>
                                <effectid>opacity</effectid>
                                <effecttype>motion</effecttype>
                                <mediatype>video</mediatype>
                                <effectcategory>motion</effectcategory>
                                <parameter>
                                    <name>opacity</name>
                                    <parameterid>opacity</parameterid>
                                    <value>100</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                            </effect>
                        </filter>
                    </generatoritem>`;
}).join("\n")}
            </track>` : ""}
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
                <sourcetrack>
                  <mediatype>audio</mediatype>
                  <trackindex>1</trackindex>
                </sourcetrack>
                <file id="audio-file-${exportUid}-1">
                  <name>${escapeXml(audioTrack.fileName)}</name>
                  <pathurl>${escapeXml(audioFileName)}</pathurl>
                  <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>${audioEndFrame}</duration>
                  <media>
                    <audio>
                      <channelcount>2</channelcount>
                      <samplecharacteristics>
                        <depth>16</depth>
                        <samplerate>48000</samplerate>
                      </samplecharacteristics>
                    </audio>
                  </media>
                </file>
              </clipitem>
            </track>${musicTracks.map((mt, idx) => {
              const trackIdx = idx + 2;
              const clipId = `audio-clip-${exportUid}-music-${trackIdx}`;
              const fileId = `audio-file-${exportUid}-music-${trackIdx}`;
              return `
            <track>
              <clipitem id="${clipId}">
                <name>${escapeXml(mt.fileName)}</name>
                <duration>${audioEndFrame}</duration>
                <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
                <start>0</start>
                <end>${audioEndFrame}</end>
                <in>0</in>
                <out>${audioEndFrame}</out>
                <sourcetrack>
                  <mediatype>audio</mediatype>
                  <trackindex>${trackIdx}</trackindex>
                </sourcetrack>
                <file id="${fileId}">
                  <name>${escapeXml(mt.fileName)}</name>
                  <pathurl>${escapeXml(mt.localPath)}</pathurl>
                  <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
                  <duration>${audioEndFrame}</duration>
                  <media>
                    <audio>
                      <channelcount>2</channelcount>
                      <samplecharacteristics>
                        <depth>16</depth>
                        <samplerate>48000</samplerate>
                      </samplecharacteristics>
                    </audio>
                  </media>
                </file>
              </clipitem>
            </track>`;
            }).join("")}
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
 *
 * When manifestEntries are provided, they are the sole source of truth
 * for timing (start/duration). The Timeline is only used for media URLs
 * and audio track info.
 */
export async function exportTimelineToXmlZip(
  timeline: Timeline,
  fps: ExportFps = 24,
  onProgress?: (p: XmlExportProgress) => void,
  chapters?: Chapter[],
  manifestEntries?: ManifestTimingEntry[],
  musicTracks?: { url: string; name: string }[]
): Promise<Blob> {
  const zip = new JSZip();
  const mediaFolder = zip.folder("media")!;
  const segments = timeline.videoTrack.segments;

  // Determine which segments to export:
  // If manifestEntries provided, only export shots that appear in the manifest (active only)
  const useManifest = manifestEntries && manifestEntries.length > 0;
  const manifestShotIds = useManifest ? new Set(manifestEntries.map((e) => e.shotId)) : null;
  const exportSegments = manifestShotIds
    ? segments.filter((seg) => manifestShotIds.has(seg.id))
    : segments;

  // Build segment index map (original index in segments array → export index)
  const segmentOriginalIndices = exportSegments.map((seg) => segments.indexOf(seg));

  const imageFileNames = new Map<number, string>();

  // ── Download images ──
  for (let i = 0; i < exportSegments.length; i++) {
    const seg = exportSegments[i];
    onProgress?.({
      phase: "images",
      percent: Math.round((i / exportSegments.length) * 60),
      message: `Téléchargement image ${i + 1}/${exportSegments.length}…`,
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

  // ── Download music tracks ──
  const musicFileEntries: { fileName: string; localPath: string }[] = [];
  if (musicTracks && musicTracks.length > 0) {
    for (let i = 0; i < musicTracks.length; i++) {
      const mt = musicTracks[i];
      onProgress?.({ phase: "audio", percent: 68 + Math.round((i / musicTracks.length) * 7), message: `Téléchargement musique ${i + 1}/${musicTracks.length}…` });
      const ext = mt.name.split(".").pop() || "mp3";
      const safeName = `music_${String(i + 1).padStart(2, "0")}.${ext}`;
      const data = await fetchMedia(mt.url);
      if (data) {
        mediaFolder.file(safeName, data);
        musicFileEntries.push({ fileName: mt.name, localPath: `media/${safeName}` });
      }
    }
  }

  // ── Build clip frames ──
  let clipFrames: ClipFrame[];
  let totalFrames: number;

  if (useManifest) {
    // PRIMARY PATH: frames from manifest timing (deterministic, no drift)
    clipFrames = buildClipFramesFromManifest(manifestEntries, fps);
    totalFrames = clipFrames.length > 0
      ? clipFrames[clipFrames.length - 1].end
      : Math.ceil(timeline.totalDuration * fps);
  } else {
    // LEGACY PATH: frames from timeline timepoints
    clipFrames = buildClipFrames(timeline, fps);
    totalFrames = clipFrames.length > 0
      ? clipFrames[clipFrames.length - 1].end
      : Math.ceil(timeline.totalDuration * fps);
  }

  // ── Build XML segments ──
  const xmlSegments: XmlSegment[] = exportSegments.map((seg) => ({
    id: seg.id,
    sceneTitle: seg.sceneTitle,
    description: seg.description,
    sentence: seg.sentence,
    sentenceFr: seg.sentenceFr,
    imageUrl: seg.imageUrl,
    shotType: seg.shotType,
  }));

  // ── Generate XML ──
  onProgress?.({ phase: "packaging", percent: 80, message: "Génération du XML…" });
  const exportUid = crypto.randomUUID().slice(0, 8);
  const timelineMarkers = chapters ? buildChapterMarkers(chapters, timeline, fps) : [];
  const markersXml = timelineMarkers.length > 0 ? generateMarkerXml(timelineMarkers, fps) : "";

  // Build chapter title clips: each title spans the duration of its associated shot
  const chapterTitleClips = timelineMarkers.map((marker) => {
    const clipEnd = clipFrames[marker.clipIndex]?.end ?? marker.startFrame + Math.round(fps * 5);
    return {
      name: marker.name,
      startFrame: marker.startFrame,
      endFrame: clipEnd,
    };
  });

  const xml = generateXml(
    xmlSegments,
    clipFrames,
    totalFrames,
    { fileName: timeline.audioTrack.fileName, durationEstimate: timeline.audioTrack.durationEstimate },
    fps,
    imageFileNames,
    `media/${audioFileName}`,
    exportUid,
    markersXml,
    musicFileEntries,
    chapterTitleClips
  );
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
