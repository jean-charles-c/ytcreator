import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegWorkerURL from "@ffmpeg/ffmpeg/dist/esm/worker.js?url";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { Timeline, ShotSegment } from "./timelineAssembly";

export type ExportFps = 24 | 25 | 30;

export interface ExportOptions {
  fps: ExportFps;
  width: number;
  height: number;
}

export interface ExportProgress {
  phase: "loading" | "preparing" | "encoding" | "finalizing" | "done" | "error";
  percent: number;
  message: string;
}

const DEFAULT_OPTIONS: ExportOptions = { fps: 24, width: 1920, height: 1080 };
const LOAD_TIMEOUT_MS = 20000;

let ffmpegInstance: FFmpeg | null = null;
let abortFlag = false;

/** Call to abort an in-progress export */
export function abortExport() {
  abortFlag = true;
}

async function getFFmpeg(onProgress: (p: ExportProgress) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;

  onProgress({ phase: "loading", percent: 0, message: "Chargement du moteur vidéo…" });

  const ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    onProgress({
      phase: "encoding",
      percent: Math.min(95, Math.round(progress * 100)),
      message: `Encodage… ${Math.round(progress * 100)}%`,
    });
  });

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  let loadTimeoutId: ReturnType<typeof window.setTimeout> | null = null;

  try {
    onProgress({ phase: "loading", percent: 5, message: "Téléchargement du moteur vidéo…" });
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
    onProgress({ phase: "loading", percent: 15, message: "Téléchargement du WASM…" });
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");
    onProgress({ phase: "loading", percent: 25, message: "Initialisation du moteur…" });

    const loadPromise = ffmpeg.load({
      coreURL,
      wasmURL,
      classWorkerURL: ffmpegWorkerURL,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      loadTimeoutId = window.setTimeout(() => {
        reject(new Error("Le chargement du moteur vidéo a expiré."));
      }, LOAD_TIMEOUT_MS);
    });

    await Promise.race([loadPromise, timeoutPromise]);
  } catch (err) {
    ffmpeg.terminate();
    console.error("FFmpeg load failed:", err);
    throw new Error("Impossible de charger le moteur vidéo. Le worker FFmpeg n’a pas pu s’initialiser.");
  } finally {
    if (loadTimeoutId !== null) {
      window.clearTimeout(loadTimeoutId);
    }
  }

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * Draw a segment image (or placeholder) onto a canvas at the target resolution.
 * Returns a JPEG Uint8Array.
 */
async function renderFrameImage(
  segment: ShotSegment,
  width: number,
  height: number
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  if (segment.imageUrl) {
    try {
      const img = await loadImage(segment.imageUrl);
      // Fit contain
      const scale = Math.min(width / img.width, height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    } catch {
      drawPlaceholder(ctx, segment, width, height);
    }
  } else {
    drawPlaceholder(ctx, segment, width, height);
  }

  // Subtitle overlay
  const text = segment.sentence || segment.description;
  if (text) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, height - 120, width, 120);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxWidth = width - 120;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = 34;
    const startY = height - 120 / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, startY + i * lineHeight, maxWidth);
    });
  }

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  segment: ShotSegment,
  width: number,
  height: number
) {
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#4a4a6a";
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Shot ${segment.shotOrder}`, width / 2, height / 2 - 20);
  ctx.fillStyle = "#3a3a5a";
  ctx.font = "24px sans-serif";
  ctx.fillText("Pas de visuel", width / 2, height / 2 + 30);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // max 3 lines
}

/**
 * Export timeline to MP4 blob.
 */
export async function exportTimelineToMp4(
  timeline: Timeline,
  onProgress: (p: ExportProgress) => void,
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  abortFlag = false;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { segments } = timeline.videoTrack;

  const ffmpeg = await getFFmpeg(onProgress);

  // ── Phase: Prepare images ──
  onProgress({ phase: "preparing", percent: 5, message: "Préparation des images…" });

  const concatLines: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (abortFlag) throw new Error("Export annulé");
    const seg = segments[i];
    const fileName = `img_${String(i).padStart(4, "0")}.jpg`;

    const jpegData = await renderFrameImage(seg, opts.width, opts.height);
    await ffmpeg.writeFile(fileName, jpegData);

    concatLines.push(`file '${fileName}'`);
    concatLines.push(`duration ${seg.duration.toFixed(4)}`);

    onProgress({
      phase: "preparing",
      percent: 5 + Math.round((i / segments.length) * 25),
      message: `Image ${i + 1}/${segments.length}…`,
    });
  }

  // Repeat last image (FFmpeg concat demuxer requirement)
  if (segments.length > 0) {
    concatLines.push(`file 'img_${String(segments.length - 1).padStart(4, "0")}.jpg'`);
  }

  const concatContent = concatLines.join("\n");
  await ffmpeg.writeFile("input.txt", new TextEncoder().encode(concatContent));

  // ── Phase: Fetch audio ──
  onProgress({ phase: "preparing", percent: 32, message: "Chargement de l'audio…" });
  const audioData = await fetchFile(timeline.audioTrack.audioUrl);
  await ffmpeg.writeFile("audio.mp3", audioData);

  // ── Phase: Encode ──
  onProgress({ phase: "encoding", percent: 35, message: "Encodage vidéo…" });

  await ffmpeg.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", "input.txt",
    "-i", "audio.mp3",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-r", String(opts.fps),
    "-s", `${opts.width}x${opts.height}`,
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-y",
    "output.mp4",
  ]);

  // ── Phase: Read output ──
  onProgress({ phase: "finalizing", percent: 96, message: "Finalisation…" });
  const outputRaw = await ffmpeg.readFile("output.mp4");
  // Cast to satisfy strict TS — FFmpeg WASM returns Uint8Array for binary files
  const outputBytes = typeof outputRaw === "string"
    ? new TextEncoder().encode(outputRaw)
    : new Uint8Array(outputRaw.buffer as ArrayBuffer, outputRaw.byteOffset, outputRaw.byteLength);

  // Cleanup
  for (let i = 0; i < segments.length; i++) {
    await ffmpeg.deleteFile(`img_${String(i).padStart(4, "0")}.jpg`).catch(() => {});
  }
  await ffmpeg.deleteFile("input.txt").catch(() => {});
  await ffmpeg.deleteFile("audio.mp3").catch(() => {});
  await ffmpeg.deleteFile("output.mp4").catch(() => {});

  const blob = new Blob([outputBytes], { type: "video/mp4" });

  onProgress({ phase: "done", percent: 100, message: "Export terminé !" });

  return blob;
}
