// Étape 10 — Génération d'un lot de 5 pitchs d'histoires.
//
// Reçoit soit un `analysis_id` (NarrativeAnalysis) soit un `form_id`
// (NarrativeForm personnalisée). Construit un prompt à partir de la
// signature narrative et demande à l'IA de produire EXACTEMENT 5 pitchs
// détaillés via tool-calling.
//
// Les pitchs précédents NE sont jamais effacés : un nouveau PitchBatch
// est créé à chaque appel, avec un `batch_index` incrémenté.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_MODEL = "google/gemini-2.5-pro";
const PITCHES_PER_BATCH = 5;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PITCH_TOOL = {
  type: "function",
  function: {
    name: "submit_story_pitches",
    description:
      "Soumet exactement 5 propositions d'histoires distinctes respectant la mécanique narrative fournie.",
    parameters: {
      type: "object",
      properties: {
        pitches: {
          type: "array",
          minItems: PITCHES_PER_BATCH,
          maxItems: PITCHES_PER_BATCH,
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Titre provisoire évocateur (4-10 mots).",
              },
              theme: {
                type: "string",
                description: "Thème central abstrait (1-2 phrases).",
              },
              concept: {
                type: "string",
                description:
                  "Concept de l'histoire : sujet concret + ce qui rend cette histoire singulière (3-5 phrases).",
              },
              angle: {
                type: "string",
                description: "Angle narratif spécifique adopté (2-3 phrases).",
              },
              point_of_view: {
                type: "string",
                description:
                  "Point de vue narratif (qui raconte, à travers quels yeux, distance émotionnelle).",
              },
              central_tension: {
                type: "string",
                description:
                  "Tension dramatique principale qui tient l'attention du début à la fin (2-3 phrases).",
              },
              narrative_promise: {
                type: "string",
                description:
                  "Promesse faite au spectateur dans les premières secondes : ce qu'il va découvrir / ressentir.",
              },
              progression: {
                type: "string",
                description:
                  "Progression générale en 4-6 étapes/beats narratifs (description en prose, pas une liste).",
              },
              twists: {
                type: "array",
                description:
                  "2 à 4 rebondissements ou points de bascule possibles, chacun en une phrase.",
                items: { type: "string" },
                minItems: 2,
                maxItems: 4,
              },
              dominant_emotion: {
                type: "string",
                description:
                  "Émotion dominante visée (ex : sidération, mélancolie, colère froide, vertige).",
              },
              tone: {
                type: "string",
                description: "Ton de la narration (registre + posture du narrateur).",
              },
              target_audience: {
                type: "string",
                description: "Public cible précis (au-delà de 'grand public').",
              },
              estimated_format: {
                type: "string",
                description: "Format estimé (ex : '12-15 min documentaire long').",
              },
              form_compliance_justification: {
                type: "string",
                description:
                  "Justification explicite : en quoi ce pitch respecte la forme narrative analysée (structure, patterns, ton, rythme, règles).",
              },
            },
            required: [
              "title",
              "theme",
              "concept",
              "angle",
              "point_of_view",
              "central_tension",
              "narrative_promise",
              "progression",
              "twists",
              "dominant_emotion",
              "tone",
              "target_audience",
              "estimated_format",
              "form_compliance_justification",
            ],
          },
        },
      },
      required: ["pitches"],
    },
  },
};

function buildSystemPrompt(): string {
  return [
    "Tu es un développeur de concepts vidéo documentaire / récit.",
    "",
    "Mission : produire EXACTEMENT 5 propositions d'histoires ORIGINALES qui respectent",
    "la mécanique narrative fournie (structure, patterns, ton, rythme, règles d'écriture).",
    "",
    "Règles strictes :",
    "- Les 5 pitchs doivent être nettement DISTINCTS les uns des autres : sujets différents,",
    "  univers différents, époques ou angles différents. Pas de variations cosmétiques.",
    "- Chaque pitch est DÉTAILLÉ : pas de phrases vides, pas de généralités creuses.",
    "- Tu transposes la mécanique narrative à des SUJETS NEUFS — jamais une copie des sources.",
    "- La justification du respect de la forme doit pointer des éléments concrets de l'analyse.",
    "- Tu n'inventes pas de faits historiques précis (dates, chiffres) : tu décris l'angle.",
    "- Tu écris en français, registre soigné, sans clichés vendeurs.",
    "",
    "Soumets ta réponse via l'outil `submit_story_pitches`.",
  ].join("\n");
}

