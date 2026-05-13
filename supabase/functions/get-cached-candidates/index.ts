// get-cached-candidates
// Batch read-only endpoint that returns cached image_search results for a
// list of objects (matched by SHA-256(nom|epoque|description)).
// Used by ObjectRegistryPanel on mount to repopulate the "Voir candidats"
// dialog without re-running the whole search pipeline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface ObjectInput {
  nom?: string;
  epoque?: string;
  description?: string;
}

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

  let body: { objects?: ObjectInput[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const inputs = Array.isArray(body?.objects) ? body.objects : [];
  if (inputs.length === 0) {
    return new Response(JSON.stringify({ results: [] }), { headers: jsonHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Supabase service credentials missing" }),
      { status: 500, headers: jsonHeaders },
    );
  }

  // Compute hash for each input
  const hashes = await Promise.all(
    inputs.map((o) => sha256Hex(`${o.nom || ""}|${o.epoque || ""}|${o.description || ""}`)),
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("image_search_cache")
    .select("query_hash, validated_images, source_breakdown, enriched_query")
    .in("query_hash", hashes)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.warn("get-cached-candidates: query error", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: jsonHeaders },
    );
  }

  // Index rows by hash
  const byHash: Record<string, { candidates: any[]; source_breakdown: any; enriched_query: any }> = {};
  for (const row of data || []) {
    byHash[row.query_hash] = {
      candidates: Array.isArray(row.validated_images) ? row.validated_images : [],
      source_breakdown: row.source_breakdown ?? null,
      enriched_query: row.enriched_query ?? null,
    };
  }

  // Build results in input order
  const results = hashes.map((h) => byHash[h] || { candidates: [], source_breakdown: null, enriched_query: null });

  return new Response(JSON.stringify({ results }), { headers: jsonHeaders });
});
