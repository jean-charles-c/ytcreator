import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { objects, shots } = await req.json();

    if (!Array.isArray(objects) || !Array.isArray(shots)) {
      return new Response(JSON.stringify({ error: "objects and shots arrays required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (objects.length === 0 || shots.length === 0) {
      return new Response(JSON.stringify({ results: {} }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build a compact prompt for the AI
    const objectList = objects.map((o: any) => `- ID: "${o.id}" | Nom: "${o.nom}" | Type: ${o.type} | Description: ${o.description_visuelle || "N/A"}`).join("\n");

    const shotList = shots.map((s: any) => {
      const text = s.source_sentence || s.source_sentence_fr || s.description || "";
      return `- ShotID: "${s.id}" | Scène: ${s.scene_id} | Texte: "${text.slice(0, 300)}"`;
    }).join("\n");

    const systemPrompt = `Tu es un analyste textuel spécialisé dans l'identification d'entités (personnages, véhicules, lieux, objets) dans des phrases de script documentaire.

TÂCHE : Pour chaque objet/personnage récurrent fourni, identifie TOUS les shots où cet objet/personnage est mentionné, référencé, ou clairement impliqué dans la phrase.

RÈGLES :
- Fais une correspondance sémantique, pas juste lexicale. Ex: "la berlinette rouge" → Ferrari 250 GTO
- Inclus les références indirectes claires. Ex: "le pilote prend le volant" → le personnage pilote ET le véhicule
- Inclus les pronoms qui réfèrent clairement à l'objet. Ex: "elle file sur la piste" après mention d'une voiture
- N'inclus PAS les associations trop vagues ou spéculatives
- Analyse les textes en français ET en anglais`;

    const userPrompt = `OBJETS/PERSONNAGES RÉCURRENTS :
${objectList}

SHOTS À ANALYSER :
${shotList}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "assign_objects_to_shots",
              description: "Assigne les shots détectés pour chaque objet/personnage récurrent",
              parameters: {
                type: "object",
                properties: {
                  assignments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        object_id: { type: "string", description: "ID de l'objet récurrent" },
                        shot_ids: {
                          type: "array",
                          items: { type: "string" },
                          description: "Liste des IDs de shots où l'objet apparaît",
                        },
                      },
                      required: ["object_id", "shot_ids"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["assignments"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "assign_objects_to_shots" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requêtes atteinte, réessayez dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits insuffisants. Rechargez votre espace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error: " + response.status);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call in response");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    
    // Convert to a map: objectId -> shotIds
    const results: Record<string, string[]> = {};
    for (const assignment of parsed.assignments || []) {
      results[assignment.object_id] = assignment.shot_ids || [];
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-object-shots error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
