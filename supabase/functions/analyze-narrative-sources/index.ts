// Étape 7 — Analyse narrative IA des transcriptions.
//
// Reçoit un tableau d'IDs de sources (`narrative_sources`) appartenant à
// l'utilisateur authentifié, charge celles dont la transcription est
// exploitable, puis appelle Lovable AI Gateway (Gemini 2.5 Pro) avec un
// prompt orienté "extraction de mécanique narrative transférable".
//
// Le résultat est sauvegardé dans `narrative_analyses` et renvoyé au client.
// Aucun pitch, aucune forme narrative n'est créé à cette étape.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIN_TRANSCRIPT_CHARS = 50;
const MAX_SOURCES = 4;
const MAX_TRANSCRIPT_CHARS_PER_SOURCE = 60_000; // garde-fou mémoire / contexte
const AI_MODEL = "google/gemini-2.5-pro";

type NarrativeSourceRow = {
  id: string;
  user_id: string;
  title: string | null;
  channel: string | null;
  youtube_url: string | null;
  transcript: string | null;
  language: string | null;
  duration_seconds: number | null;
};

interface AnalysisToolPayload {
  title: string;
  summary: string;
  confidence_level: "low" | "medium" | "high";
  confidence_reason: string;
  structure: {
    archetype: string;
    beats: { name: string; role: string; placement_pct?: number }[];
    opening_strategy: string;
    closing_strategy: string;
  };
  patterns: {
    name: string;
    description: string;
    transferable_to: string;
  }[];
  tone: {
    register: string;
    emotional_palette: string[];
    narrator_posture: string;
  };
  rhythm: {
    pacing: string;
    sentence_length: string;
    variations: string;
  };
  writing_rules: {
    rule: string;
    rationale: string;
  }[];
  recommendations: {
    do: string[];
    avoid: string[];
  };
  variations?: {
    summary?: string;
    items?: { axis: string; observation: string }[];
  };
}

function buildSystemPrompt(): string {
  return [
    "Tu es un analyste narratif spécialisé dans la rétro-ingénierie de scripts vidéo.",
    "",
    "Ta mission : extraire la MÉCANIQUE NARRATIVE TRANSFÉRABLE de plusieurs transcriptions,",
    "sans jamais en copier le contenu de surface (sujets, noms, anecdotes, citations).",
    "",
    "Tu DOIS distinguer 5 niveaux d'analyse :",
    "1. Contenu de surface (à IGNORER dans la sortie) — le sujet traité.",
    "2. Structure sous-jacente — l'architecture des beats narratifs.",
    "3. Patterns transférables — figures réutilisables sur d'autres sujets.",
    "4. Procédés narratifs — ton, rythme, posture du narrateur, variations.",
    "5. Règles d'écriture implicites — ce qui est systématiquement fait ou évité.",
    "",
    "Contraintes :",
    "- Ne reproduis JAMAIS de phrases ou passages exacts des transcriptions.",
    "- Ne te limite pas à un résumé : décris une mécanique réplicable.",
    "- Le `confidence_level` doit refléter le nombre et la qualité des sources :",
    "  • 1 source courte/moyenne → low",
    "  • 1 source riche OU 2 sources cohérentes → medium",
    "  • 3+ sources cohérentes → high",
    "- Si plusieurs sources sont fournies, remplis `variations` avec les",
    "  divergences observées entre elles (structure, ton, rythme, ouverture…).",
    "  Si une seule source : `variations.summary` doit l'indiquer explicitement",
    "  et `variations.items` peut rester vide.",
    "- Tu réponds OBLIGATOIREMENT via l'appel d'outil `submit_narrative_analysis`.",
  ].join("\n");
}

