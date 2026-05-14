/**
 * search-stock-videos — Unified search for royalty-free stock videos.
 *
 * Queries Pexels and/or Pixabay APIs in parallel and returns a normalized
 * result set. Pixabay is automatically skipped if PIXABAY_API_KEY is not set,
 * so the function works as soon as Pexels is configured.
 *
 * Required Supabase secrets:
 *   - PEXELS_API_KEY   (required for "pexels" / "both")
 *   - PIXABAY_API_KEY  (optional — adds Pixabay results when present)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Source = "pexels" | "pixabay";
type Orientation = "any" | "landscape" | "portrait" | "square";

interface SearchInput {
  query: string;
  source?: "pexels" | "pixabay" | "both";
  orientation?: Orientation;
  /** Pixabay-only */
  category?: string;
  /** Pixabay-only: "all" | "film" | "animation" */
  videoType?: string;
  /** Pixabay-only */
  editorsChoice?: boolean;
  /** Pixabay-only */
  safesearch?: boolean;
  /** Locale code (Pexels) / language code (Pixabay) */
  locale?: string;
  page?: number;
  perPage?: number;
  /** Client-side filter helpers (we still send to API where supported) */
  minDuration?: number;
  maxDuration?: number;
}

interface VideoQuality {
  label: string;            // "4K" | "FullHD" | "HD" | "SD" | "tiny"
  url: string;
  width: number;
  height: number;
  fileSizeBytes?: number;
  fps?: number;
}

interface UnifiedVideo {
  /** Composite key e.g. "pexels:12345" */
  id: string;
  /** Original numeric/string id from provider */
  providerId: string;
  source: Source;
  /** Page URL on the provider's site (for attribution) */
  sourceUrl: string;
  /** Author display name */
  author: string;
  /** Author profile URL (Pexels only — null for Pixabay) */
  authorUrl: string | null;
  /** Static thumbnail */
  thumbnail: string;
  /** Lightweight preview URL (small MP4 for hover-play) */
  previewUrl: string;
  /** Title or first tags */
  title: string;
  /** Tag list (Pixabay) or empty */
  tags: string[];
  duration: number;          // seconds
  width: number;             // native max width
  height: number;            // native max height
  /** Available download qualities, sorted from highest to lowest */
  qualities: VideoQuality[];
}

interface SearchResponse {
  query: string;
  total: number;
  pexelsTotal?: number;
  pixabayTotal?: number;
  page: number;
  perPage: number;
  videos: UnifiedVideo[];
  warnings: string[];
}

/* ──────────────────────────────────────────────────────────────────
 * Pexels
 * ────────────────────────────────────────────────────────────────── */

async function searchPexels(
  input: SearchInput,
  apiKey: string,
): Promise<{ videos: UnifiedVideo[]; total: number }> {
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", input.query);
  if (input.orientation && input.orientation !== "any") {
    url.searchParams.set("orientation", input.orientation);
  }
  if (input.locale) url.searchParams.set("locale", input.locale);
  url.searchParams.set("page", String(input.page ?? 1));
  url.searchParams.set("per_page", String(input.perPage ?? 24));

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pexels API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const items: any[] = data?.videos ?? [];

  const videos: UnifiedVideo[] = items.map((v) => {
    const files: any[] = Array.isArray(v.video_files) ? v.video_files : [];
    const mp4s = files
      .filter((f) => (f.file_type ?? "").includes("mp4"))
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

    const qualities: VideoQuality[] = mp4s.map((f) => {
      const w = f.width ?? 0;
      let label: string;
      if (w >= 3000) label = "4K";
      else if (w >= 1900) label = "FullHD";
      else if (w >= 1200) label = "HD";
      else if (w >= 600) label = "SD";
      else label = "tiny";
      return {
        label,
        url: f.link,
        width: w,
        height: f.height ?? 0,
        fps: f.fps,
      };
    });

    // Preview = smallest mp4 (or fall back to last quality)
    const preview = mp4s[mp4s.length - 1]?.link ?? qualities[0]?.url ?? v.url;
    const previewPic =
      Array.isArray(v.video_pictures) && v.video_pictures.length > 0
        ? v.video_pictures[0].picture
        : v.image;

    return {
      id: `pexels:${v.id}`,
      providerId: String(v.id),
      source: "pexels",
      sourceUrl: v.url,
      author: v.user?.name ?? "Pexels Author",
      authorUrl: v.user?.url ?? null,
      thumbnail: previewPic ?? v.image,
      previewUrl: preview,
      title: (v.user?.name ?? "Pexels video") + ` (${v.duration}s)`,
      tags: [],
      duration: Number(v.duration ?? 0),
      width: Number(v.width ?? 0),
      height: Number(v.height ?? 0),
      qualities,
    };
  });

  return { videos, total: Number(data?.total_results ?? videos.length) };
}

