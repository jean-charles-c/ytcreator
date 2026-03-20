/**
 * titleInjectorGenerator.ts
 *
 * Shared logic for parsing XMEML XML and generating a DaVinci Resolve
 * Python script that injects Fusion Titles on the V2 track.
 * Used by both the standalone TitleInjector page and the XML ZIP export.
 */

/* ─── types ─── */
export interface ExtractedTitle {
  index: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  startTC: string;
  endTC: string;
  text: string;
}

/* ─── helpers ─── */
export function framesToTC(frame: number, fps: number): string {
  if (fps <= 0) return "00:00:00:00";
  const f = frame % fps;
  const totalSec = Math.floor(frame / fps);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function nodeText(el: Element | null, tag: string): string {
  return el?.getElementsByTagName(tag)?.[0]?.textContent?.trim() ?? "";
}

function nodeInt(el: Element | null, tag: string): number {
  return parseInt(nodeText(el, tag), 10) || 0;
}

/* ─── XML parser ─── */
export function parseXmeml(xmlStr: string): { fps: number; titles: ExtractedTitle[]; warning: string | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");

  const errorNode = doc.querySelector("parsererror");
  if (errorNode) return { fps: 0, titles: [], warning: "Le fichier XML est invalide." };

  // fps
  const rateNodes = doc.getElementsByTagName("rate");
  let fps = 25;
  if (rateNodes.length > 0) fps = nodeInt(rateNodes[0], "timebase") || 25;

  // find video tracks
  const videoEl = doc.getElementsByTagName("video");
  if (videoEl.length === 0) return { fps, titles: [], warning: "Aucun bloc <video> trouvé dans le XML." };

  const tracks = videoEl[0].getElementsByTagName("track");
  if (tracks.length < 2) return { fps, titles: [], warning: "Pas de piste V2 trouvée (une seule piste vidéo détectée)." };

  const v1Track = tracks[0];
  const v2Track = tracks[1];

  // V1 clips for mastercomment1 lookup
  const v1Clips = Array.from(v1Track.getElementsByTagName("clipitem"));

  // V2 clips
  const v2Clips = Array.from(v2Track.getElementsByTagName("clipitem"));
  if (v2Clips.length === 0) return { fps, titles: [], warning: "Aucun clipitem trouvé sur la piste V2." };

  const titles: ExtractedTitle[] = v2Clips.map((clip, idx) => {
    const start = nodeInt(clip, "start");
    const end = nodeInt(clip, "end");
    const duration = end - start;

    // find overlapping V1 clip for mastercomment1
    let text = "";
    for (const v1 of v1Clips) {
      const v1Start = nodeInt(v1, "start");
      const v1End = nodeInt(v1, "end");
      if (start >= v1Start && start < v1End) {
        text = nodeText(v1, "mastercomment1");
        break;
      }
    }
    if (!text) {
      text = nodeText(clip, "name") || `Title ${idx + 1}`;
    }

    return {
      index: idx + 1,
      startFrame: start,
      endFrame: end,
      durationFrames: duration,
      startTC: framesToTC(start, fps),
      endTC: framesToTC(end, fps),
      text,
    };
  });

  return { fps, titles, warning: null };
}

/* ─── Python generator ─── */
export function generatePython(
  titles: ExtractedTitle[],
  fps: number,
  timelineName: string,
  templateName: string,
): string {
  const escapePy = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

  const titlesArray = titles
    .map(
      (t) =>
        `    {"start": ${t.startFrame}, "duration": ${t.durationFrames}, "text": "${escapePy(t.text)}"},`,
    )
    .join("\n");

  return `import DaVinciResolveScript as dvr

resolve = dvr.scriptapp("Resolve")
projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()
timeline = None

# Find timeline by name
for i in range(1, project.GetTimelineCount() + 1):
    tl = project.GetTimelineByIndex(i)
    if tl.GetName() == "${escapePy(timelineName)}":
        timeline = tl
        break

if not timeline:
    print("Timeline '${escapePy(timelineName)}' not found. Using current timeline.")
    timeline = project.GetCurrentTimeline()

fps = ${fps}

titles = [
${titlesArray}
]

mediaPool = project.GetMediaPool()

for title in titles:
    start_frame = title["start"]
    duration = title["duration"]
    text = title["text"]

    clip_info = {
        "startFrame": start_frame,
        "endFrame": start_frame + duration,
        "mediaType": 1,
        "trackIndex": 2,
    }

    # Add Fusion Title generator
    new_clip = mediaPool.AppendToTimeline([{
        "mediaPoolItem": None,
        "startFrame": start_frame,
        "endFrame": start_frame + duration,
        "trackIndex": 2,
        "recordFrame": start_frame
    }])

print("Attempting to add titles via timeline items...")

# Alternative approach: use timeline items
track_count = timeline.GetTrackCount("video")
print(f"Video tracks: {track_count}")

# Add each title as a Fusion Title generator
for title in titles:
    timeline.SetCurrentTimecode(str(title["start"]))

items = timeline.GetItemListInTrack("video", 2)
if items:
    for item in items:
        item_start = item.GetStart()
        for title in titles:
            if title["start"] == item_start:
                comp = item.GetFusionCompByIndex(1)
                if comp:
                    tool = comp.FindToolByID("TextPlus") or comp.FindFirstTool("TextPlus")
                    if tool:
                        tool.StyledText = title["text"]
                        print(f"Set text at frame {item_start}: {title['text'][:40]}")

print("Done! Check your V2 track in DaVinci Resolve.")
print("If titles are missing, manually add a Fusion Title from Effects > Titles > ${escapePy(templateName)}")
print("then re-run the script to inject text content.")
`;
}

/**
 * Generate a Python script from raw XML content.
 * Convenience wrapper for the ZIP export flow.
 */
export function generatePythonFromXml(
  xmlContent: string,
  timelineName = "Main Sequence",
  templateName = "Fusion Title",
): string | null {
  const { titles, fps } = parseXmeml(xmlContent);
  if (titles.length === 0) return null;
  return generatePython(titles, fps, timelineName, templateName);
}
