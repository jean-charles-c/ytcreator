import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { script, language } = await req.json();
    if (!script || typeof script !== "string" || script.trim().length < 100) {
      return new Response(JSON.stringify({ error: "Script trop court ou manquant." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const langLabel = { en: "English", fr: "French", es: "Spanish", de: "German" }[language || "en"] || "English";

    const systemPrompt = `You are a narrative structure analyst. You receive a complete YouTube documentary script written in ${langLabel}.

Your task is to identify the EXACT boundaries of 9 canonical narrative sections within this script. The script may contain [[TAG]] markers or may be unmarked.

The 9 sections IN ORDER:
1. hook — The opening mystery/intrigue. Abstract, conceptual, creates curiosity.
2. context — Transition to concrete context. Establishes time, place, people, situation.
3. promise — The teaser. What will the viewer learn by staying?
4. act1 — The origin story. How it began, the invention, the founding moment.
5. act2 — Escalation and expansion. Growth, spread, complexification. Usually the LONGEST section.
6. act3 — Impact and consequences. Real-world effects, new problems created.
7. climax — The revelation. Resolution of the central mystery, the "aha moment".
8. insight — The intellectual takeaway. The deeper meaning or principle.
9. conclusion — Final reflection. Broader perspective, lingering thought.

CRITICAL RULES:
- You MUST return ALL 9 sections.
- Each section contains the EXACT text from the script — do NOT rewrite, summarize, or modify ANY word.
- The concatenation of all 9 sections must reproduce the ENTIRE original script, preserving every character.
- Sections must follow the ORIGINAL order of the text — no reordering.
- Every paragraph of the script must belong to exactly ONE section.
- Split at paragraph boundaries (double newlines) — NEVER split mid-paragraph.
- If [[TAG]] markers are present, use them as boundaries and strip the tags from the content.
- If a section is not clearly present, assign it a minimal portion (at least 1 paragraph) to maintain the 9-section structure.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the complete script to analyze:\n\n${script}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "segment_script",
              description: "Segment a narrative script into 7 canonical sections by extracting the exact text for each section.",
              parameters: {
                type: "object",
                properties: {
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: {
                          type: "string",
                        enum: ["hook", "context", "promise", "act1", "act2", "act3", "climax", "insight", "conclusion"],
                          description: "The canonical section identifier",
                        },
                        content: {
                          type: "string",
                          description: "The EXACT text from the script belonging to this section. Must be copied verbatim — no modifications.",
                        },
                      },
                      required: ["key", "content"],
                      additionalProperties: false,
                    },
                    minItems: 9,
                    maxItems: 9,
                  },
                },
                required: ["sections"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "segment_script" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
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
      return new Response(JSON.stringify({ error: "Erreur du service d'analyse." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "segment_script") {
      console.error("No tool call in response:", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "L'analyse n'a pas retourné de segmentation valide." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { sections: { key: string; content: string }[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse tool call arguments:", toolCall.function.arguments?.slice(0, 500));
      return new Response(JSON.stringify({ error: "Réponse d'analyse invalide." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate: must have 7 sections with correct keys
    const expectedKeys = ["hook", "context", "promise", "act1", "act2", "act3", "climax", "insight", "conclusion"];
    const resultKeys = parsed.sections.map((s) => s.key);
    const valid = expectedKeys.every((k) => resultKeys.includes(k)) && parsed.sections.length === 9;

    if (!valid) {
      console.error("Invalid section keys:", resultKeys);
      return new Response(JSON.stringify({ error: "L'analyse a retourné une structure invalide." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reorder to canonical order
    const ordered = expectedKeys.map((key) => {
      const section = parsed.sections.find((s) => s.key === key)!;
      return { key: section.key, content: (section.content || "").trim() };
    });

    return new Response(JSON.stringify({ sections: ordered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-script error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