/* ──────────────────────────────────────────────────────────────────
 * Pixabay
 * ────────────────────────────────────────────────────────────────── */

const PIXABAY_CATEGORIES = new Set([
  "backgrounds", "fashion", "nature", "science", "education",
  "feelings", "health", "people", "religion", "places",
  "animals", "industry", "computer", "food", "sports",
  "transportation", "travel", "buildings", "business", "music",
]);

async function searchPixabay(
  input: SearchInput,
  apiKey: string,
): Promise<{ videos: UnifiedVideo[]; total: number }> {
  const url = new URL("https://pixabay.com/api/videos/");
  url.searchParams.set("key", apiKey);
  if (input.query) url.searchParams.set("q", input.query);
  if (input.locale) url.searchParams.set("lang", input.locale);
  if (input.videoType && ["all", "film", "animation"].includes(input.videoType)) {
    url.searchParams.set("video_type", input.videoType);
  }
  if (input.category && PIXABAY_CATEGORIES.has(input.category)) {
    url.searchParams.set("category", input.category);
  }
  if (input.editorsChoice) url.searchParams.set("editors_choice", "true");
  if (input.safesearch !== false) url.searchParams.set("safesearch", "true");
  url.searchParams.set("page", String(input.page ?? 1));
  // Pixabay min per_page is 3
  url.searchParams.set("per_page", String(Math.max(3, input.perPage ?? 24)));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pixabay API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const items: any[] = data?.hits ?? [];

  const videos: UnifiedVideo[] = items.map((v) => {
    const variants: Record<string, any> = v.videos ?? {};
    // Order: large > medium > small > tiny
    const ordered = ["large", "medium", "small", "tiny"]
      .map((k) => ({ k, val: variants[k] }))
      .filter((x) => x.val?.url);

    const qualities: VideoQuality[] = ordered.map(({ k, val }) => {
      const w = val.width ?? 0;
      let label: string;
      if (w >= 3000) label = "4K";
      else if (w >= 1900) label = "FullHD";
      else if (w >= 1200) label = "HD";
      else if (w >= 600) label = "SD";
      else label = k === "tiny" ? "tiny" : "SD";
      return {
        label,
        url: val.url,
        width: val.width ?? 0,
        height: val.height ?? 0,
        fileSizeBytes: val.size,
      };
    });

    const tags: string[] = typeof v.tags === "string"
      ? v.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

    // Preview = smallest variant (tiny → small)
    const previewVariant = variants.tiny ?? variants.small ?? variants.medium ?? variants.large;
    const previewThumb = previewVariant?.thumbnail ?? variants.medium?.thumbnail ?? variants.large?.thumbnail ?? "";
    const largest = variants.large ?? variants.medium ?? variants.small ?? variants.tiny;

    return {
      id: `pixabay:${v.id}`,
      providerId: String(v.id),
      source: "pixabay",
      sourceUrl: v.pageURL,
      author: v.user ?? "Pixabay Author",
      authorUrl: null,
      thumbnail: previewThumb,
      previewUrl: previewVariant?.url ?? "",
      title: tags.slice(0, 3).join(", ") || `Pixabay video ${v.id}`,
      tags,
      duration: Number(v.duration ?? 0),
      width: Number(largest?.width ?? 0),
      height: Number(largest?.height ?? 0),
      qualities,
    };
  });

  return { videos, total: Number(data?.totalHits ?? videos.length) };
}

