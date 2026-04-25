import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Étape 13 — Génère un nombre adapté de scènes par chapitre.
 * Modes :
 *   - mode="generate"  : génération initiale (refuse si scènes existent et !overwrite)
 *   - mode="extend"    : ajoute N scènes supplémentaires à un chapitre (pas d'écrasement)
 *   - mode="regenerate_chapter" : régénère toutes les scènes non validées d'un chapitre
 *   - mode="regenerate_scene"   : régénère une scène en particulier (variante stylistique)
 *
 * Variants stylistiques (variant) appliqués à un chapitre ou à une scène :
 *   "default" | "more" | "shorter" | "more_dramatic" | "more_rhythmic" | "more_detailed"
 */

const SCENES_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_scenes",
    description: "Retourne une liste de scènes structurées pour un chapitre.",
    parameters: {
      type: "object",
      properties: {
        scenes: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              scene_order: { type: "integer", description: "Ordre dans le chapitre, à partir de 1." },
              title: { type: "string", description: "Titre court et signifiant." },
              summary: { type: "string", description: "Résumé éditorial de la scène (1-3 phrases)." },
              narrative_role: {
                type: "string",
                description:
                  "Rôle dans le chapitre (ex. 'mise en place', 'révélation', 'pivot', 'climax', 'respiration', 'transition').",
              },
              dominant_emotion: {
                type: "string",
                description: "Émotion principale visée chez le spectateur.",
              },
              characters: {
                type: "array",
                items: { type: "string" },
                description: "Personnages présents (sans inventer de nouveaux personnages absents du pitch).",
              },
              locations: {
                type: "array",
                items: { type: "string" },
                description: "Lieux où se déroule la scène.",
              },
              objects: {
                type: "array",
                items: { type: "string" },
                description: "Objets clés visuellement importants.",
              },
              context: {
                type: "string",
                description: "Contexte narratif (situation, époque, enjeu de la scène).",
              },
              transition_to_next: {
                type: "string",
                description: "Comment la scène prépare la suivante.",
              },
              voice_over_text: {
                type: "string",
                description:
                  "Texte de voix off complet pour cette scène — orienté lecture orale, sans didascalie ni balise.",
              },
            },
            required: [
              "scene_order",
              "title",
              "summary",
              "narrative_role",
              "dominant_emotion",
              "voice_over_text",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["scenes"],
      additionalProperties: false,
    },
  },
};

function variantInstruction(variant: string): string {
  switch (variant) {
    case "shorter":
      return "Style : ramasse, plus dense, retire les redites. Réduis la durée de voix off d'environ 30 %.";
    case "more_dramatic":
      return "Style : amplifie la tension, le contraste, les enjeux émotionnels. Renforce les pivots dramatiques.";
    case "more_rhythmic":
      return "Style : phrasé court, rythmique, alternance scènes brèves/longues, accélère le tempo narratif.";
    case "more_detailed":
      return "Style : développe davantage le contexte, les personnages et les implications de chaque beat.";
    default:
      return "Style : équilibré, fidèle à la forme narrative et à l'intention du chapitre.";
  }
}

function recommendedSceneCount(chapter: any, variant: string, requested: number | null): {
  min: number;
  max: number;
  hint: string;
} {
  const role = String(chapter?.structural_role || "").toLowerCase();
  // Heuristique : durée estimée → nombre de scènes
  const dur =
    typeof chapter?.estimated_duration_seconds === "number"
      ? chapter.estimated_duration_seconds
      : null;
  let base = 3;
  if (dur) base = Math.max(2, Math.min(8, Math.round(dur / 45)));
  if (role.includes("ouverture") || role.includes("hook")) base = Math.max(2, base - 1);
  if (role.includes("climax") || role.includes("révél")) base = Math.min(8, base + 1);
  if (variant === "more_detailed") base = Math.min(10, base + 2);
  if (variant === "shorter") base = Math.max(2, base - 1);
  if (requested && requested > 0) {
    return { min: requested, max: requested, hint: `Génère exactement ${requested} scène(s).` };
  }
  const min = Math.max(2, base - 1);
  const max = Math.min(10, base + 1);
  return {
    min,
    max,
    hint: `Génère entre ${min} et ${max} scène(s) selon la densité, la tension et le rythme propres à ce chapitre.`,
  };
}

