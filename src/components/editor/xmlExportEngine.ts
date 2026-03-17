import type { Timeline } from "./timelineAssembly";
import type { ExportFps } from "./videoExportEngine";

/**
 * Generate an FCP XML (Final Cut Pro 7 compatible) representation of the timeline.
 * Returns an XML string.
 */
export function exportTimelineToXml(timeline: Timeline, fps: ExportFps = 24): string {
  const { videoTrack, audioTrack, totalDuration } = timeline;
  const segments = videoTrack.segments;

  const frameDuration = `1/${fps}s`;
  const totalFrames = Math.ceil(totalDuration * fps);

  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const clipItems = segments.map((seg, i) => {
    const startFrame = Math.round(seg.startTime * fps);
    const endFrame = Math.round((seg.startTime + seg.duration) * fps);
    const name = `Shot ${seg.shotOrder} — ${escapeXml(seg.sceneTitle)}`;
    const description = escapeXml(seg.description);
    const sentence = escapeXml(seg.sentence || seg.sentenceFr || "");

    return `
      <clipitem id="clip-${i + 1}">
        <name>${name}</name>
        <duration>${endFrame - startFrame}</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <start>${startFrame}</start>
        <end>${endFrame}</end>
        <in>0</in>
        <out>${endFrame - startFrame}</out>
        <file id="file-${i + 1}">
          <name>${name}</name>
          <pathurl>${seg.imageUrl ? escapeXml(seg.imageUrl) : ""}</pathurl>
          <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          <duration>${endFrame - startFrame}</duration>
          <media><video><duration>${endFrame - startFrame}</duration></video></media>
        </file>
        <comments>
          <mastercomment1>${sentence}</mastercomment1>
          <mastercomment2>${description}</mastercomment2>
          <mastercomment3>Type: ${escapeXml(seg.shotType)}</mastercomment3>
        </comments>
      </clipitem>`;
  }).join("\n");

  const audioStartFrame = 0;
  const audioEndFrame = Math.round((audioTrack.durationEstimate || totalDuration) * fps);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project>
    <name>Timeline Export</name>
    <children>
      <sequence>
        <name>Main Sequence</name>
        <duration>${totalFrames}</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
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
              <clipitem id="audio-clip-1">
                <name>${escapeXml(audioTrack.fileName)}</name>
                <duration>${audioEndFrame}</duration>
                <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
                <start>${audioStartFrame}</start>
                <end>${audioEndFrame}</end>
                <in>0</in>
                <out>${audioEndFrame}</out>
                <file id="audio-file-1">
                  <name>${escapeXml(audioTrack.fileName)}</name>
                  <pathurl>${escapeXml(audioTrack.audioUrl)}</pathurl>
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

  return xml;
}

/**
 * Convert XML string to a Blob for download or upload.
 */
export function xmlToBlob(xml: string): Blob {
  return new Blob([xml], { type: "application/xml" });
}
