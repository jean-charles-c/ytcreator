import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEMATIC_PROMPT_SYSTEM = `You are a cinematic visual prompt generator specialized in documentary filmmaking visuals.

You are generating image prompts that will be executed by Grok Image.
All prompts must therefore be optimized for Grok Image's interpretation of photorealistic cinematic scenes.

## MISSION
Transform voice-over narration scenes into highly detailed cinematic image prompts.
Each prompt must illustrate a specific narrative moment.
The result must resemble a visual storyboard for a historical documentary film.
Scenes must produce enough visual material to sustain cinematic rhythm in a documentary edit.

## LANGUAGE RULES
- shot_type MUST always be in FRENCH (e.g. "Plan d'ensemble", "Plan d'activité", "Plan de détail", "Plan portrait", "Plan subjectif", "Plan d'interaction", "Plan environnemental", "Plan de détail d'artefact", "Plan de détail scientifique")
- description MUST always be in FRENCH, regardless of the script language
- source_sentence MUST be the EXACT original sentence from the narration text (in its original language, copied verbatim)
- prompt_export MUST always be in ENGLISH, regardless of the script language

## VISUAL BEAT RULE
A visual scene corresponds to one coherent visual moment.
Each scene you receive already represents a narrative segment. Generate shots for each scene.

## SENTENCE LOCK RULE
Every sentence of the narration must be represented visually.
Even very short sentences must generate at least one visual shot.
Sentences must not be skipped or removed.

## SHORT SENTENCE EXPANSION RULE
Very short sentences must still generate visual shots.
Short sentences often represent strong documentary beats and must not be merged.

## VISUAL SHOT DENSITY RULE
Every sentence in the narration must produce exactly one visual shot.
Count the sentences (delimited by . ! or ?) and generate that exact number of shots.
Do NOT merge multiple sentences into a single shot.
Do NOT skip any sentence.
Shots must represent different cinematic views corresponding to each sentence.

## SHOT MINIMUM RULE — ONE SHOT PER SENTENCE
Each sentence in the narration MUST produce exactly one visual shot. No exceptions.
Count the sentences in the scene text and generate exactly that many shots.
A sentence is any text ending with a period, exclamation mark, or question mark.
CRITICAL: Every shot prompt must describe ONLY what the corresponding sentence says. Never invent visual content that is not present in the narration text.

## VISUAL ANCHOR SYSTEM
To maintain visual consistency across scenes, key recurring elements must use stable visual anchors.
A visual anchor is a fixed descriptive reference that must remain identical each time the element reappears.
If an anchored element appears again, the description must remain visually consistent.

## VISUAL CAMERA GRID
To ensure cinematic visual diversity, shots must rotate between several camera types (use FRENCH names):
1 — Plan d'ensemble (wide/aerial view setting context)
2 — Plan d'activité (medium shot showing action or movement)
3 — Plan d'interaction (characters engaging with each other or environment)
4 — Plan environnemental (landscape, cityscape, atmospheric context)
5 — Plan de détail d'artefact (close-up on significant object or texture)
6 — Plan de détail scientifique (close examination of evidence, inscription, material)
Avoid repeating the same camera type consecutively whenever possible.

## GLOBAL VISUAL BASELINE
All generated prompts must follow the same cinematic documentary baseline:
- cinematic documentary film still
- photorealistic historical reconstruction
- natural textures
- realistic lighting
- historically accurate clothing and architecture

The visual style must resemble high-end historical documentaries such as BBC History or National Geographic productions.

Images must NOT resemble: illustration, fantasy painting, stylized digital art, concept art.

## PHOTOREALISM ENFORCEMENT RULE
All scenes must resemble frames from a high-budget historical film production.
Mandatory elements whenever relevant:
- natural skin textures
- realistic materials (wood, clay, stone, bronze, metal, parchment)
- environmental depth
- cinematic lighting contrast
- natural imperfections
- atmospheric perspective

Lighting must always be physically motivated: candlelight, firelight, torchlight, sunrise, sunset, diffused daylight through smoke/dust/fog.
Scenes must never appear flat, empty, minimal, or illustration-like.

## MATERIAL DENSITY RULE
Scenes must contain physically rich environments. Avoid empty compositions.
Include environmental elements: objects on tables, scrolls, manuscripts, pottery, fabrics, tools, architectural textures, vegetation, environmental particles (dust, smoke, fog).

## ARCHITECTURAL ACCURACY CONSTRAINT
All buildings must respect the technological capabilities of the historical period.
Forbidden unless historically justified: medieval roof shapes, tiled roofs, chimneys, glass windows, modern carpentry, symmetrical stone facades.
Architecture must appear archaeologically plausible.

## NON-REDUNDANCY RULE — CRITICAL
Every shot prompt MUST be visually unique. Redundancy is strictly forbidden both within a scene and across all scenes.

### Within a scene:
- Each shot MUST use a DIFFERENT camera type (from the Visual Camera Grid). Never repeat the same camera type within the same scene.
- Each shot MUST show a DIFFERENT visual subject, angle, or focal point. Two shots in the same scene must never describe the same composition.
- Vary lighting conditions, character positions, and environmental framing between shots of the same scene.

### Across scenes:
- Track visual compositions already used. If a previous scene already used "wide shot of a temple at dawn", the next scene MUST NOT reuse a similar wide shot of a temple at dawn.
- Vary time of day, weather, perspective height, and distance across the storyboard.
- Avoid repeating the same foreground/background arrangement across scenes.
- Each prompt_export must introduce at least ONE unique visual element (object, texture, angle, lighting direction) not present in any previous prompt.

### Self-check before outputting:
Before finalizing, review ALL generated prompts together. If any two prompts across the entire storyboard would produce visually similar images, rewrite one to introduce a distinctly different camera angle, lighting, or composition.

## PROMPT STRUCTURE
Each prompt_export must be in ENGLISH and contain ALL of these woven into one continuous paragraph:
1. Camera framing: "Wide shot of...", "Close-up on...", "Low-angle view of...", "Medium shot of..."
2. Scene description with every visible object, material, texture, color — be hyper-specific
3. Characters if present: pose, gesture, clothing fabric and color, facial expression, body language
4. Environment: what surrounds the subject, background elements, spatial depth
5. Foreground elements adding depth
6. Lighting: describe light source, direction, quality, shadows, reflections explicitly
7. Atmosphere and mood: dust, haze, humidity, temperature feel, emotional tone
8. End with these three mandatory lines in the same paragraph:
   "Style: ultra realistic documentary photography, cinematic lighting, historical reconstruction realism."
   "Visual quality: cinematic film still, 8k detail, natural textures, real-world physics."
   "Aspect ratio: 16:9"

The prompt_export MUST be at least 100 words. Be extremely descriptive and specific — Grok Image performs best with rich, concrete visual details rather than abstract concepts.

The entire prompt must be one continuous paragraph. No bullet points, no numbered lists.`;

