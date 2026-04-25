// Edge function: sync-kie-pricing
// Scrapes https://kie.ai/pricing via Firecrawl, parses image-modality models,
// and upserts prices into public.kie_pricing.
//
// Triggers:
//  - Manual:    supabase.functions.invoke('sync-kie-pricing')
//  - Scheduled: pg_cron daily (configured separately)
//
// Auth: this function does not require an end-user JWT; it uses the
// service role key from env to write to the protected kie_pricing table.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const KIE_PRICING_URL = "https://kie.ai/pricing";
const MAX_PAGES = 6; // Image tab has ~72 entries → 25/page → 3 pages; we add buffer

// Map Kie model labels (markdown header) → our internal model_id used in
// public.kie_pricing.model_id. Anything not in this map is ignored so we keep
// the table focused on image generation engines actually wired in the app.
const KIE_HEADER_TO_MODEL_ID: Array<{ pattern: RegExp; modelId: string; label: string }> = [
  { pattern: /^gpt image 2\b/i,                  modelId: "gpt-image-2",     label: "GPT Image 2" },
  { pattern: /^gpt image 1\.5|^gpt image 1-5/i,  modelId: "gpt-image-1-5",   label: "GPT Image 1.5" },
  { pattern: /^ideogram[\s-]?v?3/i,              modelId: "ideogram-v3",     label: "Ideogram v3" },
  { pattern: /^imagen[\s-]?4(\s+ultra)/i,        modelId: "imagen-4-ultra",  label: "Imagen 4 Ultra" },
  { pattern: /^imagen[\s-]?4(\s+fast)/i,         modelId: "imagen-4-fast",   label: "Imagen 4 Fast" },
  { pattern: /^imagen[\s-]?4\b/i,                modelId: "imagen-4",        label: "Imagen 4" },
  { pattern: /^grok[\s-]?imagine/i,              modelId: "grok-imagine",    label: "Grok Imagine" },
  { pattern: /^(z[\s-]?image)\b/i,               modelId: "z-image",         label: "Z-Image" },
  { pattern: /^qwen[\s-]?z[\s-]?image/i,         modelId: "qwen-image",      label: "Qwen Z-Image" },
  { pattern: /^qwen[\s-]?(image[\s-]?)?2/i,      modelId: "qwen2-image",     label: "Qwen Image 2.0" },
  { pattern: /^(black forest labs )?flux[\s-]?2 (pro)/i,  modelId: "flux-2-pro",  label: "Flux 2 Pro" },
  { pattern: /^(black forest labs )?flux[\s-]?2 (flex|dev)/i, modelId: "flux-2-flex", label: "Flux 2 Flex" },
  { pattern: /^seedream[\s-]?3/i,                modelId: "seedream-3",      label: "Seedream 3.0" },
  { pattern: /^seedream[\s-]?4\.5|seedream[\s-]?4-5/i, modelId: "seedream-4-5", label: "Seedream 4.5" },
  { pattern: /^seedream[\s-]?4\b/i,              modelId: "seedream-4",      label: "Seedream 4.0" },
  { pattern: /^seedream[\s-]?5[\s-]?lite/i,      modelId: "seedream-5-lite", label: "Seedream 5.0 Lite" },
  { pattern: /^nano[\s-]?banana[\s-]?pro/i,      modelId: "nano-banana-pro", label: "Nano Banana Pro" },
  { pattern: /^nano[\s-]?banana[\s-]?2/i,        modelId: "nano-banana-2",   label: "Nano Banana 2" },
  { pattern: /^nano[\s-]?banana\b/i,             modelId: "nano-banana",     label: "Nano Banana (Gemini 2.5 Flash)" },
  { pattern: /^wan[\s-]?2[\s-.]?7 image pro/i,   modelId: "wan-2-7-pro",     label: "Wan 2.7 Pro" },
  { pattern: /^wan[\s-]?2[\s-.]?7 image\b/i,     modelId: "wan-2-7",         label: "Wan 2.7 Image" },
  { pattern: /^midjourney|^mj[\s-]?v?7/i,        modelId: "mj-v7",           label: "Midjourney v7" },
];

