import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OUTLINE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_narrative_outline",
    description:
      "Retourne le sommaire complet en chapitres détaillés respectant la forme narrative.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre éditorial du sommaire (court)." },
        intention: {
          type: "string",
          description:
            "Intention narrative globale du sommaire — la promesse faite au spectateur.",
        },
        target_duration_seconds: {
          type: "integer",
          description: "Durée cible totale en secondes pour la vidéo finale.",
        },
        chapters: {
          type: "array",
          minItems: 5,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              chapter_order: {
                type: "integer",
                description: "Numéro du chapitre, séquentiel à partir de 1.",
              },
              title: { type: "string", description: "Titre du chapitre, accrocheur et lisible." },
              summary: {
                type: "string",
                description:
                  "Résumé éditorial du chapitre en 2-4 phrases. Pas de copie de la source.",
              },
              intention: {
                type: "string",
                description:
                  "Intention narrative spécifique du chapitre : pourquoi ce chapitre existe, ce qu'il doit produire chez le spectateur.",
              },
              structural_role: {
                type: "string",
                description:
                  "Rôle dans la structure globale (ex. 'ouverture', 'mise en tension', 'révélation', 'climax', 'clôture'). Doit refléter la forme narrative.",
              },
              main_event: {
                type: "string",
                description: "L'événement ou bascule principale du chapitre.",
              },
              dramatic_tension: {
                type: "string",
                description: "Le ressort de tension dominant du chapitre.",
              },
              revelation: {
                type: "string",
                description:
                  "Révélation, surprise ou nouvelle information apportée (peut être vide pour les chapitres pivots).",
              },
              emotional_progression: {
                type: "string",
                description:
                  "Comment le ressenti du spectateur évolue au sein du chapitre (départ → arrivée).",
              },
              transition_to_next: {
                type: "string",
                description:
                  "Comment le chapitre prépare et enchaîne vers le suivant (cliffhanger, question ouverte, retournement…).",
              },
              estimated_duration_seconds: {
                type: "integer",
                description: "Durée estimée de ce chapitre (secondes).",
              },
            },
            required: [
              "chapter_order",
              "title",
              "summary",
              "intention",
              "structural_role",
              "main_event",
              "dramatic_tension",
              "emotional_progression",
              "transition_to_next",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "intention", "chapters"],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(formPrompt: string | null): string {
  return [
    "Tu es un scénariste documentaire expert. Ta mission est de produire un SOMMAIRE NARRATIF détaillé.",
    "",
    "Règles strictes :",
    "1. Le sommaire doit OBÉIR à la forme narrative fournie (structure, beats, ton, rythme, règles d'écriture, anti-patterns).",
    "2. Le sommaire doit développer le pitch sélectionné — ne change pas le sujet, l'angle ou la promesse.",
    "3. Chaque chapitre doit posséder une intention narrative claire et un rôle dans la structure globale (ouverture, mise en tension, complication, révélation, climax, clôture, etc.).",
    "4. Chaque chapitre doit indiquer son événement principal, sa tension dominante, sa révélation éventuelle, sa progression émotionnelle et la transition vers le suivant.",
    "5. Ne jamais reproduire de phrases ou d'exemples des sources d'origine.",
    "6. Ne génère pas encore de scènes, ni de scripts complets : reste au niveau du sommaire.",
    "7. Produis entre 5 et 12 chapitres selon la densité du sujet et la forme narrative.",
    "",
    "Forme narrative à respecter :",
    formPrompt && formPrompt.trim().length > 0
      ? formPrompt.trim()
      : "(Forme narrative non fournie — applique une structure documentaire classique en 3 actes avec hook, tension, révélations et clôture.)",
    "",
    "Réponds UNIQUEMENT via l'appel à la fonction submit_narrative_outline.",
  ].join("\n");
}