function buildUserPrompt(sources: NarrativeSourceRow[]): string {
  const blocks = sources.map((s, i) => {
    const transcript = (s.transcript ?? "").slice(
      0,
      MAX_TRANSCRIPT_CHARS_PER_SOURCE,
    );
    return [
      `=== SOURCE ${i + 1} ===`,
      `Titre : ${s.title ?? "(sans titre)"}`,
      `Chaîne : ${s.channel ?? "(inconnue)"}`,
      `URL : ${s.youtube_url ?? "(transcription manuelle)"}`,
      `Langue : ${s.language ?? "fr"}`,
      `Durée estimée : ${s.duration_seconds ?? "?"} s`,
      "",
      "TRANSCRIPTION :",
      transcript,
    ].join("\n");
  });

  return [
    `Analyse les ${sources.length} source(s) ci-dessous et extrait leur mécanique narrative transférable.`,
    "",
    blocks.join("\n\n"),
    "",
    "Réponds en français via l'outil `submit_narrative_analysis`.",
  ].join("\n");
}

const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_narrative_analysis",
    description:
      "Soumet l'analyse narrative structurée extraite des transcriptions sources.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "Nom court de la mécanique narrative identifiée." },
        summary: { type: "string", description: "Synthèse globale (4-8 phrases) de la mécanique transférable." },
        confidence_level: { type: "string", enum: ["low", "medium", "high"] },
        confidence_reason: { type: "string" },
        structure: {
          type: "object",
          additionalProperties: false,
          properties: {
            archetype: { type: "string" },
            beats: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  placement_pct: { type: "number" },
                },
                required: ["name", "role"],
              },
            },
            opening_strategy: { type: "string" },
            closing_strategy: { type: "string" },
          },
          required: ["archetype", "beats", "opening_strategy", "closing_strategy"],
        },
        patterns: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              transferable_to: { type: "string" },
            },
            required: ["name", "description", "transferable_to"],
          },
        },
        tone: {
          type: "object",
          additionalProperties: false,
          properties: {
            register: { type: "string" },
            emotional_palette: { type: "array", items: { type: "string" } },
            narrator_posture: { type: "string" },
          },
          required: ["register", "emotional_palette", "narrator_posture"],
        },
        rhythm: {
          type: "object",
          additionalProperties: false,
          properties: {
            pacing: { type: "string" },
            sentence_length: { type: "string" },
            variations: { type: "string" },
          },
          required: ["pacing", "sentence_length", "variations"],
        },
        writing_rules: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              rule: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["rule", "rationale"],
          },
        },
        recommendations: {
          type: "object",
          additionalProperties: false,
          properties: {
            do: { type: "array", items: { type: "string" } },
            avoid: { type: "array", items: { type: "string" } },
          },
          required: ["do", "avoid"],
        },
        variations: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  axis: { type: "string", description: "Axe de variation (structure, ton, rythme…)." },
                  observation: { type: "string" },
                },
                required: ["axis", "observation"],
              },
            },
          },
        },
      },
      required: [
        "title",
        "summary",
        "confidence_level",
        "confidence_reason",
        "structure",
        "patterns",
        "tone",
        "rhythm",
        "writing_rules",
        "recommendations",
      ],
    },
  },
};

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
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Supabase env not configured" }, 500);
    }
    if (!lovableKey) {
      return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth
      .getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    let body: { source_ids?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const ids = Array.isArray(body.source_ids)
      ? body.source_ids.filter((x) => typeof x === "string")
      : [];
    if (ids.length === 0) {
      return jsonResponse({ error: "source_ids required" }, 400);
    }
    if (ids.length > MAX_SOURCES) {
      return jsonResponse(
        { error: `Maximum ${MAX_SOURCES} sources` },
        400,
      );
    }

    // Charger les sources demandées (RLS appliquée via le client utilisateur).
    const { data: rawSources, error: sourcesError } = await supabase
      .from("narrative_sources")
      .select(
        "id, user_id, title, channel, youtube_url, transcript, language, duration_seconds",
      )
      .in("id", ids);
    if (sourcesError) {
      return jsonResponse({ error: sourcesError.message }, 500);
    }

    const sources = (rawSources as NarrativeSourceRow[] | null ?? []).filter(
      (s) =>
        !!s.transcript &&
        s.transcript.trim().length >= MIN_TRANSCRIPT_CHARS &&
        s.user_id === userId,
    );

    if (sources.length === 0) {
      return jsonResponse(
        { error: "Aucune source avec transcription exploitable." },
        400,
      );
    }

    // Crée immédiatement un enregistrement « in_progress » pour traçabilité.
    const { data: pending, error: pendingError } = await supabase
      .from("narrative_analyses")
      .insert({
        user_id: userId,
        source_ids: sources.map((s) => s.id),
        status: "analysis_in_progress",
        ai_model: AI_MODEL,
      })
      .select("id")
      .single();
    if (pendingError || !pending) {
      return jsonResponse(
        { error: pendingError?.message ?? "Cannot create analysis row" },
        500,
      );
    }
    const analysisId = pending.id as string;

    // Appel Lovable AI Gateway en mode tool-calling pour structured output.
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt(sources) },
          ],
          tools: [ANALYSIS_TOOL],
          tool_choice: {
            type: "function",
            function: { name: "submit_narrative_analysis" },
          },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error", aiResponse.status, errText);
      await supabase
        .from("narrative_analyses")
        .update({
          status: "analysis_failed",
          error_message: `AI ${aiResponse.status}: ${errText.slice(0, 500)}`,
        })
        .eq("id", analysisId);
      if (aiResponse.status === 429) {
        return jsonResponse(
          { error: "Limites IA atteintes, réessayez dans un instant." },
          429,
        );
      }
      if (aiResponse.status === 402) {
        return jsonResponse(
          { error: "Crédits IA épuisés — ajoutez des crédits dans Lovable Cloud." },
          402,
        );
      }
      return jsonResponse({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiResponse.json();
    const toolCall =
      aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!toolCall) {
      await supabase
        .from("narrative_analyses")
        .update({
          status: "analysis_failed",
          error_message: "Aucun appel d'outil dans la réponse IA",
        })
        .eq("id", analysisId);
      return jsonResponse(
        { error: "L'IA n'a pas renvoyé de structure exploitable." },
        500,
      );
    }

    let parsed: AnalysisToolPayload;
    try {
      parsed = JSON.parse(toolCall);
    } catch (e) {
      console.error("tool args parse error", e, toolCall);
      await supabase
        .from("narrative_analyses")
        .update({
          status: "analysis_failed",
          error_message: "Réponse IA invalide (JSON mal formé)",
        })
        .eq("id", analysisId);
      return jsonResponse(
        { error: "Réponse IA invalide (JSON mal formé)." },
        500,
      );
    }

    const { error: updateError } = await supabase
      .from("narrative_analyses")
      .update({
        title: parsed.title,
        summary: parsed.summary,
        structure: parsed.structure ?? {},
        patterns: { items: parsed.patterns ?? [] },
        tone: parsed.tone ?? {},
        rhythm: parsed.rhythm ?? {},
        writing_rules: { items: parsed.writing_rules ?? [] },
        recommendations: {
          do: parsed.recommendations?.do ?? [],
          avoid: parsed.recommendations?.avoid ?? [],
          confidence_level: parsed.confidence_level,
          confidence_reason: parsed.confidence_reason,
          sources_used: sources.length,
        },
        status: "analysis_completed",
        ai_model: AI_MODEL,
      })
      .eq("id", analysisId);

    if (updateError) {
      console.error("update analysis error", updateError);
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse(
      {
        ok: true,
        analysis_id: analysisId,
        sources_used: sources.length,
        confidence_level: parsed.confidence_level,
        analysis: parsed,
      },
      200,
    );
  } catch (e) {
    console.error("analyze-narrative-sources fatal", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}