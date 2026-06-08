// Auto-import des visuels de référence depuis recurring_object_library.
// Pour chaque entité demandée (nom + type + epoque), retourne la meilleure
// correspondance avec un score de compatibilité d'époque (0/60/100).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import {
  normalizeName,
  scoreEpochCompatibility,
  type EpochScore,
} from "../_shared/epoch-match.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RequestEntity = {
  nom: string;
  type: string;
  epoque?: string | null;
};

type LibraryRow = {
  nom: string;
  type: string;
  epoque: string | null;
  description_visuelle: string | null;
  identity_prompt: string | null;
  reference_images: string[] | null;
  source_project_id: string | null;
  updated_at: string;
};

type MatchResult = {
  nom: string;
  type: string;
  epoque_request: string;
  score: EpochScore;
  library_entry: {
    nom: string;
    epoque: string;
    description_visuelle: string;
    identity_prompt: string;
    reference_images: string[];
    source_project_id: string | null;
  } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    const entities: RequestEntity[] = Array.isArray(body?.entities) ? body.entities : [];
    if (entities.length === 0) {
      return json({ matches: [] satisfies MatchResult[] }, 200);
    }

    // On charge en une requête toutes les lignes de l'utilisateur dont le
    // type correspond à au moins une entité demandée et dont
    // `reference_images` n'est pas vide. Le filtrage fin par nom se fait
    // ensuite côté JS pour bénéficier de la normalisation accents/casse.
    const types = Array.from(new Set(entities.map((e) => e.type).filter(Boolean)));
    const { data: libRows, error: libErr } = await supabase
      .from("recurring_object_library")
      .select(
        "nom, type, epoque, description_visuelle, identity_prompt, reference_images, source_project_id, updated_at",
      )
      .in("type", types)
      .order("updated_at", { ascending: false });
    if (libErr) {
      console.error("library fetch error", libErr);
      return json({ error: "Library fetch failed" }, 500);
    }

    const rows = (libRows || []) as LibraryRow[];

    // Index par (type, normalizedName) pour lookup rapide.
    const indexed = new Map<string, LibraryRow[]>();
    for (const r of rows) {
      const refs = Array.isArray(r.reference_images) ? r.reference_images : [];
      if (refs.length === 0) continue;
      const k = `${r.type}::${normalizeName(r.nom)}`;
      const arr = indexed.get(k) ?? [];
      arr.push(r);
      indexed.set(k, arr);
    }

    const matches: MatchResult[] = entities.map((e) => {
      const k = `${e.type}::${normalizeName(e.nom)}`;
      const candidates = indexed.get(k) ?? [];
      const base: MatchResult = {
        nom: e.nom,
        type: e.type,
        epoque_request: e.epoque ?? "",
        score: 0,
        library_entry: null,
      };
      if (candidates.length === 0) return base;

      // Choix du meilleur candidat (score le plus haut, puis plus récent).
      let best: { row: LibraryRow; score: EpochScore } | null = null;
      for (const row of candidates) {
        const s = scoreEpochCompatibility(e.epoque, row.epoque);
        if (!best || s > best.score) best = { row, score: s };
        if (best.score === 100) break;
      }
      if (!best) return base;

      return {
        ...base,
        score: best.score,
        library_entry: {
          nom: best.row.nom,
          epoque: best.row.epoque ?? "",
          description_visuelle: best.row.description_visuelle ?? "",
          identity_prompt: best.row.identity_prompt ?? "",
          reference_images: Array.isArray(best.row.reference_images)
            ? best.row.reference_images
            : [],
          source_project_id: best.row.source_project_id,
        },
      };
    });

    return json({ matches }, 200);
  } catch (e) {
    console.error("auto-import-library-refs error", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}