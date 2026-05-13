// search-reference-images-v2
// Multi-source reference image search (Wikidata, Wikimedia, Brave) with
// Gemini-driven query enrichment + multimodal validation, cached in Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ─────────────────────────────────────────────────────────────────────────────
// Config / constants
// ─────────────────────────────────────────────────────────────────────────────

const USER_AGENT = "YTcreatorReferenceImageSearch/2.0 (https://yt.candaux.fr)";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const VALIDATION_CONCURRENCY = 3; // free tier ~10 RPM on Flash
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (CPU budget)
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CANDIDATES_TO_VALIDATE = 10; // hard cap to stay under CPU limit

const MATCH_THRESHOLD = 7;
const QUALITY_THRESHOLD = 6;
const MATCH_WEIGHT = 0.7;
const QUALITY_WEIGHT = 0.3;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SourceName = "wikidata" | "wikimedia" | "brave"; // extensible

type ObjectType = "vehicle" | "person" | "object" | "concept" | "place" | "event";

interface ObjectInput {
  nom: string;
  epoque?: string;
  description?: string;
  context?: string;
}

interface RequestInput {
  object: ObjectInput;
  limit?: number;
  force_refresh?: boolean;
}

interface EnrichedQuery {
  query: string;
  type: ObjectType;
  wikidata_label?: string;
}

interface Candidate {
  url: string;
  source: SourceName;
  title: string;
  width?: number;
  height?: number;
  mime?: string;
}

type CandidateStatus =
  | "validated"
  | "rejected_match"
  | "rejected_quality"
  | "rejected_both";

interface ValidatedImage extends Candidate {
  match_score: number;
  quality_score: number;
  reason: string;
}

interface ScoredCandidate extends ValidatedImage {
  status: CandidateStatus;
  rank_score: number;
}

interface SearchFn {
  (enriched: EnrichedQuery, input: ObjectInput): Promise<Candidate[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.host.replace(/^www\./, "").toLowerCase();
    return `${host}${u.pathname.toLowerCase()}`;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/\?.*$/, "");
  }
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const { signal, cancel } = withTimeout(ms);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    cancel();
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini helpers
// ─────────────────────────────────────────────────────────────────────────────

function geminiUrl(apiKey: string): string {
  return `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
}

function extractGeminiText(payload: any): string | null {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  return parts.map((p: any) => p?.text || "").join("").trim() || null;
}

function safeParseJson<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Try to extract first JSON object.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

async function enrichQuery(
  input: ObjectInput,
  apiKey: string,
): Promise<EnrichedQuery> {
  const prompt = `You are helping search the web for reference photographs of a recurring entity from a documentary script.

Entity:
- name: ${input.nom}
${input.epoque ? `- period/year: ${input.epoque}` : ""}
${input.description ? `- description: ${input.description}` : ""}
${input.context ? `- script context: ${input.context}` : ""}

Tasks:
1. Produce a single concise English image-search query (3-8 words) that best targets real photographs of this entity.
2. Classify the entity as one of: vehicle, person, object, concept, place, event.
3. If you are confident, also suggest the most likely Wikidata English label (else null).

Return ONLY a JSON object: {"query": string, "type": string, "wikidata_label": string|null}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };

  const res = await fetchWithTimeout(geminiUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn(`Gemini enrichQuery HTTP ${res.status}; falling back to raw name`);
    return {
      query: `${input.nom} ${input.epoque || ""}`.trim(),
      type: "object",
    };
  }

  const payload = await res.json();
  const text = extractGeminiText(payload) || "";
  const parsed = safeParseJson<{ query?: string; type?: string; wikidata_label?: string | null }>(text);

  const validTypes: ObjectType[] = ["vehicle", "person", "object", "concept", "place", "event"];
  const type = (parsed?.type && validTypes.includes(parsed.type as ObjectType)
    ? parsed.type
    : "object") as ObjectType;

  return {
    query: parsed?.query?.trim() || `${input.nom} ${input.epoque || ""}`.trim(),
    type,
    wikidata_label: parsed?.wikidata_label || undefined,
  };
}

