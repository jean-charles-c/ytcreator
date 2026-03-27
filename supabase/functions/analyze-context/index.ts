import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      return new Response(JSON.stringify({ error: "Script trop court pour analyse contextuelle (min 100 caractères)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langMap: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
    const langLabel = langMap[project.script_language] || "English";

    const systemPrompt = `You are a script analysis engine. You receive a complete YouTube documentary/narrative script written in ${langLabel}.

Your task is to analyze the ENTIRE script and return a JSON object (ContexteGlobal) that captures the essential reference information.

ALL OUTPUT FIELDS MUST BE IN FRENCH regardless of the script language.

RULES:
- Only extract information that is EXPLICITLY present or CLEARLY inferable from the script text.
- Do NOT invent characters, locations, or time periods that are not supported by the text.
- If a field cannot be determined, use "Non déterminé" rather than guessing.
- Be precise and concise in your descriptions.

RECURRING OBJECTS DETECTION (CRITICAL):
- Identify any object, vehicle, building, artifact, or weapon that appears or is referenced across MULTIPLE scenes/sections of the script.
- For each recurring object, provide:
  - "id": a unique string like "obj-" followed by a short hash
  - "nom": precise name (brand + model + year/version if applicable)
  - "type": one of "vehicle", "building", "artifact", "weapon", "object"
  - "description_visuelle": detailed visual description of its distinctive physical characteristics
  - "epoque": era or version of the object
  - "mentions_scenes": array of scene numbers where mentioned (estimate if needed)
  - "identity_prompt": a VEHICLE/BUILDING/ARTIFACT IDENTITY LOCK prompt that strictly locks the visual identity across all images
- If no recurring objects are found, return an empty array.

You MUST return ONLY valid JSON with this exact structure:
{
  "sujet_principal": "string",
  "lieu_principal": "string",
  "epoque": "string",
  "personnages": [{"nom": "string", "role": "string"}],
  "nombre_personnages": number,
  "contexte_narratif": "string (2-3 phrases)",
  "resume_narratif": "string (2-3 phrases)",
  "ton": "string",
  "ambiance": "string",
  "type_decor": "string",
  "marqueurs_culturels": "string",
  "niveau_technologique": "string",
  "indices_visuels": ["string"],
  "type_narration": "string",
  "objets_recurrents": [{"id":"string","nom":"string","type":"string","description_visuelle":"string","epoque":"string","mentions_scenes":[number],"identity_prompt":"string"}]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.15,
        max_tokens: 16384,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyse ce script complet et extrais le ContexteGlobal en JSON.\n\nTitre du projet : ${project.title || "Sans titre"}\nSujet : ${project.subject || "Non précisé"}\n\n--- SCRIPT ---\n${narration}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans quelques instants." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits AI épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error: " + response.status);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    const finishReason = aiData.choices?.[0]?.finish_reason;

    console.log(`AI response: finish_reason=${finishReason}, content_length=${content?.length || 0}`);

    if (!content) {
      console.error("No content in AI response:", JSON.stringify(aiData).slice(0, 500));
      throw new Error("L'analyse n'a pas retourné de contexte valide");
    }

    let globalContext: Record<string, unknown>;
    try {
      // Robust JSON extraction
      let cleaned = content
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      // Find JSON boundaries
      const jsonStart = cleaned.search(/[\{\[]/);
      if (jsonStart === -1) throw new Error("No JSON found");
      cleaned = cleaned.substring(jsonStart);

      // If JSON is truncated (finish_reason=length), try to repair it
      // Count unmatched braces/brackets and close them
      let braces = 0, brackets = 0, inString = false, escapeNext = false;
      for (const ch of cleaned) {
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === '\\' && inString) { escapeNext = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') braces++;
        else if (ch === '}') braces--;
        else if (ch === '[') brackets++;
        else if (ch === ']') brackets--;
      }

      // Remove any trailing incomplete key-value (after last comma in truncated JSON)
      if (braces > 0 || brackets > 0) {
        console.log(`JSON truncated: ${braces} unclosed braces, ${brackets} unclosed brackets — repairing`);
        // Remove trailing incomplete value after last complete entry
        cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/s, "");
        // Close arrays then objects
        cleaned += "]".repeat(Math.max(0, brackets)) + "}".repeat(Math.max(0, braces));
      }

      // Fix common LLM JSON issues
      cleaned = cleaned
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/[\x00-\x1F\x7F]/g, "");

      globalContext = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse JSON response (length=" + content.length + "):", content.slice(0, 1500));
      console.error("Parse error:", parseErr);
      throw new Error("Réponse d'analyse contextuelle invalide");
    }

    // Validate required fields
    const requiredFields = ["sujet_principal", "lieu_principal", "epoque", "personnages", "contexte_narratif"];
    for (const field of requiredFields) {
      if (!globalContext[field]) globalContext[field] = "Non déterminé";
    }
    if (!Array.isArray(globalContext.personnages)) globalContext.personnages = [];
    globalContext.nombre_personnages = (globalContext.personnages as any[]).length;
    if (!Array.isArray(globalContext.objets_recurrents)) globalContext.objets_recurrents = [];

    console.log(`ContexteGlobal built: ${(globalContext.personnages as any[]).length} personnages, ${(globalContext.objets_recurrents as any[]).length} objets récurrents, lieu="${globalContext.lieu_principal}", époque="${globalContext.epoque}"`);

    // Persist
    const { error: upsertErr } = await sb
      .from("project_scriptcreator_state")
      .upsert({ project_id, global_context: globalContext }, { onConflict: "project_id" });

    if (upsertErr) console.error("Failed to persist global_context:", upsertErr);

    return new Response(JSON.stringify({ global_context: globalContext }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-context error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
