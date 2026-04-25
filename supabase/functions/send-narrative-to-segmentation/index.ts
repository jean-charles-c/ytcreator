// Step 16 — Send narrative scenes to legacy Segmentation View
// - Reads narrative_scenes for the current outline of the project.
// - Maps them onto the legacy `scenes` table consumed by Segmentation View
//   (preserving order, voice-over, characters, locations, objects, context).
// - Updates projects.narration with the recomposed voice-over so that
//   the existing `analyze-context` recurrence engine can run on it.
// - Marks the matching generated_projects row as `sent_to_segmentation`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendBody {
  project_id: string;
  outline_id?: string | null;
  validated_only?: boolean;
  overwrite?: boolean;
  trigger_context_analysis?: boolean;
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "")).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Resolve caller (RLS context for ownership check).
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as SendBody;
    if (!body?.project_id) {
      return new Response(JSON.stringify({ error: "project_id manquant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const projectId = body.project_id;
    const validatedOnly = body.validated_only === true;
    const overwrite = body.overwrite === true;
    const triggerAnalysis = body.trigger_context_analysis !== false; // default true

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Confirm project ownership.
    const { data: project, error: projErr } = await sb
      .from("projects")
      .select("id, user_id, title, subject")
      .eq("id", projectId)
      .single();
    if (projErr || !project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Projet introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve outline (latest if not provided).
    let outlineId = body.outline_id ?? null;
    if (!outlineId) {
      const { data: outline } = await sb
        .from("narrative_outlines")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      outlineId = outline?.id ?? null;
    }
    if (!outlineId) {
      return new Response(JSON.stringify({ error: "Aucun sommaire trouvé pour ce projet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load chapters (for context label) and scenes.
    const [{ data: chapters }, { data: scenesRaw }] = await Promise.all([
      sb
        .from("narrative_chapters")
        .select("id, chapter_order, title, intention, structural_role")
        .eq("outline_id", outlineId)
        .order("chapter_order", { ascending: true }),
      sb
        .from("narrative_scenes")
        .select("*")
        .eq("project_id", projectId)
        .eq("outline_id", outlineId)
        .order("scene_order", { ascending: true }),
    ]);

    const allScenes = (scenesRaw ?? []) as any[];
    if (allScenes.length === 0) {
      return new Response(JSON.stringify({ error: "scenes_created = false : aucune scène à transférer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceScenes = validatedOnly ? allScenes.filter((s) => s.validated) : allScenes;
    if (sourceScenes.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune scène validée à transférer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incompleteScenes = sourceScenes.filter(
      (s) => !((s.voice_over_text ?? s.content ?? "").trim()),
    );
    const incompleteWarning = incompleteScenes.length > 0
      ? `${incompleteScenes.length} scène(s) sans voix off — transfert tout de même effectué.`
      : null;

    // Check existing legacy scenes — return signal for confirmation in UI.
    const { data: existingLegacy } = await sb
      .from("scenes")
      .select("id")
      .eq("project_id", projectId);
    const hasExisting = (existingLegacy?.length ?? 0) > 0;
    if (hasExisting && !overwrite) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "scenes_exist",
          existing_count: existingLegacy?.length ?? 0,
          incoming_count: sourceScenes.length,
          incomplete_count: incompleteScenes.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If overwriting, wipe shots + scenes (consistent with Editor "restore" flow).
    if (hasExisting) {
      const { error: delShots } = await sb.from("shots").delete().eq("project_id", projectId);
      if (delShots) {
        return new Response(JSON.stringify({ error: `Suppression shots : ${delShots.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: delScenes } = await sb.from("scenes").delete().eq("project_id", projectId);
      if (delScenes) {
        return new Response(JSON.stringify({ error: `Suppression scènes : ${delScenes.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build chapter lookup.
    const chapterById = new Map<string, any>();
    for (const c of chapters ?? []) chapterById.set((c as any).id, c);

    // Map narrative_scenes → scenes rows.
    const rows = sourceScenes.map((s, idx) => {
      const chapter = chapterById.get(s.chapter_id);
      const characters = asArray(s.characters);
      const locations = asArray(s.locations);
      const objects = asArray(s.objects);
      const voTextFr = (s.voice_over_text ?? s.content ?? "").trim();
      const summary = (s.summary ?? "").trim();
      const role = (s.narrative_role ?? "").trim();
      const emotion = (s.dominant_emotion ?? "").trim();
      const transition = (s.transition_to_next ?? "").trim();
      const ctxBlock = (s.scene_context as any)?.context ?? "";

      const sceneContext = {
        contexte_scene: [
          chapter?.title ? `Chapitre ${chapter.chapter_order} — ${chapter.title}` : null,
          chapter?.intention ? `Intention chapitre : ${chapter.intention}` : null,
          ctxBlock || null,
          summary ? `Résumé : ${summary}` : null,
          transition ? `Transition : ${transition}` : null,
        ].filter(Boolean).join("\n"),
        sujet: project.subject ?? project.title ?? "",
        lieu: locations.join(", "),
        epoque: "",
        personnages: characters.join(", "),
        coherence_globale: role
          ? `Rôle narratif : ${role}${emotion ? ` · Émotion : ${emotion}` : ""}`
          : (emotion ? `Émotion : ${emotion}` : ""),
        lieux_ordonnes: locations,
        epoques_ordonnees: [],
        // Extra non-standard fields kept for traceability.
        objets_associes: objects,
        chapter_order: chapter?.chapter_order ?? null,
        chapter_id_source: s.chapter_id,
        narrative_scene_id_source: s.id,
      } as Record<string, unknown>;

      return {
        project_id: projectId,
        scene_order: idx + 1,
        title: s.title || `Scène ${idx + 1}`,
        source_text: voTextFr, // legacy field — used by storyboard pipeline
        source_text_fr: voTextFr,
        visual_intention: emotion || null,
        narrative_action: role || null,
        characters: characters.join(", "),
        location: locations.join(", "),
        scene_type: null,
        continuity: null,
        scene_context: sceneContext as any,
        validated: Boolean(s.validated),
      };
    });

    const { data: inserted, error: insErr } = await sb
      .from("scenes")
      .insert(rows)
      .select("id, scene_order");
    if (insErr) {
      return new Response(JSON.stringify({ error: `Insertion scènes : ${insErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update project narration with the recomposed voice-over (used by analyze-context + ScriptCreator parity).
    const recomposed = rows
      .map((r) => `SCÈNE ${r.scene_order} — ${r.title}\n${r.source_text_fr}`)
      .join("\n\n");
    await sb
      .from("projects")
      .update({
        narration: recomposed,
        scene_count: rows.length,
        status: "segmented",
      })
      .eq("id", projectId);

    // Mark generated_project as sent_to_segmentation (if any).
    await sb
      .from("generated_projects")
      .update({ status: "sent_to_segmentation", updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("user_id", user.id);

    // Mark voiceover_scripts.sent_to_segmentation_at if a script exists for this outline.
    await sb
      .from("voiceover_scripts")
      .update({ sent_to_segmentation_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("outline_id", outlineId);

    // Optionally trigger context analysis (non-blocking via direct invoke).
    let contextTriggered = false;
    if (triggerAnalysis) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/analyze-context`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
          },
          body: JSON.stringify({ project_id: projectId }),
        });
        contextTriggered = true;
      } catch (e) {
        console.warn("[send-narrative-to-segmentation] analyze-context failed", e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scenes_inserted: inserted?.length ?? 0,
        replaced: hasExisting,
        context_analysis_triggered: contextTriggered,
        warning: incompleteWarning,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-narrative-to-segmentation] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
