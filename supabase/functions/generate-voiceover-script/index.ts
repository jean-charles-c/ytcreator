import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Étape 14 — Génération du script voix off complet.
 *
 * Produit un script en un seul bloc, séparé par scène, avec le format :
 *   SCÈNE X — Titre de la scène
 *   <texte voix off>
 *
 *   SCÈNE X+1 — ...
 *
 * Source : scènes narratives (de préférence validées) du sommaire courant
 * du projet, en respectant la forme narrative et le pitch.
 */

const SCRIPT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_voiceover_script",
    description:
      "Retourne le script voix off final, scène par scène, prêt à être lu.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titre éditorial du script voix off.",
        },
        scenes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              scene_id: { type: "string", description: "Identifiant de la scène source." },
              scene_order: { type: "integer", description: "Numéro affiché de la scène." },
              title: { type: "string", description: "Titre de la scène." },
              voice_over_text: {
                type: "string",
                description:
                  "Texte voix off final pour cette scène, prêt à être lu — sans balise, sans didascalie.",
              },
            },
            required: ["scene_id", "scene_order", "title", "voice_over_text"],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "scenes"],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(formPrompt: string | null): string {
  return [
    "Tu es un scénariste documentaire. Tu rédiges le SCRIPT VOIX OFF FINAL d'un film, scène par scène.",
    "",
    "Règles strictes :",
    "1. Respecte la forme narrative fournie (structure, ton, rythme, pitch).",
    "2. Le texte doit être prêt à être enregistré : pas de balise [[...]], pas de didascalie, pas de notes de réalisation.",
    "3. Conserve l'ordre des scènes fourni.",
    "4. Chaque scène : un texte voix off cohérent, fluide, sans répétition, sans copier mot pour mot les sources analysées.",
    "5. Soigne les transitions narratives entre scènes (relances, accroches, contrastes), sans annoncer la suite.",
    "6. Ne change pas le sujet, l'angle, ni les personnages du pitch — n'invente pas de personnages absents.",
    "7. Respecte la typographie française.",
    "8. Réponds UNIQUEMENT via l'appel à submit_voiceover_script.",
    "",
    "Forme narrative à respecter :",
    formPrompt && formPrompt.trim().length > 0
      ? formPrompt.trim()
      : "(Forme non fournie — applique une structure documentaire classique : amorce, développement, pivot, résolution.)",
  ].join("\n");
}

function buildUserPrompt(payload: {
  outline: any | null;
  pitch: any | null;
  scenes: Array<{
    id: string;
    scene_order: number;
    title: string | null;
    summary: string | null;
    narrative_role: string | null;
    dominant_emotion: string | null;
    voice_over_text: string | null;
    transition_to_next: string | null;
    chapter_title?: string | null;
    chapter_order?: number | null;
  }>;
  instructions: string | null;
}): string {
  const { outline, pitch, scenes, instructions } = payload;
  const lines: string[] = [];
  if (outline?.title) lines.push(`Sommaire : ${outline.title}`);
  if (outline?.intention) lines.push(`Intention globale : ${outline.intention}`);
  if (pitch?.title) lines.push(`Pitch : ${pitch.title}`);
  if (pitch?.central_tension) lines.push(`Tension centrale : ${pitch.central_tension}`);
  if (pitch?.point_of_view) lines.push(`Point de vue : ${pitch.point_of_view}`);
  if (pitch?.dominant_emotion) lines.push(`Émotion dominante : ${pitch.dominant_emotion}`);
  if (pitch?.tone) lines.push(`Ton : ${pitch.tone}`);
  if (pitch?.target_audience) lines.push(`Audience visée : ${pitch.target_audience}`);
  lines.push("");
  lines.push(`Nombre de scènes : ${scenes.length}`);
  lines.push("");
  lines.push("Liste des scènes (à conserver dans cet ordre) :");
  scenes.forEach((s, i) => {
    lines.push("");
    lines.push(`--- SCÈNE ${i + 1} ---`);
    lines.push(`scene_id: ${s.id}`);
    if (s.chapter_title) lines.push(`Chapitre : #${s.chapter_order ?? "?"} ${s.chapter_title}`);
    lines.push(`Titre : ${s.title || "Sans titre"}`);
    if (s.narrative_role) lines.push(`Rôle narratif : ${s.narrative_role}`);
    if (s.dominant_emotion) lines.push(`Émotion : ${s.dominant_emotion}`);
    if (s.summary) lines.push(`Résumé : ${s.summary}`);
    if (s.voice_over_text) {
      lines.push("Brouillon de voix off (à raffiner sans copier intégralement) :");
      lines.push(s.voice_over_text);
    }
    if (s.transition_to_next) lines.push(`Transition vers la suivante : ${s.transition_to_next}`);
  });
  if (instructions && instructions.trim().length > 0) {
    lines.push("");
    lines.push("Consignes additionnelles utilisateur :");
    lines.push(instructions.trim());
  }
  lines.push("");
  lines.push(
    "Produis maintenant via submit_voiceover_script un script voix off final, scène par scène, prêt à être enregistré.",
  );
  return lines.join("\n");
}

function approxWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateDurationSeconds(words: number): number {
  // ~155 mots/min pour une voix off documentaire
  return Math.round((words / 155) * 60);
}

function formatScript(scenes: Array<{ scene_order: number; title: string; voice_over_text: string }>): string {
  return scenes
    .map((s) => `SCÈNE ${s.scene_order} — ${s.title}\n${s.voice_over_text.trim()}`)
    .join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const supaUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userRes } = await supaUser.auth.getUser(token);
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const projectId: string | null = body?.project_id ?? null;
    const overwrite: boolean = body?.overwrite === true;
    const validatedOnly: boolean = body?.validated_only === true;
    const instructions: string | null =
      typeof body?.instructions === "string" && body.instructions.trim() ? body.instructions : null;

    if (!projectId) {
      return new Response(JSON.stringify({ ok: false, error: "project_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project, error: projectErr } = await supaAdmin
      .from("projects")
      .select("id, user_id, title")
      .eq("id", projectId)
      .maybeSingle();
    if (projectErr) throw projectErr;
    if (!project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ ok: false, error: "Projet introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: outline } = await supaAdmin
      .from("narrative_outlines")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!outline) {
      return new Response(
        JSON.stringify({ ok: false, error: "Aucun sommaire disponible pour ce projet." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Vérifier l'existence d'un script précédent
    const { data: existingScripts } = await supaAdmin
      .from("voiceover_scripts")
      .select("id, generation_index")
      .eq("project_id", projectId)
      .eq("outline_id", outline.id)
      .order("generation_index", { ascending: false })
      .limit(1);
    const existing = existingScripts?.[0] ?? null;
    if (existing && !overwrite) {
      return new Response(
        JSON.stringify({ ok: false, error: "script_exists" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let formPrompt: string | null = null;
    if (outline.form_id) {
      const { data: f } = await supaAdmin
        .from("narrative_forms")
        .select("system_prompt")
        .eq("id", outline.form_id)
        .maybeSingle();
      formPrompt = f?.system_prompt ?? null;
    }

    let pitch: any | null = null;
    if (outline.pitch_id) {
      const { data: p } = await supaAdmin
        .from("story_pitches")
        .select("*")
        .eq("id", outline.pitch_id)
        .maybeSingle();
      pitch = p ?? null;
    }

    // Récupérer les chapitres pour pouvoir associer un titre
    const { data: chaptersData } = await supaAdmin
      .from("narrative_chapters")
      .select("id, title, chapter_order")
      .eq("outline_id", outline.id)
      .order("chapter_order", { ascending: true });
    const chaptersMap = new Map<string, { title: string; order: number }>();
    (chaptersData ?? []).forEach((c: any) =>
      chaptersMap.set(c.id, { title: c.title, order: c.chapter_order }),
    );

    // Récupérer toutes les scènes (validated_only optionnel)
    let scenesQuery = supaAdmin
      .from("narrative_scenes")
      .select("*")
      .eq("project_id", projectId)
      .eq("outline_id", outline.id)
      .order("scene_order", { ascending: true });
    if (validatedOnly) scenesQuery = scenesQuery.eq("validated", true);
    const { data: scenesRaw } = await scenesQuery;
    const scenesArr = (scenesRaw ?? []) as any[];

    if (scenesArr.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: validatedOnly
            ? "Aucune scène validée disponible. Valide des scènes ou désactive le filtre."
            : "Aucune scène disponible. Génère d'abord les scènes.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Trier par chapitre puis par scene_order pour respecter la lecture narrative
    scenesArr.sort((a, b) => {
      const ca = chaptersMap.get(a.chapter_id)?.order ?? 999;
      const cb = chaptersMap.get(b.chapter_id)?.order ?? 999;
      if (ca !== cb) return ca - cb;
      return (a.scene_order ?? 0) - (b.scene_order ?? 0);
    });

    const scenesPayload = scenesArr.map((s, idx) => {
      const ch = chaptersMap.get(s.chapter_id);
      return {
        id: s.id,
        scene_order: idx + 1, // numérotation globale 1..N
        title: s.title,
        summary: s.summary,
        narrative_role: s.narrative_role,
        dominant_emotion: s.dominant_emotion,
        voice_over_text: s.voice_over_text,
        transition_to_next: s.transition_to_next,
        chapter_title: ch?.title ?? null,
        chapter_order: ch?.order ?? null,
      };
    });

    const model = "google/gemini-2.5-pro";
    const systemPrompt = buildSystemPrompt(formPrompt);
    const userPrompt = buildUserPrompt({
      outline,
      pitch,
      scenes: scenesPayload,
      instructions,
    });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [SCRIPT_TOOL],
        tool_choice: { type: "function", function: { name: "submit_voiceover_script" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ ok: false, error: "Trop de requêtes IA, réessaie dans un instant." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Crédits IA épuisés. Ajoute des crédits dans Settings > Workspace > Usage.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI gateway error ${aiRes.status} ${txt}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "submit_voiceover_script") {
      throw new Error("Réponse IA invalide (tool call manquant)");
    }
    const args = JSON.parse(toolCall.function.arguments || "{}");
    const aiTitle: string = args?.title || `Script voix off — ${project.title}`;
    const aiScenes: any[] = Array.isArray(args?.scenes) ? args.scenes : [];
    if (aiScenes.length === 0) {
      throw new Error("Aucune scène retournée par l'IA");
    }

    // Réordonner et nettoyer les scènes selon le payload de référence
    const orderMap = new Map<string, number>();
    scenesPayload.forEach((s) => orderMap.set(s.id, s.scene_order));
    const titleMap = new Map<string, string>();
    scenesPayload.forEach((s) => titleMap.set(s.id, s.title || "Sans titre"));

    const finalScenes = aiScenes
      .map((s) => {
        const order = orderMap.get(String(s.scene_id)) ?? Number(s.scene_order) ?? 0;
        const title = titleMap.get(String(s.scene_id)) || s.title || "Sans titre";
        const text = String(s.voice_over_text || "").trim();
        return { scene_order: order, title, voice_over_text: text };
      })
      .filter((s) => s.voice_over_text.length > 0)
      .sort((a, b) => a.scene_order - b.scene_order);

    if (finalScenes.length === 0) {
      throw new Error("Aucune scène exploitable retournée par l'IA");
    }

    const formatted = formatScript(finalScenes);
    const wordCount = approxWordCount(formatted);
    const duration = estimateDurationSeconds(wordCount);

    // Si overwrite, on supprime l'ancien script (un seul script par outline pour rester simple)
    if (existing && overwrite) {
      await supaAdmin.from("voiceover_scripts").delete().eq("id", existing.id);
    }

    const generationIndex = (existing?.generation_index ?? 0) + 1;

    const { data: inserted, error: insertErr } = await supaAdmin
      .from("voiceover_scripts")
      .insert({
        user_id: user.id,
        project_id: projectId,
        outline_id: outline.id,
        pitch_id: outline.pitch_id ?? null,
        form_id: outline.form_id ?? null,
        ai_model: model,
        title: aiTitle,
        content: formatted,
        word_count: wordCount,
        estimated_duration_seconds: duration,
        generation_index: generationIndex,
        status: "script_created",
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    // Met à jour le statut du projet généré
    await supaAdmin
      .from("generated_projects")
      .update({ status: "script_created", updated_at: new Date().toISOString() })
      .eq("project_id", projectId);

    return new Response(
      JSON.stringify({
        ok: true,
        script: inserted,
        scenes_count: finalScenes.length,
        word_count: wordCount,
        duration_seconds: duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[generate-voiceover-script] error", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});