function resolveModelId(header: string): { modelId: string; label: string } | null {
  const cleaned = header.trim();
  for (const entry of KIE_HEADER_TO_MODEL_ID) {
    if (entry.pattern.test(cleaned)) return { modelId: entry.modelId, label: entry.label };
  }
  return null;
}

// Detect quality (1k/2k/4k) from a row label like
// "gpt image 2, text-to-image, 4k" or "Black Forest Labs flux-2 pro, text-to-image, 1.0s-2K"
function detectQuality(rowLabel: string): "1K" | "2K" | "4K" | null {
  const m = rowLabel.match(/(?<![a-z])(1|2|4)\s*k\b/i);
  if (!m) return null;
  return (m[1] + "K") as "1K" | "2K" | "4K";
}

// Detect modality token of a row (text-to-image / image-to-image / videoedit / r2v ...)
function isImageRow(rowLabel: string): boolean {
  const lower = rowLabel.toLowerCase();
  // Pure image generation rows
  if (/(text-to-image|image-to-image|t2i|i2i)/.test(lower)) return true;
  // Single-modality image models (no explicit subtype) — "wan 2.7 image"
  if (/\bimage\b/.test(lower) && !/\bvideo\b/.test(lower)) return true;
  return false;
}

// Parse the markdown returned by Firecrawl into a list of price rows for
// image-generation models. Each section starts with "### <model header>" and
// contains a Markdown table.
interface ParsedRow {
  modelId: string;
  modelLabel: string;
  quality: "1K" | "2K" | "4K";
  priceUsd: number;
  unit: string;
  kieSlug: string | null;
}

