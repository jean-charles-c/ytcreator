import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Scans every project of the calling user, finds all recurring objects
 * (in project_scriptcreator_state.global_context.objets_recurrents) that
 * have at least one reference image, and upserts them into
 * recurring_object_library so they survive re-segmentation and can be
 * re-imported into other projects.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Resolve the calling user from the JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Get all projects of this user.
    const { data: projects, error: projErr } = await admin
      .from("projects")
      .select("id, title")
      .eq("user_id", userId);
    if (projErr) throw projErr;
    if (!projects || projects.length === 0) {
      return new Response(JSON.stringify({ scanned: 0, saved: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const projectIds = projects.map((p) => p.id);
    const { data: states, error: statesErr } = await admin
      .from("project_scriptcreator_state")
      .select("project_id, global_context")
      .in("project_id", projectIds);
    if (statesErr) throw statesErr;

    type Row = {
      user_id: string;
      nom: string;
      type: string;
      description_visuelle: string;
      epoque: string;
      identity_prompt: string;
      reference_images: unknown;
      source_project_id: string;
    };

    // Dedupe by (nom + type), keeping the most reference images.
    const dedup = new Map<string, Row>();
    let totalCandidates = 0;

    for (const state of states || []) {
      const gc: any = state.global_context;
      const objs: any[] =
        (gc?.objets_recurrents || gc?.recurring_objects) ?? [];
      if (!Array.isArray(objs)) continue;
      for (const o of objs) {
        const refs = Array.isArray(o?.reference_images) ? o.reference_images : [];
        const nom = String(o?.nom || "").trim();
        if (!nom || refs.length === 0) continue;
        totalCandidates += 1;
        const type = String(o?.type || "object");
        const key = `${nom.toLowerCase()}::${type}`;
        const row: Row = {
          user_id: userId,
          nom,
          type,
          description_visuelle: String(o?.description_visuelle || ""),
          epoque: String(o?.epoque || ""),
          identity_prompt: String(o?.identity_prompt || ""),
          reference_images: refs,
          source_project_id: state.project_id,
        };
        const existing = dedup.get(key);
        if (!existing || refs.length > (existing.reference_images as any[]).length) {
          dedup.set(key, row);
        }
      }
    }

    const rows = Array.from(dedup.values());
    if (rows.length === 0) {
      return new Response(JSON.stringify({
        scanned: projects.length, candidates: totalCandidates, saved: 0, skipped: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: upsertErr } = await admin
      .from("recurring_object_library")
      .upsert(rows, { onConflict: "user_id,nom,type" });
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({
      scanned: projects.length,
      candidates: totalCandidates,
      saved: rows.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("backfill-recurring-library error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});