function buildUserMessage(opts: {
  signature: any;
  form?: { name?: string | null; description?: string | null; system_prompt?: string | null } | null;
  instructions?: string | null;
}): string {
  const { signature, form, instructions } = opts;
  const parts: string[] = [];

  if (form?.name) {
    parts.push(`# Forme narrative : ${form.name}`);
    if (form.description) parts.push(form.description);
    parts.push("");
  }

  if (signature?.title) parts.push(`## Titre de la mécanique\n${signature.title}\n`);
  if (signature?.summary) parts.push(`## Synthèse\n${signature.summary}\n`);

  if (signature?.structure) {
    parts.push("## Structure narrative");
    const s = signature.structure;
    if (s.archetype) parts.push(`- Archétype : ${s.archetype}`);
    if (s.opening_strategy) parts.push(`- Ouverture : ${s.opening_strategy}`);
    if (s.closing_strategy) parts.push(`- Clôture : ${s.closing_strategy}`);
    if (Array.isArray(s.beats) && s.beats.length > 0) {
      parts.push("- Beats :");
      s.beats.forEach((b: any, i: number) => {
        const pct = typeof b.placement_pct === "number" ? ` (~${Math.round(b.placement_pct)}%)` : "";
        parts.push(`  ${i + 1}. ${b.name}${pct} — ${b.role}`);
      });
    }
    parts.push("");
  }

  if (Array.isArray(signature?.patterns) && signature.patterns.length > 0) {
    parts.push("## Patterns transférables");
    signature.patterns.forEach((p: any) => parts.push(`- ${p.name} : ${p.description}`));
    parts.push("");
  }

  if (signature?.tone) {
    parts.push("## Ton");
    if (signature.tone.register) parts.push(`- Registre : ${signature.tone.register}`);
    if (signature.tone.narrator_posture) parts.push(`- Posture : ${signature.tone.narrator_posture}`);
    if (Array.isArray(signature.tone.emotional_palette)) {
      parts.push(`- Palette : ${signature.tone.emotional_palette.join(", ")}`);
    }
    parts.push("");
  }

  if (signature?.rhythm) {
    parts.push("## Rythme");
    if (signature.rhythm.pacing) parts.push(`- Cadence : ${signature.rhythm.pacing}`);
    if (signature.rhythm.sentence_length) parts.push(`- Phrases : ${signature.rhythm.sentence_length}`);
    if (signature.rhythm.variations) parts.push(`- Variations : ${signature.rhythm.variations}`);
    parts.push("");
  }

  if (Array.isArray(signature?.writing_rules) && signature.writing_rules.length > 0) {
    parts.push("## Règles d'écriture");
    signature.writing_rules.forEach((r: any) =>
      parts.push(`- ${r.rule}${r.rationale ? ` — ${r.rationale}` : ""}`),
    );
    parts.push("");
  }

  if (signature?.recommendations) {
    if (Array.isArray(signature.recommendations.do)) {
      parts.push("## À faire");
      signature.recommendations.do.forEach((d: string) => parts.push(`- ${d}`));
      parts.push("");
    }
    if (Array.isArray(signature.recommendations.avoid)) {
      parts.push("## À éviter");
      signature.recommendations.avoid.forEach((a: string) => parts.push(`- ${a}`));
      parts.push("");
    }
  }

  if (instructions && instructions.trim()) {
    parts.push("## Instructions complémentaires de l'auteur");
    parts.push(instructions.trim());
    parts.push("");
  }

  parts.push(
    "Génère maintenant 5 pitchs détaillés, distincts, qui transposent cette mécanique à des sujets entièrement nouveaux.",
  );
  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !anonKey) return jsonResponse({ error: "Supabase env not configured" }, 500);
    if (!lovableKey) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    let body: { analysis_id?: string; form_id?: string; instructions?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const { analysis_id, form_id, instructions } = body;
    if (!analysis_id && !form_id) {
      return jsonResponse({ error: "analysis_id or form_id required" }, 400);
    }

    // Charger l'analyse et/ou la forme
    let signature: any = null;
    let formRow: any = null;
    let resolvedAnalysisId: string | null = analysis_id ?? null;

    if (form_id) {
      const { data, error } = await supabase
        .from("narrative_forms")
        .select("id, name, description, system_prompt, narrative_signature, analysis_id")
        .eq("id", form_id)
        .maybeSingle();
      if (error || !data) {
        return jsonResponse({ error: "Forme narrative introuvable" }, 404);
      }
      formRow = data;
      signature = data.narrative_signature ?? null;
      if (!resolvedAnalysisId && data.analysis_id) resolvedAnalysisId = data.analysis_id;
    }

    if (resolvedAnalysisId && !signature) {
      const { data, error } = await supabase
        .from("narrative_analyses")
        .select("id, title, summary, structure, patterns, tone, rhythm, writing_rules, recommendations")
        .eq("id", resolvedAnalysisId)
        .maybeSingle();
      if (error || !data) {
        return jsonResponse({ error: "Analyse narrative introuvable" }, 404);
      }
      signature = {
        title: data.title,
        summary: data.summary,
        structure: data.structure,
        patterns: data.patterns,
        tone: data.tone,
        rhythm: data.rhythm,
        writing_rules: data.writing_rules,
        recommendations: data.recommendations,
      };
    }

    if (!signature) {
      return jsonResponse(
        { error: "Aucune signature narrative exploitable (analyse ou forme vide)." },
        400,
      );
    }

    // Déterminer le prochain batch_index pour ce contexte
    const batchScope = supabase
      .from("pitch_batches")
      .select("batch_index", { count: "exact", head: false })
      .eq("user_id", userId)
      .order("batch_index", { ascending: false })
      .limit(1);
    const filtered = form_id
      ? batchScope.eq("form_id", form_id)
      : batchScope.eq("analysis_id", resolvedAnalysisId!);
    const { data: lastBatch } = await filtered;
    const nextIndex = (lastBatch?.[0]?.batch_index ?? 0) + 1;

    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage({
      signature,
      form: formRow,
      instructions: instructions ?? null,
    });

    console.log(`[generate-story-pitches] user=${userId} analysis=${resolvedAnalysisId ?? "-"} form=${form_id ?? "-"} batch#${nextIndex}`);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_completion_tokens: 12000,
        temperature: 0.85,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [PITCH_TOOL],
        tool_choice: { type: "function", function: { name: "submit_story_pitches" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return jsonResponse(
          { error: "Limite de requêtes atteinte, réessayez dans une minute." },
          429,
        );
      }
      if (aiResp.status === 402) {
        return jsonResponse(
          { error: "Crédits Lovable AI épuisés — ajoutez des crédits dans Settings → Workspace → Usage." },
          402,
        );
      }
      return jsonResponse({ error: "AI gateway error" }, 502);
    }

    const aiJson = await aiResp.json();
    const toolCalls = aiJson?.choices?.[0]?.message?.tool_calls;
    const argsStr = toolCalls?.[0]?.function?.arguments;
    if (!argsStr) {
      console.error("No tool_call returned", JSON.stringify(aiJson).slice(0, 500));
      return jsonResponse({ error: "L'IA n'a pas retourné de pitchs exploitables." }, 502);
    }

    let parsed: { pitches: any[] };
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      console.error("Tool args parse error", e);
      return jsonResponse({ error: "Réponse IA invalide (parse)" }, 502);
    }

    const pitches = Array.isArray(parsed?.pitches) ? parsed.pitches : [];
    if (pitches.length !== PITCHES_PER_BATCH) {
      console.warn(`[generate-story-pitches] expected ${PITCHES_PER_BATCH} pitches, got ${pitches.length}`);
    }
    if (pitches.length === 0) {
      return jsonResponse({ error: "Aucun pitch généré." }, 502);
    }

    // Insertion du batch
    const { data: batchInsert, error: batchErr } = await supabase
      .from("pitch_batches")
      .insert({
        user_id: userId,
        analysis_id: resolvedAnalysisId,
        form_id: form_id ?? null,
        batch_index: nextIndex,
        instructions: instructions ?? null,
        ai_model: AI_MODEL,
        status: "pitch_batch_generated",
      })
      .select()
      .single();
    if (batchErr || !batchInsert) {
      console.error("batch insert error", batchErr);
      return jsonResponse({ error: "Impossible de créer le lot." }, 500);
    }

    const pitchRows = pitches.slice(0, PITCHES_PER_BATCH).map((p: any, idx: number) => ({
      user_id: userId,
      pitch_batch_id: batchInsert.id,
      pitch_order: idx + 1,
      status: "generated",
      title: String(p.title ?? `Pitch ${idx + 1}`).slice(0, 240),
      theme: p.theme ?? null,
      concept: p.concept ?? null,
      angle: p.angle ?? null,
      point_of_view: p.point_of_view ?? null,
      central_tension: p.central_tension ?? null,
      narrative_promise: p.narrative_promise ?? null,
      progression: p.progression ?? null,
      twists: Array.isArray(p.twists) ? p.twists : [],
      dominant_emotion: p.dominant_emotion ?? null,
      tone: p.tone ?? null,
      target_audience: p.target_audience ?? null,
      estimated_format: p.estimated_format ?? null,
      form_compliance_justification: p.form_compliance_justification ?? null,
      // synopsis = compat ascendante : on stocke le concept comme synopsis court
      synopsis: p.concept ?? null,
      hook: p.narrative_promise ?? null,
    }));

    const { data: insertedPitches, error: pitchesErr } = await supabase
      .from("story_pitches")
      .insert(pitchRows)
      .select();
    if (pitchesErr) {
      console.error("pitches insert error", pitchesErr);
      return jsonResponse({ error: "Pitchs créés mais non sauvegardés." }, 500);
    }

    return jsonResponse({
      ok: true,
      batch: batchInsert,
      pitches: insertedPitches ?? pitchRows,
    });
  } catch (e: any) {
    console.error("generate-story-pitches fatal", e);
    return jsonResponse({ error: e?.message ?? "Erreur inconnue" }, 500);
  }
});