function buildUserPrompt(payload: {
  pitch: any | null;
  projectTitle: string | null;
  projectSubject: string | null;
  projectNarration: string | null;
}): string {
  const { pitch, projectTitle, projectSubject, projectNarration } = payload;
  const lines: string[] = [];
  if (projectTitle) lines.push(`Projet : ${projectTitle}`);
  if (projectSubject) lines.push(`Sujet : ${projectSubject}`);
  if (projectNarration) {
    lines.push("");
    lines.push("Note d'intention projet :");
    lines.push(projectNarration);
  }
  if (pitch) {
    lines.push("");
    lines.push("Pitch sélectionné :");
    if (pitch.title) lines.push(`Titre : ${pitch.title}`);
    if (pitch.theme) lines.push(`Thème : ${pitch.theme}`);
    if (pitch.concept) lines.push(`Concept : ${pitch.concept}`);
    if (pitch.angle) lines.push(`Angle : ${pitch.angle}`);
    if (pitch.point_of_view) lines.push(`Point de vue : ${pitch.point_of_view}`);
    if (pitch.central_tension) lines.push(`Tension centrale : ${pitch.central_tension}`);
    if (pitch.narrative_promise) lines.push(`Promesse narrative : ${pitch.narrative_promise}`);
    if (pitch.progression) lines.push(`Progression suggérée : ${pitch.progression}`);
    if (Array.isArray(pitch.twists) && pitch.twists.length > 0) {
      lines.push(`Rebondissements possibles : ${pitch.twists.join(" | ")}`);
    }
    if (pitch.dominant_emotion) lines.push(`Émotion dominante : ${pitch.dominant_emotion}`);
    if (pitch.tone) lines.push(`Ton : ${pitch.tone}`);
    if (pitch.target_audience) lines.push(`Public cible : ${pitch.target_audience}`);
    if (pitch.estimated_format) lines.push(`Format estimé : ${pitch.estimated_format}`);
  }
  lines.push("");
  lines.push(
    "Génère maintenant le sommaire narratif détaillé via submit_narrative_outline.",
  );
  return lines.join("\n");
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
    const targetDuration: number | null =
      typeof body?.target_duration_seconds === "number"
        ? body.target_duration_seconds
        : null;

    if (!projectId) {
      return new Response(JSON.stringify({ ok: false, error: "project_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vérification ownership du projet
    const { data: project, error: projectErr } = await supaAdmin
      .from("projects")
      .select("id, user_id, title, subject, narration")
      .eq("id", projectId)
      .maybeSingle();
    if (projectErr) throw projectErr;
    if (!project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ ok: false, error: "Projet introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupération du lien generated_projects (peut ne pas exister pour un projet manuel)
    const { data: genRow } = await supaAdmin
      .from("generated_projects")
      .select("id, pitch_id, analysis_id, form_id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let pitch: any | null = null;
    if (genRow?.pitch_id) {
      const { data: p } = await supaAdmin
        .from("story_pitches")
        .select("*")
        .eq("id", genRow.pitch_id)
        .maybeSingle();
      pitch = p ?? null;
    }

    let formPrompt: string | null = null;
    if (genRow?.form_id) {
      const { data: f } = await supaAdmin
        .from("narrative_forms")
        .select("system_prompt, name")
        .eq("id", genRow.form_id)
        .maybeSingle();
      formPrompt = f?.system_prompt ?? null;
    }

    // Vérification d'un sommaire existant
    const { data: existing } = await supaAdmin
      .from("narrative_outlines")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && !overwrite) {
      return new Response(
        JSON.stringify({ ok: false, error: "outline_exists", outline_id: existing.id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = "google/gemini-2.5-pro";
    const systemPrompt = buildSystemPrompt(formPrompt);
    const userPrompt = buildUserPrompt({
      pitch,
      projectTitle: project.title ?? null,
      projectSubject: project.subject ?? null,
      projectNarration: project.narration ?? null,
    });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        tools: [OUTLINE_TOOL],
        tool_choice: { type: "function", function: { name: "submit_narrative_outline" } },
      }),
    });

    if (!aiResponse.ok) {
      const txt = await aiResponse.text();
      console.error("AI gateway error", aiResponse.status, txt);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ ok: false, error: "Trop de requêtes, réessayez." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ ok: false, error: "Crédits AI épuisés." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Réponse IA invalide (no tool call)");
    const args = JSON.parse(toolCall.function.arguments || "{}");

    const chapters: any[] = Array.isArray(args.chapters) ? args.chapters : [];
    if (chapters.length === 0) throw new Error("Aucun chapitre généré");

    // Si overwrite : supprimer l'ancien sommaire (et ses chapitres CASCADE manuelle)
    if (existing && overwrite) {
      await supaAdmin.from("narrative_chapters").delete().eq("outline_id", existing.id);
      await supaAdmin.from("narrative_outlines").delete().eq("id", existing.id);
    }

    const { data: outlineRow, error: outlineErr } = await supaAdmin
      .from("narrative_outlines")
      .insert({
        user_id: user.id,
        project_id: projectId,
        title: args.title ?? null,
        intention: args.intention ?? null,
        target_duration_seconds: targetDuration ?? args.target_duration_seconds ?? null,
        status: "outline_created",
        form_id: genRow?.form_id ?? null,
        pitch_id: genRow?.pitch_id ?? null,
        ai_model: model,
      })
      .select("id")
      .single();
    if (outlineErr) throw outlineErr;

    const insertChapters = chapters
      .map((c, i) => ({
        user_id: user.id,
        outline_id: outlineRow!.id,
        chapter_order: typeof c.chapter_order === "number" ? c.chapter_order : i + 1,
        title: String(c.title ?? `Chapitre ${i + 1}`),
        summary: c.summary ?? null,
        intention: c.intention ?? null,
        structural_role: c.structural_role ?? null,
        main_event: c.main_event ?? null,
        dramatic_tension: c.dramatic_tension ?? null,
        revelation: c.revelation ?? null,
        emotional_progression: c.emotional_progression ?? null,
        transition_to_next: c.transition_to_next ?? null,
        estimated_duration_seconds:
          typeof c.estimated_duration_seconds === "number" ? c.estimated_duration_seconds : null,
      }))
      .sort((a, b) => a.chapter_order - b.chapter_order)
      .map((c, i) => ({ ...c, chapter_order: i + 1 }));

    const { error: chErr } = await supaAdmin.from("narrative_chapters").insert(insertChapters);
    if (chErr) throw chErr;

    // Mise à jour du statut du generated_project si présent
    if (genRow?.id) {
      await supaAdmin
        .from("generated_projects")
        .update({ status: "outline_created" })
        .eq("id", genRow.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        outline_id: outlineRow!.id,
        chapter_count: insertChapters.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-narrative-outline error", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});