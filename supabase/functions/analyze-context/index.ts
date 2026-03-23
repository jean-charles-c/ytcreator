import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ═══════════════════════════════════════════════════════════════════
 * ANALYZE-CONTEXT — Global Script Context Extraction
 * ═══════════════════════════════════════════════════════════════════
 *
 * Analyses the full script BEFORE segmentation and builds a
 * ContexteGlobal object that serves as reference memory for
 * all downstream operations (segmentation, storyboard, visuals).
 *
 * The ContexteGlobal is stored in project_scriptcreator_state.global_context
 * and is built ONCE per script (or rebuilt on re-analysis).
 * ═══════════════════════════════════════════════════════════════════
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id manquant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch the project narration
    const { data: project, error: projErr } = await sb
      .from("projects")
      .select("narration, title, subject, script_language")
      .eq("id", project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Projet introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const narration = project.narration?.trim();
    if (!narration || narration.length < 100) {
      return new Response(JSON.stringify({ error: "Script trop court pour analyse contextuelle (min 100 caractères)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langMap: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
    const langLabel = langMap[project.script_language] || "English";

    // ─── AI Call: Extract ContexteGlobal ─────────────────────────────
    const systemPrompt = `You are a script analysis engine. You receive a complete YouTube documentary/narrative script written in ${langLabel}.

Your task is to analyze the ENTIRE script and extract a structured global context object (ContexteGlobal) that captures the essential reference information.

ALL OUTPUT FIELDS MUST BE IN FRENCH regardless of the script language.

RULES:
- Only extract information that is EXPLICITLY present or CLEARLY inferable from the script text.
- Do NOT invent characters, locations, or time periods that are not supported by the text.
- If a field cannot be determined, use "Non déterminé" rather than guessing.
- Be precise and concise in your descriptions.
- The "personnages" array should list ONLY named or clearly identified characters/subjects.
- The "resume_narratif" should be a 2-3 sentence summary of the script's narrative arc.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.15,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyse ce script complet et extrais le ContexteGlobal.\n\nTitre du projet : ${project.title || "Sans titre"}\nSujet : ${project.subject || "Non précisé"}\n\n--- SCRIPT ---\n${narration}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_global_context",
              description: "Extracts the global context from a narrative script. All fields must be in French.",
              parameters: {
                type: "object",
                properties: {
                  sujet_principal: {
                    type: "string",
                    description: "Le sujet principal du script (en français)",
                  },
                  lieu_principal: {
                    type: "string",
                    description: "Le lieu principal ou la zone géographique (en français)",
                  },
                  epoque: {
                    type: "string",
                    description: "L'époque ou la période temporelle principale (en français)",
                  },
                  personnages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nom: { type: "string", description: "Nom du personnage/sujet" },
                        role: { type: "string", description: "Rôle dans le récit (en français)" },
                      },
                      required: ["nom", "role"],
                      additionalProperties: false,
                    },
                    description: "Liste des personnages ou sujets identifiables",
                  },
                  nombre_personnages: {
                    type: "number",
                    description: "Nombre total de personnages/sujets identifiés",
                  },
                  contexte_narratif: {
                    type: "string",
                    description: "Le contexte narratif général — ce que raconte le script (en français, 2-3 phrases)",
                  },
                  resume_narratif: {
                    type: "string",
                    description: "Résumé de l'arc narratif complet (en français, 2-3 phrases)",
                  },
                  ton: {
                    type: "string",
                    description: "Le ton général du script (ex: dramatique, informatif, contemplatif, etc.)",
                  },
                  ambiance: {
                    type: "string",
                    description: "L'ambiance visuelle dominante (ex: sombre, lumineuse, mystérieuse, etc.)",
                  },
                  type_decor: {
                    type: "string",
                    description: "Le type de décor principal (ex: urbain, naturel, intérieur, historique, etc.)",
                  },
                  marqueurs_culturels: {
                    type: "string",
                    description: "Marqueurs culturels, civilisationnels ou géopolitiques identifiés",
                  },
                  niveau_technologique: {
                    type: "string",
                    description: "Niveau technologique de l'époque/contexte décrit",
                  },
                  indices_visuels: {
                    type: "array",
                    items: { type: "string" },
                    description: "Liste d'indices visuels structurants pour la cohérence des images (en français)",
                  },
                  type_narration: {
                    type: "string",
                    description: "Type de narration (ex: documentaire, storytelling, investigation, etc.)",
                  },
                },
                required: [
                  "sujet_principal",
                  "lieu_principal",
                  "epoque",
                  "personnages",
                  "nombre_personnages",
                  "contexte_narratif",
                  "resume_narratif",
                  "ton",
                  "ambiance",
                  "type_decor",
                  "marqueurs_culturels",
                  "niveau_technologique",
                  "indices_visuels",
                  "type_narration",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_global_context" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits AI épuisés." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error: " + response.status);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function?.name !== "extract_global_context") {
      console.error("No valid tool call:", JSON.stringify(aiData).slice(0, 500));
      throw new Error("L'analyse n'a pas retourné de contexte valide");
    }

    let globalContext: Record<string, unknown>;
    try {
      globalContext = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse tool call:", toolCall.function.arguments?.slice(0, 500));
      throw new Error("Réponse d'analyse contextuelle invalide");
    }

    // Validate required fields
    const requiredFields = ["sujet_principal", "lieu_principal", "epoque", "personnages", "contexte_narratif"];
    for (const field of requiredFields) {
      if (!globalContext[field]) {
        globalContext[field] = "Non déterminé";
      }
    }
    if (!Array.isArray(globalContext.personnages)) {
      globalContext.personnages = [];
    }
    globalContext.nombre_personnages = (globalContext.personnages as any[]).length;

    // ─── Persist to project_scriptcreator_state ──────────────────────
    const { error: upsertErr } = await sb
      .from("project_scriptcreator_state")
      .upsert(
        { project_id, global_context: globalContext },
        { onConflict: "project_id" }
      );

    if (upsertErr) {
      console.error("Failed to persist global_context:", upsertErr);
      // Don't fail — still return the context to the client
    }

    console.log(`ContexteGlobal built for project ${project_id}: ${(globalContext.personnages as any[]).length} personnages, lieu="${globalContext.lieu_principal}", époque="${globalContext.epoque}"`);

    return new Response(JSON.stringify({ global_context: globalContext }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-context error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