/* ──────────────────────────────────────────────────────────────────
 * Handler
 * ────────────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SearchInput;
    const query = (body.query ?? "").trim();
    if (!query) {
      return json({ error: "query is required" }, 400);
    }

    const wanted = body.source ?? "both";
    const pexelsKey = Deno.env.get("PEXELS_API_KEY");
    const pixabayKey = Deno.env.get("PIXABAY_API_KEY");

    const warnings: string[] = [];
    const tasks: Promise<{ source: Source; videos: UnifiedVideo[]; total: number } | null>[] = [];

    if ((wanted === "pexels" || wanted === "both") && pexelsKey) {
      tasks.push(
        searchPexels(body, pexelsKey)
          .then((r) => ({ source: "pexels" as const, ...r }))
          .catch((e) => {
            console.error("Pexels error:", e);
            warnings.push(`Pexels: ${(e as Error).message}`);
            return null;
          }),
      );
    } else if ((wanted === "pexels" || wanted === "both") && !pexelsKey) {
      warnings.push("Pexels: PEXELS_API_KEY not configured");
    }

    if ((wanted === "pixabay" || wanted === "both") && pixabayKey) {
      tasks.push(
        searchPixabay(body, pixabayKey)
          .then((r) => ({ source: "pixabay" as const, ...r }))
          .catch((e) => {
            console.error("Pixabay error:", e);
            warnings.push(`Pixabay: ${(e as Error).message}`);
            return null;
          }),
      );
    } else if ((wanted === "pixabay" || wanted === "both") && !pixabayKey) {
      warnings.push("Pixabay: PIXABAY_API_KEY not configured");
    }

    if (tasks.length === 0) {
      return json(
        {
          error: "No provider available. Set PEXELS_API_KEY and/or PIXABAY_API_KEY.",
          warnings,
        },
        503,
      );
    }

    const results = (await Promise.all(tasks)).filter(Boolean) as {
      source: Source;
      videos: UnifiedVideo[];
      total: number;
    }[];

    let combined: UnifiedVideo[] = [];
    let pexelsTotal: number | undefined;
    let pixabayTotal: number | undefined;
    for (const r of results) {
      combined = combined.concat(r.videos);
      if (r.source === "pexels") pexelsTotal = r.total;
      if (r.source === "pixabay") pixabayTotal = r.total;
    }

    // Client-side duration filter (APIs do not all support it)
    const minD = body.minDuration ?? 0;
    const maxD = body.maxDuration ?? Number.POSITIVE_INFINITY;
    if (minD > 0 || maxD < Number.POSITIVE_INFINITY) {
      combined = combined.filter((v) => v.duration >= minD && v.duration <= maxD);
    }

    // Interleave sources for a balanced view when "both"
    if (wanted === "both" && results.length > 1) {
      const byS = new Map<Source, UnifiedVideo[]>();
      for (const r of results) byS.set(r.source, [...r.videos]);
      const interleaved: UnifiedVideo[] = [];
      while (Array.from(byS.values()).some((arr) => arr.length > 0)) {
        for (const s of ["pexels", "pixabay"] as Source[]) {
          const arr = byS.get(s);
          if (arr && arr.length > 0) interleaved.push(arr.shift()!);
        }
      }
      combined = interleaved;
    }

    const response: SearchResponse = {
      query,
      total: (pexelsTotal ?? 0) + (pixabayTotal ?? 0),
      pexelsTotal,
      pixabayTotal,
      page: body.page ?? 1,
      perPage: body.perPage ?? 24,
      videos: combined,
      warnings,
    };

    return json(response, 200);
  } catch (err) {
    console.error("search-stock-videos error:", err);
    return json({ error: (err as Error).message || "Unknown error" }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
