import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Tool definitions ─────────────────────────────────────────────

const contextTool = {
  type: "function" as const,
  function: {
    name: "extract_global_context",
    description: "Extracts the global context from a narrative script. All fields must be in French.",
    parameters: {
      type: "object",
      properties: {
        sujet_principal: { type: "string" },
        lieu_principal: { type: "string" },
        epoque: { type: "string" },
        personnages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nom: { type: "string" },
              role: { type: "string" },
            },
            required: ["nom", "role"],
            additionalProperties: false,
          },
        },
        nombre_personnages: { type: "number" },
        contexte_narratif: { type: "string" },
        resume_narratif: { type: "string" },
        ton: { type: "string" },
        ambiance: { type: "string" },
        type_decor: { type: "string" },
        marqueurs_culturels: { type: "string" },
        niveau_technologique: { type: "string" },
        indices_visuels: { type: "array", items: { type: "string" } },
        type_narration: { type: "string" },
      },
      required: [
        "sujet_principal", "lieu_principal", "epoque", "personnages",
        "nombre_personnages", "contexte_narratif", "resume_narratif",
        "ton", "ambiance", "type_decor", "marqueurs_culturels",
        "niveau_technologique", "indices_visuels", "type_narration",
      ],
      additionalProperties: false,
    },
  },
};

const objectsTool = {
  type: "function" as const,
  function: {
    name: "extract_recurring_objects",
    description: "Extracts recurring visual objects from a narrative script.",
    parameters: {
      type: "object",
      properties: {
        objets_recurrents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              nom: { type: "string" },
              type: { type: "string", enum: ["vehicle", "building", "artifact", "weapon", "object"] },
              description_visuelle: { type: "string" },
              epoque: { type: "string" },
              mentions_scenes: { type: "array", items: { type: "number" } },
              identity_prompt: { type: "string" },
            },
            required: ["id", "nom", "type", "description_visuelle", "epoque", "identity_prompt"],
            additionalProperties: false,
          },
        },
      },
      required: ["objets_recurrents"],
      additionalProperties: false,
    },
  },
};

// ── Helper ───────────────────────────────────────────────────────

async function callWithToolCall(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  tool: typeof contextTool | typeof objectsTool,
): Promise<Record<string, unknown>> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.15,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: tool.function.name } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI gateway error:", response.status, errText);
    if (response.status === 429) throw new Error("Trop de requêtes, réessayez dans quelques instants.");
    if (response.status === 402) throw new Error("Crédits AI épuisés.");
    throw new Error("AI gateway error: " + response.status);
  }

  const aiData = await response.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function?.name !== tool.function.name) {
    console.error("No valid tool call:", JSON.stringify(aiData).slice(0, 500));
    throw new Error("L'IA n'a pas retourné de résultat structuré");
  }

  return JSON.parse(toolCall.function.arguments);
}

// ── Main ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id manquant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: project, error: projErr } = await sb
      .from("projects")
      .select("narration, title, subject, script_language")
      .eq("id", project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Projet introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const narration = project.narration?.trim();
    if (!narration || narration.length < 100) {
      return new Response(JSON.stringify({ error: "Script trop court (min 100 caractères)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langMap: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
    const langLabel = langMap[project.script_language] || "English";

    const userPrompt = `Titre : ${project.title || "Sans titre"}\nSujet : ${project.subject || "Non précisé"}\n\n--- SCRIPT ---\n${narration}`;

    // ── Call 1: Global context (same approach as before) ─────────
    console.log("=== Step 1: Global context extraction ===");
    const globalCtx = await callWithToolCall(
      LOVABLE_API_KEY,
      `You are a script analysis engine. You receive a YouTube documentary script written in ${langLabel}.
Extract the global context. All values in French. Be concise. If unknown, use "Non déterminé".`,
      `Analyse ce script et extrais le contexte global.\n\n${userPrompt}`,
      contextTool,
    );

    // ── Call 2: Recurring objects ────────────────────────────────
    console.log("=== Step 2: Recurring objects extraction ===");
    let objectsResult: Record<string, unknown> = { objets_recurrents: [] };
    try {
      objectsResult = await callWithToolCall(
        LOVABLE_API_KEY,
        `You are a visual continuity engine. You receive a YouTube documentary script written in ${langLabel}.
Identify objects, vehicles, buildings, or artifacts that appear across MULTIPLE scenes.
For each, generate an "identity_prompt" that locks the visual identity in English.
Use "obj-" prefix for IDs. If no recurring objects, return an empty array.`,
        `Identifie les objets récurrents de ce script.\n\n${userPrompt}`,
        objectsTool,
      );
    } catch (objErr) {
      console.warn("Objects extraction failed (non-blocking):", objErr);
    }

    // ── Merge & persist ─────────────────────────────────────────
    const merged: Record<string, unknown> = {
      ...globalCtx,
      personnages: Array.isArray(globalCtx.personnages) ? globalCtx.personnages : [],
      nombre_personnages: Array.isArray(globalCtx.personnages) ? globalCtx.personnages.length : 0,
      indices_visuels: Array.isArray(globalCtx.indices_visuels) ? globalCtx.indices_visuels : [],
      objets_recurrents: Array.isArray(objectsResult.objets_recurrents) ? objectsResult.objets_recurrents : [],
    };

    const { error: upsertErr } = await sb
      .from("project_scriptcreator_state")
      .upsert({ project_id, global_context: merged }, { onConflict: "project_id" });

    if (upsertErr) console.error("Failed to persist global_context:", upsertErr);

    console.log(`ContexteGlobal: ${(merged.personnages as any[]).length} personnages, ${(merged.objets_recurrents as any[]).length} objets récurrents`);

    return new Response(JSON.stringify({ global_context: merged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-context error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