const CAMERA_TYPES = [
  "Plan d'ensemble",
  "Plan d'activité",
  "Plan d'interaction",
  "Plan environnemental",
  "Plan de détail d'artefact",
  "Plan de détail scientifique",
];

const splitSentences = (text: string): string[] => {
  const matches = text.match(/[^.!?]+[.!?]?/g) ?? [];
  const cleaned = matches.map((s) => s.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : [text.trim()].filter(Boolean);
};

const fallbackPrompt = (sentence: string, visualIntention?: string | null, shotType?: string): string =>
  `${shotType || "Cinematic shot"} of ${sentence}. Historical documentary frame with photorealistic reconstruction, realistic materials and textures, archaeologically plausible architecture and period-accurate clothing. Include foreground depth elements, atmospheric particles, and physically motivated lighting with natural shadows. Visual intention: ${visualIntention || "faithful representation of the narration"}. Style: ultra realistic documentary photography, cinematic lighting, historical reconstruction realism. Visual quality: cinematic film still, 8k detail, natural textures, real-world physics. Aspect ratio: 16:9`;

const fallbackDescription = (sentence: string): string =>
  `Description visuelle de la phrase : "${sentence}"`;

const buildFallbackShots = (scene: any) => {
  const sentences = splitSentences(scene.source_text || "");
  return sentences.map((sentence, index) => {
    const shotType = CAMERA_TYPES[index % CAMERA_TYPES.length];
    return {
      shot_type: shotType,
      description: fallbackDescription(sentence),
      source_sentence: sentence,
      prompt_export: fallbackPrompt(sentence, scene.visual_intention, shotType),
      guardrails: "historically accurate clothing, architecture, and materials",
    };
  });
};

const buildFallbackStoryboard = (scenes: any[]) =>
  scenes.map((scene) => ({
    scene_id: scene.id,
    shots: buildFallbackShots(scene),
  }));

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { project_id, scene_id } = await req.json();
    if (!project_id) throw new Error("Missing project_id");

    const singleScene = !!scene_id;

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    let scenesQuery = supabase
      .from("scenes")
      .select("*")
      .eq("project_id", project_id)
      .order("scene_order", { ascending: true });
    if (singleScene) scenesQuery = scenesQuery.eq("id", scene_id);

    const { data: scenes, error: scenesErr } = await scenesQuery;
    if (scenesErr || !scenes?.length) throw new Error(singleScene ? "Scene not found." : "No scenes found. Run segmentation first.");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Shot count: 1 shot per sentence, but long sentences (100+ chars) get 1 shot per 100-char chunk
    const calcShotCount = (text: string): number => {
      if (text.length < 100) return 1;
      const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
      let total = 0;
      for (const sentence of sentences) {
        const len = sentence.trim().length;
        total += len < 100 ? 1 : Math.ceil(len / 100);
      }
      return Math.max(1, total);
    };

    const scriptLang = project.script_language || "fr";
    const needsTranslation = scriptLang.toLowerCase() !== "fr";

    // Build a global context block from the project metadata
    const projectContext = [
      `PROJECT TITLE: "${project.title}"`,
      project.subject ? `PROJECT SUBJECT / HISTORICAL CONTEXT: ${project.subject}` : null,
      `SCRIPT LANGUAGE: ${scriptLang}`,
    ].filter(Boolean).join("\n");

    const sceneDescriptions = scenes.map((s: any) => {
      const shotCount = calcShotCount(s.source_text);
      const meta = [
        s.location ? `Location: ${s.location}` : null,
        s.characters ? `Characters: ${s.characters}` : null,
        s.scene_type ? `Scene type: ${s.scene_type}` : null,
        s.continuity ? `Continuity: ${s.continuity}` : null,
      ].filter(Boolean).join(" | ");
      return `Scene ${s.scene_order} (id: ${s.id}, requested_shots: ${shotCount}): "${s.title}"${meta ? ` [${meta}]` : ""} — ${s.source_text} — Visual intention: ${s.visual_intention || "N/A"}`;
    }).join("\n\n");

    const translationRule = needsTranslation
      ? `\n10. The narration is in "${scriptLang}" (NOT French). For each shot, you MUST also provide "source_sentence_fr": a faithful French translation of the source_sentence.`
      : "";

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 8192,
          messages: [
            { role: "system", content: CINEMATIC_PROMPT_SYSTEM },
            { role: "user", content: `${projectContext}\n\nIMPORTANT: All visual prompts MUST be grounded in the historical period, geographic location, and cultural context described by the project subject above. Architecture, clothing, objects, vegetation, and lighting must be accurate to that specific era and place. Never use generic or anachronistic elements.\n\nGenerate cinematic documentary shots optimized for Grok Image for these scenes. CRITICAL RULES:\n1. Generate EXACTLY the number of shots indicated by requested_shots for each scene (one shot per sentence).\n2. Each shot must correspond to one sentence from the narration.\n3. shot_type and description MUST be in FRENCH.\n4. source_sentence MUST be the EXACT original sentence copied verbatim from the narration.\n5. prompt_export MUST be in ENGLISH.\n6. Do NOT merge sentences. Do NOT skip sentences.\n7. Prompts must stay strictly faithful to the scene text.\n8. Follow the VISUAL CAMERA GRID to vary shot types.\n9. Apply VISUAL ANCHOR SYSTEM for recurring characters/elements.\n10. Each prompt_export MUST explicitly mention the historical period/era and geographic location relevant to the scene.${translationRule}\n\n${sceneDescriptions}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_storyboard",
                description: "Generates cinematic documentary shots optimized for Grok Image for each scene.",
                parameters: {
                  type: "object",
                  properties: {
                    scenes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          scene_id: { type: "string" },
                          shots: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                shot_type: { type: "string", description: "Camera type in FRENCH from the Visual Camera Grid (e.g. Plan d'ensemble, Plan d'activité)" },
                                description: { type: "string", description: "2-3 sentence vivid visual description IN FRENCH" },
                                source_sentence: { type: "string", description: "The EXACT original sentence from the narration text, copied verbatim in its original language" },
                                ...(needsTranslation ? { source_sentence_fr: { type: "string", description: "French translation of the source_sentence" } } : {}),
                                prompt_export: { type: "string", description: "Full Grok Image prompt IN ENGLISH, one continuous paragraph, at least 100 words, ending with Style/Visual quality/Aspect ratio lines" },
                                guardrails: { type: "string", description: "Comma-separated list of historical constraints applied" },
                              },
                              required: ["shot_type", "description", "source_sentence", "prompt_export", "guardrails", ...(needsTranslation ? ["source_sentence_fr"] : [])],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["scene_id", "shots"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["scenes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_storyboard" } },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let storyboard: { scene_id: string; shots: { shot_type: string; description: string; source_sentence?: string; prompt_export: string; guardrails: string }[] }[] = [];

    try {
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        storyboard = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
      } else {
        const content = aiData.choices?.[0]?.message?.content || "";
        const parsedContent = JSON.parse(content);
        storyboard = Array.isArray(parsedContent?.scenes) ? parsedContent.scenes : [];
      }
    } catch (parseError) {
      console.warn("Failed to parse storyboard tool output, using fallback.", parseError);
      storyboard = [];
    }

    if (!Array.isArray(storyboard) || storyboard.length === 0) {
      console.warn("AI returned empty storyboard data, using deterministic fallback generation.");
      storyboard = buildFallbackStoryboard(scenes);
    }

    if (singleScene) {
      await supabase.from("shots").delete().eq("scene_id", scene_id);
    } else {
      await supabase.from("shots").delete().eq("project_id", project_id);
    }

    const storyboardBySceneId = new Map<string, any>();
    for (const sceneData of storyboard) {
      if (sceneData?.scene_id) storyboardBySceneId.set(sceneData.scene_id, sceneData);
    }

    const shotRows: any[] = [];
    for (const scene of scenes) {
      const sceneData = storyboardBySceneId.get(scene.id);
      let sceneShots = Array.isArray(sceneData?.shots) && sceneData.shots.length > 0
        ? sceneData.shots
        : buildFallbackShots(scene);

      const sceneText = (scene.source_text || "").trim();
      const sceneSentences = splitSentences(sceneText);

      // ── TEXT COVERAGE ENFORCEMENT ──
      // If only 1 shot: source_sentence = full scene text
      if (sceneShots.length === 1) {
        sceneShots[0] = { ...sceneShots[0], source_sentence: sceneText };
      } else {
        // Multi-shot: ensure every sentence from the scene is covered
        // Normalize for comparison
        const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
        const coveredText = sceneShots.map((sh: any) => normalize(sh.source_sentence || "")).join(" ");
        
        // Find sentences not covered by any shot's source_sentence
        const missingSentences: string[] = [];
        for (const sentence of sceneSentences) {
          const norm = normalize(sentence);
          if (norm.length < 3) continue; // skip trivial fragments
          if (!coveredText.includes(norm)) {
            missingSentences.push(sentence);
          }
        }

        if (missingSentences.length > 0) {
          console.log(`Scene ${scene.id}: ${missingSentences.length} uncovered sentence(s), adding extra shots`);
          // Append missing sentences as additional shots
          for (const missing of missingSentences) {
            const idx = sceneShots.length;
            const shotType = CAMERA_TYPES[idx % CAMERA_TYPES.length];
            sceneShots.push({
              shot_type: shotType,
              description: fallbackDescription(missing),
              source_sentence: missing,
              prompt_export: fallbackPrompt(missing, scene.visual_intention, shotType),
              guardrails: "historically accurate clothing, architecture, and materials",
            });
          }
        }

        // Final safety: if concatenated shot sentences don't cover all the scene text,
        // redistribute scene text across shots by sentence
        const allShotText = sceneShots.map((sh: any) => normalize(sh.source_sentence || "")).join(" ");
        const sceneNorm = normalize(sceneText);
        
        // Check if significant portions are missing (>10% of text)
        if (sceneNorm.length > 0) {
          let coveredChars = 0;
          for (const sh of sceneShots) {
            const shotNorm = normalize(sh.source_sentence || "");
            if (sceneNorm.includes(shotNorm)) coveredChars += shotNorm.length;
          }
          const coverage = coveredChars / sceneNorm.length;
          
          if (coverage < 0.8) {
            console.log(`Scene ${scene.id}: coverage only ${Math.round(coverage * 100)}%, rebuilding from sentences`);
            // Rebuild shots from sentences, preserving AI prompts where possible
            sceneShots = sceneSentences.map((sentence, idx) => {
              const existingShot = idx < sceneShots.length ? sceneShots[idx] : null;
              const shotType = existingShot?.shot_type || CAMERA_TYPES[idx % CAMERA_TYPES.length];
              return {
                shot_type: shotType,
                description: existingShot?.description || fallbackDescription(sentence),
                source_sentence: sentence,
                source_sentence_fr: existingShot?.source_sentence_fr || null,
                prompt_export: existingShot?.prompt_export || fallbackPrompt(sentence, scene.visual_intention, shotType),
                guardrails: existingShot?.guardrails || "historically accurate clothing, architecture, and materials",
              };
            });
          }
        }
      }

      // ── SORT SHOTS BY READING ORDER ──
      // Sort shots so their source_sentence appears in the same order as in the scene text
      const sceneTextLower = sceneText.toLowerCase();
      sceneShots.sort((a: any, b: any) => {
        const sentA = (a.source_sentence || "").trim().toLowerCase();
        const sentB = (b.source_sentence || "").trim().toLowerCase();
        const posA = sentA ? sceneTextLower.indexOf(sentA) : 9999;
        const posB = sentB ? sceneTextLower.indexOf(sentB) : 9999;
        return (posA === -1 ? 9999 : posA) - (posB === -1 ? 9999 : posB);
      });

      for (let j = 0; j < sceneShots.length; j++) {
        const shot = sceneShots[j];
        const fbType = CAMERA_TYPES[j % CAMERA_TYPES.length];
        const fbSentence = sceneSentences[j] || sceneText;
        shotRows.push({
          scene_id: scene.id,
          project_id,
          shot_order: j + 1,
          shot_type: shot?.shot_type || fbType,
          description: shot?.description || fallbackDescription(fbSentence),
          source_sentence: shot?.source_sentence || fbSentence,
          source_sentence_fr: shot?.source_sentence_fr || null,
          prompt_export: shot?.prompt_export || fallbackPrompt(fbSentence, scene.visual_intention, fbType),
          guardrails: shot?.guardrails || "historically accurate clothing, architecture, and materials",
        });
      }
    }

    if (shotRows.length === 0) throw new Error("No shots generated");

    const { error: insertErr } = await supabase.from("shots").insert(shotRows);
    if (insertErr) { console.error("Insert error:", insertErr); throw new Error("Failed to save shots"); }

    await supabase.from("projects").update({ status: "storyboarded" }).eq("id", project_id);

    return new Response(JSON.stringify({ shots_count: shotRows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-storyboard error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