function parseMarkdown(md: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  // Split sections on "### "
  const sections = md.split(/\n###\s+/).slice(1);
  for (const section of sections) {
    const headerLine = section.split("\n", 1)[0]?.trim() ?? "";
    const resolved = resolveModelId(headerLine);
    if (!resolved) continue;

    // Each table row of interest looks like:
    //  | [<rowLabel>](https://kie.ai/<slug>?...) | <credits>per <unit> | $<price> | $<fal> | <discount> |
    const lineRegex = /\|\s*\[([^\]]+)\]\((https:\/\/kie\.ai\/[^)]+)\)\s*\|[^|]*per\s+([a-z]+)\s*\|\s*\$([\d.]+)\s*\|/gi;
    let m: RegExpExecArray | null;
    while ((m = lineRegex.exec(section)) !== null) {
      const [, rowLabel, link, unitWord, priceStr] = m;
      if (!isImageRow(rowLabel)) continue;
      const quality = detectQuality(rowLabel);
      if (!quality) continue;
      const price = Number.parseFloat(priceStr);
      if (!Number.isFinite(price) || price <= 0) continue;
      // Extract slug from kie.ai/<slug>(?...)
      const slugMatch = link.match(/^https:\/\/kie\.ai\/([^?#]+)/);
      rows.push({
        modelId: resolved.modelId,
        modelLabel: resolved.label,
        quality,
        priceUsd: price,
        unit: `per ${unitWord}`,
        kieSlug: slugMatch ? slugMatch[1] : null,
      });
    }
  }
  // Deduplicate (model_id, quality) — keep the lowest price (text-to-image
  // and image-to-image often share the same headline price).
  const map = new Map<string, ParsedRow>();
  for (const r of rows) {
    const key = `${r.modelId}__${r.quality}`;
    const prev = map.get(key);
    if (!prev || r.priceUsd < prev.priceUsd) map.set(key, r);
  }
  return [...map.values()];
}

// Call Firecrawl to scrape one paginated view of the Image tab.
// `pageOffset` is how many times we click the "next page button" before scraping.
async function scrapeImagePage(apiKey: string, pageOffset: number): Promise<string> {
  const actions: Array<Record<string, unknown>> = [
    { type: "wait", milliseconds: 5000 },
    {
      type: "executeJavascript",
      script:
        'const btns=[...document.querySelectorAll("button")]; const img=btns.find(b=>/^\\s*Image\\s*\\d/.test(b.textContent.trim())); if(img) img.click();',
    },
    { type: "wait", milliseconds: 1500 },
  ];
  for (let i = 0; i < pageOffset; i++) {
    actions.push({
      type: "executeJavascript",
      script:
        'const n=document.querySelector(\'button[aria-label="next page button"]\'); if(n && !n.disabled) n.click();',
    });
    actions.push({ type: "wait", milliseconds: 1200 });
  }
  actions.push({ type: "wait", milliseconds: 1000 });
  actions.push({ type: "scrape" });

  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: KIE_PRICING_URL,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 5000,
      actions,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(
      `Firecrawl scrape failed [${res.status}] page=${pageOffset}: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }
  return (data?.data?.markdown ?? "") as string;
}

function extractRangeMarker(md: string): { start: number; end: number; total: number } | null {
  const m = md.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/);
  if (!m) return null;
  return { start: +m[1], end: +m[2], total: +m[3] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!FIRECRAWL_API_KEY) {
    return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase service env vars missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const allRows: ParsedRow[] = [];
    const pages: Array<{ page: number; sections: number; rows: number; range: string | null }> = [];
    let total: number | null = null;
    let lastEnd = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const md = await scrapeImagePage(FIRECRAWL_API_KEY, page);
      const range = extractRangeMarker(md);
      if (range) total = range.total;
      const parsed = parseMarkdown(md);
      const sections = (md.match(/\n###\s+/g) ?? []).length;
      pages.push({
        page,
        sections,
        rows: parsed.length,
        range: range ? `${range.start}-${range.end} of ${range.total}` : null,
      });
      allRows.push(...parsed);

      // Stop early if we've covered the full list
      if (range) {
        if (range.end <= lastEnd) break; // pagination did not advance
        lastEnd = range.end;
        if (range.end >= range.total) break;
      }
    }

    // Final dedupe across pages
    const merged = new Map<string, ParsedRow>();
    for (const r of allRows) {
      const key = `${r.modelId}__${r.quality}`;
      const prev = merged.get(key);
      if (!prev || r.priceUsd < prev.priceUsd) merged.set(key, r);
    }
    const finalRows = [...merged.values()];

    if (finalRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No pricing rows parsed from Firecrawl markdown",
          pages,
          total,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();
    const upsertPayload = finalRows.map((r) => ({
      model_id: r.modelId,
      model_label: r.modelLabel,
      quality: r.quality,
      price_usd: r.priceUsd,
      currency: "USD",
      modality: "image",
      unit: r.unit,
      kie_slug: r.kieSlug,
      is_active: true,
      last_synced_at: now,
      updated_at: now,
    }));

    const { error: upsertError, data: upserted } = await supabase
      .from("kie_pricing")
      .upsert(upsertPayload, { onConflict: "model_id,quality" })
      .select("id, model_id, quality, price_usd");

    if (upsertError) {
      return new Response(
        JSON.stringify({ success: false, error: upsertError.message, pages }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark stale rows (not seen in this sync) as inactive — only for image modality
    const seenKeys = finalRows.map((r) => `${r.modelId}|${r.quality}`);
    const { data: existing } = await supabase
      .from("kie_pricing")
      .select("id, model_id, quality")
      .eq("modality", "image");
    const stale = (existing ?? []).filter(
      (e) => !seenKeys.includes(`${e.model_id}|${e.quality}`),
    );
    let deactivated = 0;
    if (stale.length > 0) {
      const { error: deactErr } = await supabase
        .from("kie_pricing")
        .update({ is_active: false, updated_at: now })
        .in("id", stale.map((s) => s.id));
      if (!deactErr) deactivated = stale.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        upserted: upserted?.length ?? 0,
        deactivated,
        total_image_models_on_kie: total,
        pages,
        sample: upserted?.slice(0, 5) ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-kie-pricing] error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});