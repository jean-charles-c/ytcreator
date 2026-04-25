// Edge function: fetch-youtube-transcript
//
// Étape 6 du Narrative Form Generator — récupération best-effort de la
// transcription d'une vidéo YouTube côté serveur.
//
// Stratégie (sans API key, ne sera jamais 100% fiable côté serveur) :
//   1. Télécharger la page `youtube.com/watch?v=...` avec un User-Agent
//      navigateur pour récupérer `ytInitialPlayerResponse`.
//   2. Extraire la liste des `captionTracks` ; choisir d'abord la piste
//      dans la langue demandée, sinon la première non auto-générée,
//      sinon la première disponible.
//   3. Télécharger l'XML `timedtext` (format=srv1) et le convertir en
//      texte brut.
//
// L'appelant doit toujours prévoir un fallback manuel : YouTube bloque
// régulièrement ces requêtes côté datacenter. En cas d'échec on renvoie
// `{ ok: false, reason }` avec un statut HTTP 200 pour faciliter le
// fallback côté client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

function extractVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Direct ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      // /shorts/<id> or /embed/<id>
      const m = u.pathname.match(/\/(shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* ignore */
  }
  return null;
}

type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function timedTextToPlain(xml: string): string {
  // Match <text ...>...</text> blocks (srv1 format)
  const out: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const inner = m[1].replace(/\s+/g, " ").trim();
    if (inner) out.push(decodeXmlEntities(inner));
  }
  return out.join(" ").replace(/\s{2,}/g, " ").trim();
}

function pickTrack(
  tracks: CaptionTrack[],
  preferredLang: string,
): CaptionTrack | null {
  if (!tracks.length) return null;
  // Priorité : langue demandée non auto > langue demandée auto > première non auto > première
  const isAuto = (t: CaptionTrack) => t.kind === "asr";
  const lang = preferredLang.toLowerCase();
  const matchLang = (t: CaptionTrack) =>
    (t.languageCode ?? "").toLowerCase().startsWith(lang);

  return (
    tracks.find((t) => matchLang(t) && !isAuto(t)) ??
    tracks.find((t) => matchLang(t)) ??
    tracks.find((t) => !isAuto(t)) ??
    tracks[0]
  );
}

async function fetchWatchPage(videoId: string): Promise<string> {
  const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!r.ok) throw new Error(`watch_page_status_${r.status}`);
  return await r.text();
}

function extractCaptionTracks(html: string): CaptionTrack[] {
  // ytInitialPlayerResponse may be embedded as `var ytInitialPlayerResponse = {...};`
  // Find the captionTracks array directly, more resilient than parsing the full JSON.
  const m = html.match(/"captionTracks":(\[[^\]]+\])/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]);
    if (Array.isArray(arr)) return arr as CaptionTrack[];
  } catch {
    /* ignore */
  }
  return [];
}

async function fetchTranscript(
  videoId: string,
  preferredLang: string,
): Promise<{
  ok: boolean;
  transcript?: string;
  language?: string;
  reason?: string;
}> {
  let html: string;
  try {
    html = await fetchWatchPage(videoId);
  } catch (e) {
    return { ok: false, reason: `watch_fetch_failed:${(e as Error).message}` };
  }

  if (/consent\.youtube\.com/i.test(html) || /<title>Before you continue/i.test(html)) {
    return { ok: false, reason: "consent_wall" };
  }

  const tracks = extractCaptionTracks(html);
  if (!tracks.length) {
    return { ok: false, reason: "no_caption_tracks" };
  }

  const track = pickTrack(tracks, preferredLang);
  if (!track?.baseUrl) {
    return { ok: false, reason: "no_usable_track" };
  }

  // baseUrl is JSON-escaped (\u0026 → &)
  const baseUrl = track.baseUrl.replace(/\\u0026/g, "&");
  const url = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=srv1`;

  let xml: string;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!r.ok) return { ok: false, reason: `timedtext_status_${r.status}` };
    xml = await r.text();
  } catch (e) {
    return { ok: false, reason: `timedtext_fetch_failed:${(e as Error).message}` };
  }

  const text = timedTextToPlain(xml);
  if (!text || text.length < 50) {
    return { ok: false, reason: "transcript_too_short" };
  }
  return { ok: true, transcript: text, language: track.languageCode };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const url: string = body?.url ?? "";
    const language: string = (body?.language ?? "fr").toString().slice(0, 8);

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(
        JSON.stringify({ ok: false, reason: "invalid_url" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await fetchTranscript(videoId, language);
    return new Response(JSON.stringify({ ...result, videoId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-youtube-transcript error", e);
    return new Response(
      JSON.stringify({ ok: false, reason: "internal_error", message: (e as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});