function buildSystemPrompt(formPrompt: string | null): string {
  return [
    "Tu es un scénariste documentaire expert. Tu produis le découpage SCÈNE PAR SCÈNE d'un chapitre.",
    "",
    "Règles strictes :",
    "1. Respecte la forme narrative fournie (structure, beats, ton, anti-patterns).",
    "2. Ne change pas le sujet, l'angle, ni les personnages du pitch — n'invente pas de personnages absents.",
    "3. Adapte le NOMBRE de scènes à la densité, à la tension et au rôle structurel du chapitre — pas un nombre fixe.",
    "4. Chaque scène doit avoir un rôle narratif clair, une émotion dominante, et progresser vers la fin du chapitre.",
    "5. Le texte de voix off (voice_over_text) doit être prêt à être lu : pas de balise, pas de didascalie, pas de [[TAGS]].",
    "6. Ne reproduis aucune phrase exacte d'une source d'origine.",
    "7. Réponds UNIQUEMENT via l'appel à submit_scenes.",
    "",
    "Forme narrative à respecter :",
    formPrompt && formPrompt.trim().length > 0
      ? formPrompt.trim()
      : "(Forme non fournie — applique une structure documentaire classique : amorce, développement, pivot, résolution.)",
  ].join("\n");
}

function buildUserPrompt(payload: {
  outline: any | null;
  chapter: any;
  pitch: any | null;
  variant: string;
  scenesRange: { min: number; max: number; hint: string };
  existingValidated: any[];
  existingNonValidated: any[];
  startOrder: number;
}): string {
  const {
    outline,
    chapter,
    pitch,
    variant,
    scenesRange,
    existingValidated,
    existingNonValidated,
    startOrder,
  } = payload;
  const lines: string[] = [];
  if (outline?.title) lines.push(`Sommaire : ${outline.title}`);
  if (outline?.intention) lines.push(`Intention globale : ${outline.intention}`);
  if (pitch?.title) lines.push(`Pitch : ${pitch.title}`);
  if (pitch?.central_tension) lines.push(`Tension centrale du pitch : ${pitch.central_tension}`);
  if (pitch?.point_of_view) lines.push(`Point de vue : ${pitch.point_of_view}`);
  if (pitch?.dominant_emotion) lines.push(`Émotion dominante du pitch : ${pitch.dominant_emotion}`);
  lines.push("");
  lines.push(`Chapitre #${chapter.chapter_order} — ${chapter.title}`);
  if (chapter.structural_role) lines.push(`Rôle structurel : ${chapter.structural_role}`);
  if (chapter.intention) lines.push(`Intention narrative : ${chapter.intention}`);
  if (chapter.summary) lines.push(`Résumé : ${chapter.summary}`);
  if (chapter.main_event) lines.push(`Événement principal : ${chapter.main_event}`);
  if (chapter.dramatic_tension) lines.push(`Tension : ${chapter.dramatic_tension}`);
  if (chapter.revelation) lines.push(`Révélation : ${chapter.revelation}`);
  if (chapter.emotional_progression)
    lines.push(`Progression émotionnelle : ${chapter.emotional_progression}`);
  if (chapter.transition_to_next)
    lines.push(`Transition vers le suivant : ${chapter.transition_to_next}`);
  lines.push("");
  lines.push(variantInstruction(variant));
  lines.push(scenesRange.hint);
  lines.push(`Numérote les scènes à partir de ${startOrder}.`);

  if (existingValidated.length > 0) {
    lines.push("");
    lines.push("Scènes déjà validées (NE PAS REPRODUIRE, mais assurer la continuité avec elles) :");
    existingValidated.forEach((s) => {
      lines.push(`- #${s.scene_order} ${s.title} — ${s.summary || ""}`);
    });
  }
  if (existingNonValidated.length > 0 && payload.variant !== "default") {
    lines.push("");
    lines.push("Scènes existantes à RAFRAÎCHIR :");
    existingNonValidated.forEach((s) => {
      lines.push(`- #${s.scene_order} ${s.title} — ${s.summary || ""}`);
    });
  }

  lines.push("");
  lines.push("Génère maintenant le découpage via submit_scenes.");
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
    const mode: string = String(body?.mode ?? "generate");
    const variant: string = String(body?.variant ?? "default");
    const overwrite: boolean = body?.overwrite === true;
    const targetChapterId: string | null = body?.chapter_id ?? null;
    const targetSceneId: string | null = body?.scene_id ?? null;
    const requestedCount: number | null =
      typeof body?.requested_count === "number" ? body.requested_count : null;

    if (!projectId) {
      return new Response(JSON.stringify({ ok: false, error: "project_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vérification ownership du projet
    const { data: project, error: projectErr } = await supaAdmin
      .from("projects")
      .select("id, user_id, title, subject")
      .eq("id", projectId)
      .maybeSingle();
    if (projectErr) throw projectErr;
    if (!project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ ok: false, error: "Projet introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupération du dernier sommaire
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

    // Forme narrative liée
    let formPrompt: string | null = null;
    if (outline.form_id) {
      const { data: f } = await supaAdmin
        .from("narrative_forms")
        .select("system_prompt")
        .eq("id", outline.form_id)
        .maybeSingle();
      formPrompt = f?.system_prompt ?? null;
    }

    // Pitch lié
    let pitch: any | null = null;
    if (outline.pitch_id) {
      const { data: p } = await supaAdmin
        .from("story_pitches")
        .select("*")
        .eq("id", outline.pitch_id)
        .maybeSingle();
      pitch = p ?? null;
    }

    // Liste de chapitres à traiter
    let chapters: any[] = [];
    if (mode === "regenerate_scene" && targetSceneId) {
      const { data: scn } = await supaAdmin
        .from("narrative_scenes")
        .select("*")
        .eq("id", targetSceneId)
        .maybeSingle();
      if (!scn || scn.user_id !== user.id) {
        return new Response(JSON.stringify({ ok: false, error: "Scène introuvable" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (scn.validated && !overwrite) {
        return new Response(
          JSON.stringify({ ok: false, error: "scene_validated", scene_id: scn.id }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: ch } = await supaAdmin
        .from("narrative_chapters")
        .select("*")
        .eq("id", scn.chapter_id)
        .maybeSingle();
      if (!ch) throw new Error("Chapitre introuvable pour la scène");
      chapters = [ch];
    } else if (targetChapterId) {
      const { data: ch } = await supaAdmin
        .from("narrative_chapters")
        .select("*")
        .eq("id", targetChapterId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!ch) {
        return new Response(JSON.stringify({ ok: false, error: "Chapitre introuvable" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      chapters = [ch];
    } else {
      const { data: chs } = await supaAdmin
        .from("narrative_chapters")
        .select("*")
        .eq("outline_id", outline.id)
        .order("chapter_order", { ascending: true });
      chapters = chs ?? [];
    }
    if (chapters.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Aucun chapitre disponible" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Anti-timeout : si aucun chapitre spécifique demandé et qu'on est en mode
    // batch ("generate"/"regenerate_chapter"), on traite UN seul chapitre par
    // appel et on renvoie la liste des chapitres restants au client pour qu'il
    // poursuive itérativement. Cela évite les 504 IDLE_TIMEOUT (150s) sur les
    // sommaires longs avec Gemini 2.5 Pro.
    let remainingChapterIds: string[] = [];
    if (
      !targetChapterId &&
      !targetSceneId &&
      (mode === "generate" || mode === "regenerate_chapter") &&
      chapters.length > 1
    ) {
      // Trouver le premier chapitre qui n'a pas encore de scènes (ou non validées si overwrite/regenerate)
      const chapterIds = chapters.map((c) => c.id);
      const { data: existingAll } = await supaAdmin
        .from("narrative_scenes")
        .select("chapter_id, validated")
        .in("chapter_id", chapterIds);
      const sceneCountByChapter = new Map<string, { total: number; validated: number }>();
      (existingAll ?? []).forEach((s: any) => {
        const cur = sceneCountByChapter.get(s.chapter_id) ?? { total: 0, validated: 0 };
        cur.total += 1;
        if (s.validated) cur.validated += 1;
        sceneCountByChapter.set(s.chapter_id, cur);
      });
      const isChapterPending = (cId: string) => {
        const c = sceneCountByChapter.get(cId);
        if (!c || c.total === 0) return true;
        if (mode === "generate" && overwrite && c.total - c.validated > 0) return true;
        if (mode === "regenerate_chapter" && c.total - c.validated > 0) return true;
        return false;
      };
      const pending = chapters.filter((c) => isChapterPending(c.id));
      if (pending.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, created: 0, deleted: 0, errors: [], remaining_chapter_ids: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const next = pending[0];
      remainingChapterIds = pending.slice(1).map((c) => c.id);
      chapters = [next];
    }

    const model = "google/gemini-2.5-pro";
    const systemPrompt = buildSystemPrompt(formPrompt);

    let totalCreated = 0;
    let totalDeleted = 0;
    const errors: string[] = [];

    for (const chapter of chapters) {
      try {
        // Scènes existantes
        const { data: existing } = await supaAdmin
          .from("narrative_scenes")
          .select("id, scene_order, title, summary, validated")
          .eq("chapter_id", chapter.id)
          .order("scene_order", { ascending: true });
        const existingArr = (existing ?? []) as any[];
        const validated = existingArr.filter((s) => s.validated);
        const nonValidated = existingArr.filter((s) => !s.validated);

        // Garde-fous selon le mode
        if (mode === "generate" && existingArr.length > 0 && !overwrite) {
          // Refus : scènes déjà présentes
          errors.push(`${chapter.id}:scenes_exist`);
          continue;
        }

        let startOrder = 1;
        let sceneTargetForRegen: any | null = null;

        if (mode === "extend") {
          startOrder = (existingArr[existingArr.length - 1]?.scene_order ?? 0) + 1;
        } else if (mode === "regenerate_scene") {
          const { data: s } = await supaAdmin
            .from("narrative_scenes")
            .select("*")
            .eq("id", targetSceneId!)
            .maybeSingle();
          sceneTargetForRegen = s;
          startOrder = s?.scene_order ?? 1;
        } else if (mode === "regenerate_chapter") {
          // On régénère uniquement les scènes non validées : on les supprime puis renumérote derrière les validées
          if (nonValidated.length > 0) {
            await supaAdmin
              .from("narrative_scenes")
              .delete()
              .in(
                "id",
                nonValidated.map((s) => s.id),
              );
            totalDeleted += nonValidated.length;
          }
          startOrder = (validated[validated.length - 1]?.scene_order ?? 0) + 1;
        } else if (mode === "generate" && overwrite) {
          // Overwrite : on n'écrase JAMAIS les scènes validées
          if (nonValidated.length > 0) {
            await supaAdmin
              .from("narrative_scenes")
              .delete()
              .in(
                "id",
                nonValidated.map((s) => s.id),
              );
            totalDeleted += nonValidated.length;
          }
          startOrder = (validated[validated.length - 1]?.scene_order ?? 0) + 1;
        }

        const range = recommendedSceneCount(chapter, variant, requestedCount);
        const userPrompt = buildUserPrompt({
          outline,
          chapter,
          pitch,
          variant,
          scenesRange: range,
          existingValidated: validated,
          existingNonValidated:
            mode === "regenerate_scene" && sceneTargetForRegen ? [sceneTargetForRegen] : [],
          startOrder,
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
            tools: [SCENES_TOOL],
            tool_choice: { type: "function", function: { name: "submit_scenes" } },
          }),
        });

        if (!aiResponse.ok) {
          const txt = await aiResponse.text();
          console.error("AI gateway error", aiResponse.status, txt);
          if (aiResponse.status === 429) {
            return new Response(
              JSON.stringify({ ok: false, error: "Trop de requêtes, réessayez." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (aiResponse.status === 402) {
            return new Response(JSON.stringify({ ok: false, error: "Crédits AI épuisés." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          errors.push(`${chapter.id}:ai_${aiResponse.status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) {
          errors.push(`${chapter.id}:no_tool_call`);
          continue;
        }
        const args = JSON.parse(toolCall.function.arguments || "{}");
        const scenes: any[] = Array.isArray(args.scenes) ? args.scenes : [];
        if (scenes.length === 0) {
          errors.push(`${chapter.id}:empty_scenes`);
          continue;
        }

        // Mode régénération de scène : on remplace l'existant en gardant l'id
        if (mode === "regenerate_scene" && sceneTargetForRegen) {
          const s = scenes[0];
          const { error: upErr } = await supaAdmin
            .from("narrative_scenes")
            .update({
              title: String(s.title ?? sceneTargetForRegen.title),
              summary: s.summary ?? null,
              content: String(s.voice_over_text ?? ""),
              voice_over_text: String(s.voice_over_text ?? ""),
              narrative_role: s.narrative_role ?? null,
              dominant_emotion: s.dominant_emotion ?? null,
              characters: Array.isArray(s.characters) ? s.characters : [],
              locations: Array.isArray(s.locations) ? s.locations : [],
              objects: Array.isArray(s.objects) ? s.objects : [],
              transition_to_next: s.transition_to_next ?? null,
              scene_context: { context: s.context ?? "" },
              ai_model: model,
              generation_index:
                (sceneTargetForRegen.generation_index ?? 1) + 1,
              status: "scenes_created",
            })
            .eq("id", sceneTargetForRegen.id);
          if (upErr) {
            errors.push(`${chapter.id}:update_err`);
            continue;
          }
          totalCreated += 1;
          continue;
        }

        // Insertion en append (renumérotation propre)
        const inserts = scenes.map((s, i) => ({
          user_id: user.id,
          project_id: projectId,
          chapter_id: chapter.id,
          outline_id: outline.id,
          scene_order:
            typeof s.scene_order === "number" ? s.scene_order : startOrder + i,
          title: String(s.title ?? `Scène ${startOrder + i}`),
          summary: s.summary ?? null,
          content: String(s.voice_over_text ?? ""),
          voice_over_text: String(s.voice_over_text ?? ""),
          narrative_role: s.narrative_role ?? null,
          dominant_emotion: s.dominant_emotion ?? null,
          characters: Array.isArray(s.characters) ? s.characters : [],
          locations: Array.isArray(s.locations) ? s.locations : [],
          objects: Array.isArray(s.objects) ? s.objects : [],
          transition_to_next: s.transition_to_next ?? null,
          scene_context: { context: s.context ?? "" },
          status: "scenes_created",
          ai_model: model,
          validated: false,
          generation_index: 1,
        }));

        // Renumérotation séquentielle stable
        inserts.sort((a, b) => a.scene_order - b.scene_order);
        let cursor = startOrder;
        for (const r of inserts) {
          r.scene_order = cursor++;
        }

        const { error: insErr } = await supaAdmin
          .from("narrative_scenes")
          .insert(inserts);
        if (insErr) {
          console.error("insert scenes", insErr);
          errors.push(`${chapter.id}:insert_err`);
          continue;
        }
        totalCreated += inserts.length;
      } catch (e) {
        console.error("chapter loop error", chapter.id, e);
        errors.push(`${chapter.id}:exception`);
      }
    }

    // Met à jour le statut du sommaire (et du generated_project si lié)
    if (totalCreated > 0) {
      await supaAdmin
        .from("narrative_outlines")
        .update({ status: "scenes_created" })
        .eq("id", outline.id);
      const { data: gen } = await supaAdmin
        .from("generated_projects")
        .select("id")
        .eq("project_id", projectId)
        .maybeSingle();
      if (gen?.id) {
        await supaAdmin
          .from("generated_projects")
          .update({ status: "scenes_created" })
          .eq("id", gen.id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        created: totalCreated,
        deleted: totalDeleted,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-narrative-scenes error", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});