async function validateImage(
  candidate: Candidate,
  enriched: EnrichedQuery,
  input: ObjectInput,
  apiKey: string,
): Promise<ValidatedImage | null> {
  // 1) Fetch the image bytes (with size cap).
  let bytes: Uint8Array;
  let mime = candidate.mime || "image/jpeg";
  try {
    const res = await fetchWithTimeout(candidate.url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      console.warn(`validate: fetch ${candidate.url} -> ${res.status}`);
      return null;
    }
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.startsWith("image/")) {
      console.warn(`validate: not an image (${ctype}) ${candidate.url}`);
      return null;
    }
    mime = ctype.split(";")[0].trim();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      console.warn(`validate: too big (${buf.byteLength}B) ${candidate.url}`);
      return null;
    }
    bytes = buf;
  } catch (e) {
    console.warn(`validate: fetch error ${candidate.url}`, (e as Error).message);
    return null;
  }

  // 2) Base64 encode for Gemini inlineData (fast native encoder).
  let base64: string;
  try {
    base64 = encodeBase64(bytes);
  } catch (e) {
    console.warn(`validate: base64 error ${candidate.url}`, (e as Error).message);
    return null;
  }

  // 3) Ask Gemini to score the image.
  const instructions = `You are validating whether an image is a usable reference photograph for a documentary asset.

Target entity:
- name: ${input.nom}
${input.epoque ? `- period/year: ${input.epoque}` : ""}
${input.description ? `- description: ${input.description}` : ""}
- type: ${enriched.type}
- search query used: ${enriched.query}

Score the image:
- match_score (0-10): how confidently this image depicts the exact target entity (not just similar). 10 = unambiguous match.
- quality_score (0-10): visual usability as a reference (resolution, clarity, framing, lack of watermarks/overlays, professional look).
- reason: one short sentence justifying the scores.

Return ONLY a JSON object:
{"match_score": number, "quality_score": number, "reason": string}`;

  const body = {
    contents: [{
      role: "user",
      parts: [
        { text: instructions },
        { inlineData: { mimeType: mime, data: base64 } },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  try {
    const res = await fetchWithTimeout(geminiUrl(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 20_000);
    if (!res.ok) {
      console.warn(`validate: Gemini HTTP ${res.status} for ${candidate.url}`);
      return null;
    }
    const payload = await res.json();
    const text = extractGeminiText(payload) || "";
    const parsed = safeParseJson<{ match_score?: number; quality_score?: number; reason?: string }>(text);
    if (!parsed) return null;
    const match = Number(parsed.match_score);
    const quality = Number(parsed.quality_score);
    if (!Number.isFinite(match) || !Number.isFinite(quality)) return null;
    return {
      ...candidate,
      match_score: Math.max(0, Math.min(10, match)),
      quality_score: Math.max(0, Math.min(10, quality)),
      reason: parsed.reason || "",
    };
  } catch (e) {
    console.warn(`validate: Gemini error ${candidate.url}`, (e as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source: Wikidata (P18 + P154 via SPARQL)
// ─────────────────────────────────────────────────────────────────────────────

async function wikidataResolveQids(label: string): Promise<string[]> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "5");
  url.searchParams.set("search", label);

  const res = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`wikidata search HTTP ${res.status}`);
  const data = await res.json();
  const ids = (data?.search || [])
    .map((s: any) => s?.id)
    .filter((id: any) => typeof id === "string" && /^Q\d+$/.test(id));
  return ids.slice(0, 5);
}

async function wikidataFetchImages(qids: string[]): Promise<Candidate[]> {
  if (qids.length === 0) return [];
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const sparql = `SELECT DISTINCT ?image WHERE {
    VALUES ?entity { ${values} }
    ?entity wdt:P18|wdt:P154 ?image .
  } LIMIT 10`;

  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", sparql);
  url.searchParams.set("format", "json");

  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/sparql-results+json",
    },
  });
  if (!res.ok) throw new Error(`wikidata SPARQL HTTP ${res.status}`);
  const data = await res.json();
  const bindings = data?.results?.bindings || [];
  const out: Candidate[] = [];
  for (const b of bindings) {
    const url = b?.image?.value;
    if (!url || typeof url !== "string") continue;
    // Wikidata returns Commons file URLs which are direct image URLs.
    out.push({
      url,
      source: "wikidata",
      title: decodeURIComponent(url.split("/").pop() || "").replace(/_/g, " "),
    });
  }
  return out;
}

const searchWikidata: SearchFn = async (enriched) => {
  const label = enriched.wikidata_label?.trim() || enriched.query;
  try {
    const qids = await wikidataResolveQids(label);
    if (qids.length === 0) return [];
    return await wikidataFetchImages(qids);
  } catch (e) {
    console.warn("source[wikidata] error:", (e as Error).message);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Source: Wikimedia Commons (same logic as v1, kept)
// ─────────────────────────────────────────────────────────────────────────────

const searchWikimedia: SearchFn = async (enriched) => {
  const out: Candidate[] = [];
  try {
    const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("generator", "search");
    searchUrl.searchParams.set("gsrnamespace", "6");
    searchUrl.searchParams.set("gsrsearch", enriched.query);
    searchUrl.searchParams.set("gsrlimit", "20");
    searchUrl.searchParams.set("prop", "imageinfo");
    searchUrl.searchParams.set("iiprop", "url|size|mime");
    searchUrl.searchParams.set("iiurlwidth", "800");

    const res = await fetchWithTimeout(searchUrl.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`wikimedia HTTP ${res.status}`);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return [];

    for (const page of Object.values(pages) as any[]) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      if (!info.mime?.startsWith("image/")) continue;
      if (info.mime === "image/svg+xml") continue;
      const w = Number(info.width) || 0;
      const h = Number(info.height) || 0;
      if (w < 200 || h < 150) continue;
      out.push({
        url: info.url,
        source: "wikimedia",
        title: (page.title || "").replace(/^File:/, ""),
        width: w,
        height: h,
        mime: info.mime,
      });
    }
  } catch (e) {
    console.warn("source[wikimedia] error:", (e as Error).message);
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Source: Brave Image Search
// ─────────────────────────────────────────────────────────────────────────────

function makeSearchBrave(apiKey: string): SearchFn {
  return async (enriched) => {
    const url = new URL("https://api.search.brave.com/res/v1/images/search");
    url.searchParams.set("q", enriched.query);
    url.searchParams.set("count", "20");
    url.searchParams.set("safesearch", "strict");
    url.searchParams.set("country", "FR");

    try {
      const res = await fetchWithTimeout(url.toString(), {
        headers: {
          "X-Subscription-Token": apiKey,
          "Accept": "application/json",
          "User-Agent": USER_AGENT,
        },
      });
      if (res.status === 429) {
        console.warn("source[brave] rate limited (429)");
        return [];
      }
      if (!res.ok) throw new Error(`brave HTTP ${res.status}`);
      const data = await res.json();
      const results = data?.results || [];
      const out: Candidate[] = [];
      for (const r of results) {
        const imgUrl = r?.properties?.url || r?.thumbnail?.src;
        if (!imgUrl || typeof imgUrl !== "string") continue;
        out.push({
          url: imgUrl,
          source: "brave",
          title: r?.title || "",
          width: Number(r?.properties?.width) || undefined,
          height: Number(r?.properties?.height) || undefined,
        });
      }
      return out;
    } catch (e) {
      console.warn("source[brave] error:", (e as Error).message);
      return [];
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

function makeCacheKeyInput(o: ObjectInput): string {
  return `${o.nom}|${o.epoque || ""}|${o.description || ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  let body: RequestInput;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const obj = body?.object;
  if (!obj?.nom || typeof obj.nom !== "string") {
    return new Response(
      JSON.stringify({ error: "object.nom is required" }),
      { status: 400, headers: jsonHeaders },
    );
  }
  const limit = Math.max(1, Math.min(20, Number(body.limit) || 5));
  const forceRefresh = Boolean(body.force_refresh);

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured" }),
      { status: 500, headers: jsonHeaders },
    );
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Supabase service credentials missing" }),
      { status: 500, headers: jsonHeaders },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const cacheKeyInput = makeCacheKeyInput(obj);
  const queryHash = await sha256Hex(cacheKeyInput);

  // ── 1. Cache lookup
  if (!forceRefresh) {
    const { data: cached, error: cacheErr } = await supabase
      .from("image_search_cache")
      .select("validated_images, source_breakdown, enriched_query, expires_at")
      .eq("query_hash", queryHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cacheErr) {
      console.warn("cache lookup error:", cacheErr.message);
    } else if (cached?.validated_images) {
      const stored = cached.validated_images as Array<ScoredCandidate | ValidatedImage>;
      // Back-compat: older cache entries are plain ValidatedImage[] without status.
      const normalized: ScoredCandidate[] = stored.map((c: any) => ({
        ...c,
        status: (c.status as CandidateStatus) ?? "validated",
        rank_score: typeof c.rank_score === "number"
          ? c.rank_score
          : (c.match_score * MATCH_WEIGHT + c.quality_score * QUALITY_WEIGHT),
      }));
      const validatedOnly = normalized.filter((c) => c.status === "validated");
      const topN = validatedOnly.slice(0, limit);
      return new Response(
        JSON.stringify({
          source: "cache",
          enriched: cached.enriched_query,
          candidates_count: normalized.length,
          validated_count: validatedOnly.length,
          images: topN,
          all_candidates: normalized,
          source_breakdown: cached.source_breakdown ?? null,
        }),
        { headers: jsonHeaders },
      );
    }
  }

  // ── 2. Enrich the query via Gemini
  const enriched = await enrichQuery(obj, GEMINI_API_KEY);
  console.log("enriched:", JSON.stringify(enriched));

  // ── 3. Run sources in parallel (extensible array)
  const sources: { name: SourceName; fn: SearchFn }[] = [
    { name: "wikidata", fn: searchWikidata },
    { name: "wikimedia", fn: searchWikimedia },
  ];
  if (BRAVE_API_KEY) {
    sources.push({ name: "brave", fn: makeSearchBrave(BRAVE_API_KEY) });
  } else {
    console.warn("BRAVE_API_KEY not set; skipping Brave source");
  }

  const sourceResults = await Promise.all(
    sources.map(async (s) => {
      try {
        const items = await s.fn(enriched, obj);
        return { name: s.name, items };
      } catch (e) {
        console.warn(`source[${s.name}] uncaught:`, (e as Error).message);
        return { name: s.name, items: [] as Candidate[] };
      }
    }),
  );

  // Source breakdown (raw counts before dedup/validation).
  const sourceBreakdown: Record<string, number> = {};
  for (const r of sourceResults) sourceBreakdown[r.name] = r.items.length;
  console.log("source breakdown (raw):", JSON.stringify(sourceBreakdown));

  // ── 4. Merge + dedup by normalized URL
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const r of sourceResults) {
    for (const c of r.items) {
      const key = normalizeUrl(c.url);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(c);
    }
  }

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({
        source: "fresh",
        enriched,
        candidates_count: 0,
        validated_count: 0,
        images: [],
      }),
      { headers: jsonHeaders },
    );
  }

  // ── 5. Validate each candidate with Gemini multimodal (capped for CPU budget).
  // Prioritize wikidata > wikimedia > brave to maximize hit rate within the cap.
  const sourceRank: Record<SourceName, number> = { wikidata: 0, wikimedia: 1, brave: 2 };
  const prioritized = [...candidates].sort(
    (a, b) => sourceRank[a.source] - sourceRank[b.source],
  );
  const toValidate = prioritized.slice(0, MAX_CANDIDATES_TO_VALIDATE);
  console.log(
    `validating ${toValidate.length}/${candidates.length} candidates (cap=${MAX_CANDIDATES_TO_VALIDATE})`,
  );
  const validated: ValidatedImage[] = [];
  const results = await mapWithConcurrency(
    toValidate,
    VALIDATION_CONCURRENCY,
    (c) => validateImage(c, enriched, obj, GEMINI_API_KEY),
  );
  for (const v of results) if (v) validated.push(v);

  // ── 6. Assign statuses and rank scores; sort all by rank_score
  const allScored: ScoredCandidate[] = validated
    .map((v) => {
      const matchOk = v.match_score >= MATCH_THRESHOLD;
      const qualityOk = v.quality_score >= QUALITY_THRESHOLD;
      let status: CandidateStatus = "validated";
      if (!matchOk && !qualityOk) status = "rejected_both";
      else if (!matchOk) status = "rejected_match";
      else if (!qualityOk) status = "rejected_quality";
      return {
        ...v,
        status,
        rank_score: v.match_score * MATCH_WEIGHT + v.quality_score * QUALITY_WEIGHT,
      };
    })
    .sort((a, b) => b.rank_score - a.rank_score);

  const validatedRanked = allScored.filter((c) => c.status === "validated");
  const topN = validatedRanked.slice(0, limit);

  // ── 7. Cache upsert (store the full scored list including rejects so the
  //       review UI can show them on cache hits too).
  try {
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error: upsertErr } = await supabase
      .from("image_search_cache")
      .upsert({
        query_hash: queryHash,
        query_text: cacheKeyInput,
        validated_images: allScored,
        source_breakdown: sourceBreakdown,
        enriched_query: enriched,
        expires_at: expiresAt,
      }, { onConflict: "query_hash" });
    if (upsertErr) console.warn("cache upsert error:", upsertErr.message);
  } catch (e) {
    console.warn("cache upsert exception:", (e as Error).message);
  }

  return new Response(
    JSON.stringify({
      source: "fresh",
      enriched,
      candidates_count: candidates.length,
      validated_count: validatedRanked.length,
      images: topN,
      all_candidates: allScored,
      source_breakdown: sourceBreakdown,
    }),
    { headers: jsonHeaders },
  );
});
