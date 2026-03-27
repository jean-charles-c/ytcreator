import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonRecord = Record<string, unknown>;

function extractJsonObject(content: string) {
  let cleaned = content
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("No JSON object found in response");
  }

  cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, "");

  return JSON.parse(cleaned) as JsonRecord;
}

async function callLovableAI({
  apiKey,
  systemPrompt,
  userPrompt,
}: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI gateway error:", response.status, errText);
    if (response.status === 429) throw new Error("Trop de requêtes, réessayez dans quelques instants.");
    if (response.status === 402) throw new Error("Crédits AI épuisés.");
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const aiData = await response.json();
  const content = aiData.choices?.[0]?.message?.content;
  const finishReason = aiData.choices?.[0]?.finish_reason;
  console.log(`AI response: finish_reason=${finishReason}, content_length=${content?.length || 0}`);

  if (!content) {
    console.error("No content in AI response:", JSON.stringify(aiData).slice(0, 500));
    throw new Error("L'analyse n'a pas retourné de contenu valide");
  }

  return extractJsonObject(content);
}

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

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    const langMap: Record<string, string> = {
      en: "English",
      fr: "French",
      es: "Spanish",
      de: "German",
      pt: "Portuguese",
      it: "Italian",
    };
    const langLabel = langMap[project.script_language] || "English";

    const baseProjectPrompt = `Titre du projet : ${project.title || "Sans titre"}
Sujet : ${project.subject || "Non précisé"}

--- SCRIPT ---
${narration}`;

    const globalContext = await callLovableAI({
      apiKey: LOVABLE_API_KEY,
      systemPrompt: `You analyze a complete YouTube documentary script written in ${langLabel}.
Return ONLY valid JSON.
All values must be in French.
Be concise.
Do not invent unsupported facts.
If unknown, use "Non déterminé".

Return exactly this shape:
{
  "sujet_principal": "string",
  "lieu_principal": "string",
  "epoque": "string",
  "personnages": [{"nom": "string", "role": "string"}],
  "nombre_personnages": 0,
  "contexte_narratif": "string",
  "resume_narratif": "string",
  "ton": "string",
  "ambiance": "string",
  "type_decor": "string",
  "marqueurs_culturels": "string",
  "niveau_technologique": "string",
  "indices_visuels": ["string"],
  "type_narration": "string"
}`,
      userPrompt: `Analyse ce script complet et extrais le contexte global en JSON.
${baseProjectPrompt}`,
    });

    const objectData = await callLovableAI({
      apiKey: LOVABLE_API_KEY,
      systemPrompt: `You analyze a complete YouTube documentary script written in ${langLabel}.
Return ONLY valid JSON.
All values must be in French except the identity lock prompts, which must stay in English.
Be concise.
Only include objects that recur across multiple scenes or sections.
If none exist, return an empty array.

Return exactly this shape:
{
  "objets_recurrents": [
    {
      "id": "obj-xxxx",
      "nom": "string",
      "type": "vehicle|building|artifact|weapon|object",
      "description_visuelle": "string",
      "epoque": "string",
      "mentions_scenes": [1,2],
      "identity_prompt": "string"
    }
  ]
}`,
      userPrompt: `Identifie uniquement les objets récurrents de ce script et retourne seulement le JSON demandé.
${baseProjectPrompt}`,
    });

    const mergedContext: JsonRecord = {
      sujet_principal: globalContext.sujet_principal || "Non déterminé",
      lieu_principal: globalContext.lieu_principal || "Non déterminé",
      epoque: globalContext.epoque || "Non déterminé",
      personnages: Array.isArray(globalContext.personnages) ? globalContext.personnages : [],
      nombre_personnages: Array.isArray(globalContext.personnages) ? globalContext.personnages.length : 0,
      contexte_narratif: globalContext.contexte_narratif || "Non déterminé",
      resume_narratif: globalContext.resume_narratif || "Non déterminé",
      ton: globalContext.ton || "Non déterminé",
      ambiance: globalContext.ambiance || "Non déterminé",
      type_decor: globalContext.type_decor || "Non déterminé",
      marqueurs_culturels: globalContext.marqueurs_culturels || "Non déterminé",
      niveau_technologique: globalContext.niveau_technologique || "Non déterminé",
      indices_visuels: Array.isArray(globalContext.indices_visuels) ? globalContext.indices_visuels : [],
      type_narration: globalContext.type_narration || "Non déterminé",
      objets_recurrents: Array.isArray(objectData.objets_recurrents) ? objectData.objets_recurrents : [],
    };

    const { error: upsertErr } = await sb
      .from("project_scriptcreator_state")
      .upsert({ project_id, global_context: mergedContext }, { onConflict: "project_id" });

    if (upsertErr) console.error("Failed to persist global_context:", upsertErr);

    console.log(
      `ContexteGlobal built: ${Array.isArray(mergedContext.personnages) ? mergedContext.personnages.length : 0} personnages, ${Array.isArray(mergedContext.objets_recurrents) ? mergedContext.objets_recurrents.length : 0} objets récurrents`
    );

    return new Response(JSON.stringify({ global_context: mergedContext }), {
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