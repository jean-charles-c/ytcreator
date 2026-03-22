import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ═══════════════════════════════════════════════════════════════════
 * SEGMENTATION PIPELINE v3 — Two-Pass Narrative-Action-Based
 * ═══════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE:
 * ─────────────
 * Pass 1 — NarrativeActionPass:
 *   The AI reads the FULL narration and identifies distinct narrative
 *   actions / beats / visual moments. Each action is described with
 *   a short label and the approximate text span it covers.
 *
 * Pass 2 — SceneAssemblyPass:
 *   Using the identified actions, the AI groups the original sentences
 *   into SceneBlocks. Each SceneBlock maps to ONE narrative action and
 *   contains ALL sentences that belong to that continuous action.
 *
 * SEGMENTATION RULES (Narrative-Action-Based):
 * ─────────────────────────────────────────────
 * R1: New scene when a NEW ACTION begins (physical or mental)
 * R2: New scene when the FOCUS/SUBJECT changes
 * R3: New scene when the LOCATION changes
 * R4: New scene when TIME shifts (ellipsis, flashback, flash-forward)
 * R5: New scene when the NARRATIVE INTENT changes (inform→move, expose→argue)
 * R6: SAME SCENE if multiple sentences describe ONE continuous action
 * R7: NO micro-scenes — a single sentence is only a scene if it's an autonomous narrative beat
 *
 * A scene MAY contain 1, 2, 3, 5, or more sentences if they belong
 * to the same continuous action. The number of sentences is NOT a
 * segmentation criterion. Target: ~30-50% fewer scenes than word-count-based pipeline.
 *
 * SceneBlock JSON Contract:
 * ─────────────────────────
 * {
 *   title:             string   — Short descriptive title (max 10 words)
 *   source_text:       string   — Faithful verbatim extract from the original narration
 *   source_text_fr?:   string   — French translation (required when script language ≠ "fr")
 *   visual_intention:  string   — Topic summary in FRENCH (what the scene is about)
 *   narrative_action:  string   — The core narrative action or beat of this scene
 *   characters:        string   — Characters/subjects present (comma-separated, or "none")
 *   location:          string   — Setting/place described (or "unspecified")
 *   scene_type:        string   — One of: "action" | "description" | "dialogue" | "transition" | "exposition"
 *   continuity:        string   — "new" | "continues" | "develops"
 * }
 *
 * COVERAGE: The CoverageValidation (isCompleteSegmentation) is unchanged.
 * ═══════════════════════════════════════════════════════════════════
 */

const VALID_SCENE_TYPES = ["action", "description", "dialogue", "transition", "exposition"];
const VALID_CONTINUITY = ["new", "continues", "develops"];

function validateSceneBlock(raw: Record<string, unknown>, index: number): {
  title: string;
  source_text: string;
  source_text_fr?: string;
  visual_intention: string;
  narrative_action: string;
  characters: string;
  location: string;
  scene_type: string;
  continuity: string;
} {
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

  const scene_type_raw = str(raw.scene_type, "description").toLowerCase();
  const continuity_raw = str(raw.continuity, index === 0 ? "new" : "continues").toLowerCase();

  return {
    title: str(raw.title, `Scene ${index + 1}`),
    source_text: str(raw.source_text, ""),
    ...(raw.source_text_fr ? { source_text_fr: str(raw.source_text_fr, "") } : {}),
    visual_intention: str(raw.visual_intention, "Non spécifié"),
    narrative_action: str(raw.narrative_action, "Non spécifié"),
    characters: str(raw.characters, "none"),
    location: str(raw.location, "unspecified"),
    scene_type: VALID_SCENE_TYPES.includes(scene_type_raw) ? scene_type_raw : "description",
    continuity: VALID_CONTINUITY.includes(continuity_raw) ? continuity_raw : (index === 0 ? "new" : "continues"),
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── JSON Parsing Utilities ───────────────────────────────────────

const repairAndParseJson = (raw: string): any => {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error("No JSON found in response");
  cleaned = cleaned.substring(jsonStart);

  try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
  try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

  const lastComplete = cleaned.lastIndexOf("},");
  if (lastComplete > 0) {
    cleaned = cleaned.substring(0, lastComplete + 1);
  }
  const ob = (cleaned.match(/{/g) || []).length;
  const cb = (cleaned.match(/}/g) || []).length;
  const oq = (cleaned.match(/\[/g) || []).length;
  const cq = (cleaned.match(/\]/g) || []).length;
  for (let i = 0; i < ob - cb; i++) cleaned += "}";
  for (let i = 0; i < oq - cq; i++) cleaned += "]";
  cleaned = cleaned.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");

  return JSON.parse(cleaned);
};

const parseFromAiResponse = (aiData: any) => {
  const message = aiData?.choices?.[0]?.message;
  console.log("AI finish_reason:", aiData?.choices?.[0]?.finish_reason);

  // Try tool_calls first
  const toolCalls = message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    let allArgs = "";
    for (const tc of toolCalls) {
      allArgs += tc?.function?.arguments || "";
    }
    if (allArgs) {
      try {
        const parsed = repairAndParseJson(allArgs);
        return parsed;
      } catch (e) {
        console.warn("Failed to parse tool_call arguments:", e);
      }
    }
  }

  // Try content fallback
  const content = message?.content || "";
  if (content) {
    try {
      return repairAndParseJson(content);
    } catch (e) {
      console.warn("Failed to parse content:", e);
    }
  }

  // Try function_call
  const functionCall = message?.function_call;
  if (functionCall?.arguments) {
    try {
      return repairAndParseJson(functionCall.arguments);
    } catch (e) {
      console.warn("Failed to parse function_call:", e);
    }
  }

  throw new Error("AI returned no usable data");
};

// ─── Coverage Validation (UNCHANGED) ─────────────────────────────

const normalizeForCoverage = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const isCompleteSegmentation = (
  originalNarration: string,
  segmentedScenes: { source_text: string }[]
) => {
  const original = normalizeForCoverage(originalNarration);
  const segmented = normalizeForCoverage(
    segmentedScenes.map((scene) => scene.source_text).join(" ")
  );

  if (!original || !segmented) return false;

  const originalWords = original.split(" ");
  const segmentedWords = segmented.split(" ");
  const headSample = originalWords.slice(0, 20).join(" ");
  const tailSample = originalWords.slice(-20).join(" ");
  const coverageRatio = segmentedWords.length / originalWords.length;

  return (
    coverageRatio >= 0.9 &&
    segmented.includes(headSample) &&
    segmented.includes(tailSample)
  );
};

// ─── AI Gateway Call ──────────────────────────────────────────────

const callAiGateway = async (
  apiKey: string,
  messages: { role: string; content: string }[],
  tools?: any[],
  toolChoice?: any,
  maxTokens = 16384,
  temperature = 0.2
) => {
  const body: Record<string, unknown> = {
    model: "google/gemini-2.5-flash",
    max_tokens: maxTokens,
    temperature,
    messages,
  };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const aiResponse = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    console.error("AI error:", aiResponse.status, errText);
    if (aiResponse.status === 429) throw new Error("RATE_LIMIT_EXCEEDED");
    if (aiResponse.status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error("AI gateway error");
  }

  return aiResponse.json();
};

// ─── Pass 1: NarrativeActionPass ─────────────────────────────────

const narrativeActionPass = async (apiKey: string, narrationText: string) => {
  console.log("=== Pass 1: NarrativeActionPass ===");

  const aiData = await callAiGateway(
    apiKey,
    [
      {
        role: "system",
        content: `You are a narrative structure analyst. Your job is to read a narration and identify the distinct NARRATIVE ACTIONS (beats) in it.

A narrative action is a coherent unit where:
- The SAME action or event is being described
- The SAME subject/character is the focus
- The SAME location is the setting
- The SAME time frame applies
- The SAME narrative intent is at play (informing, arguing, describing, transitioning, etc.)

RULES for identifying actions:
- Create a NEW action when: a new physical/mental action begins, the subject/focus changes, the location changes, time shifts, or the narrative intent changes.
- KEEP sentences in the SAME action if they describe one continuous event, even if there are many sentences.
- Do NOT create micro-actions for individual sentences that are part of the same continuous event.
- Aim for meaningful narrative beats, not sentence-by-sentence splitting.

Return a numbered list of actions with:
- action_id: sequential number
- label: short description of what happens (max 10 words)
- start_hint: first few words of where this action begins in the text
- end_hint: last few words of where this action ends in the text`
      },
      {
        role: "user",
        content: narrationText,
      },
    ],
    [
      {
        type: "function",
        function: {
          name: "identify_actions",
          description: "Identifies the distinct narrative actions/beats in a narration.",
          parameters: {
            type: "object",
            properties: {
              actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action_id: { type: "number" },
                    label: { type: "string" },
                    start_hint: { type: "string" },
                    end_hint: { type: "string" },
                  },
                  required: ["action_id", "label", "start_hint", "end_hint"],
                  additionalProperties: false,
                },
              },
            },
            required: ["actions"],
            additionalProperties: false,
          },
        },
      },
    ],
    { type: "function", function: { name: "identify_actions" } },
    8192,
    0.2
  );

  const parsed = parseFromAiResponse(aiData);
  const actions = Array.isArray(parsed) ? parsed : parsed?.actions;

  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error("Pass 1 returned no actions");
  }

  console.log(`Pass 1 identified ${actions.length} narrative actions`);
  return actions;
};

// ─── Pass 2: SceneAssemblyPass ───────────────────────────────────

const sceneAssemblyPass = async (
  apiKey: string,
  narrationText: string,
  actions: any[],
  scriptLanguage: string,
  needsFrenchTranslation: boolean
) => {
  console.log("=== Pass 2: SceneAssemblyPass ===");

  const actionsDescription = actions
    .map((a: any) => `Action ${a.action_id}: "${a.label}" (from: "${a.start_hint}" → to: "${a.end_hint}")`)
    .join("\n");

  const aiData = await callAiGateway(
    apiKey,
    [
      {
        role: "system",
        content: `You are a documentary narration segmentation engine.
The narration language is: ${scriptLanguage}.

You have already identified the following narrative actions in this text:
${actionsDescription}

Now, construct SceneBlocks by assigning the ORIGINAL TEXT to each action.

ABSOLUTE RULES:
1. Cover the FULL narration from first word to last word. Do not skip any part.
2. Keep every word from the original narration; do not add, summarize, paraphrase, or remove text.
3. Preserve exact narrative order.
4. Each SceneBlock corresponds to ONE narrative action. A scene can contain ANY number of sentences — as many as needed to cover the full action. Do NOT split a continuous action into multiple scenes.
5. If two consecutive actions are very short and closely related, you MAY merge them into one scene. Use your judgment.
6. Generate visual_intention in FRENCH regardless of narration language. It describes the TOPIC of the scene, not a visual description.
7. Generate narrative_action: what is the core narrative beat or event.
8. Generate characters, location, scene_type, and continuity for each scene.
${needsFrenchTranslation ? `9. **MANDATORY**: Provide "source_text_fr" for EVERY scene: a faithful French translation of source_text. This field is REQUIRED.` : "9. The narration is already in French. Do NOT include source_text_fr."}

Return data via the segment_narration tool call only.`
      },
      {
        role: "user",
        content: narrationText,
      },
    ],
    [
      {
        type: "function",
        function: {
          name: "segment_narration",
          description: "Segments narration into SceneBlocks based on identified narrative actions.",
          parameters: {
            type: "object",
            properties: {
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    source_text: { type: "string" },
                    ...(needsFrenchTranslation ? { source_text_fr: { type: "string", description: "REQUIRED: French translation of source_text." } } : {}),
                    visual_intention: { type: "string", description: "Topic summary in FRENCH" },
                    narrative_action: { type: "string" },
                    characters: { type: "string" },
                    location: { type: "string" },
                    scene_type: { type: "string", enum: VALID_SCENE_TYPES },
                    continuity: { type: "string", enum: VALID_CONTINUITY },
                  },
                  required: [
                    "title", "source_text",
                    ...(needsFrenchTranslation ? ["source_text_fr"] : []),
                    "visual_intention", "narrative_action",
                    "characters", "location", "scene_type", "continuity",
                  ],
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
    { type: "function", function: { name: "segment_narration" } },
    16384,
    0.2
  );

  const parsed = parseFromAiResponse(aiData);
  const scenes = Array.isArray(parsed) ? parsed : parsed?.scenes;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error("Pass 2 returned no scenes");
  }

  console.log(`Pass 2 assembled ${scenes.length} SceneBlocks from ${actions.length} actions`);
  return scenes.map((raw: Record<string, unknown>, idx: number) =>
    validateSceneBlock(raw, idx)
  );
};

// ─── Chunked Processing for Long Texts ───────────────────────────
//
// Strategy for inter-chunk continuity:
// 1. Chunks overlap: each chunk includes the last ~100 words of the
//    previous chunk as "context prefix" so the AI sees the ongoing action.
// 2. The AI is told to mark the first scene as continuity="continues"
//    if the text starts mid-action.
// 3. After all chunks are processed, a merge pass fuses adjacent scenes
//    at chunk boundaries when they share the same narrative action.

const splitIntoParagraphs = (text: string): string[] => {
  return text.split(/\n\n+/).filter(p => p.trim().length > 0);
};

/**
 * Build overlapping chunks from paragraphs.
 * Each chunk targets ~1000 words of NEW content.
 * The overlap is the last paragraph(s) of the previous chunk (~100-150 words)
 * so the AI has context of the ongoing action.
 */
const buildOverlappingChunks = (paragraphs: string[]): { text: string; overlapWordCount: number }[] => {
  const TARGET_WORDS = 1000;
  const OVERLAP_WORDS = 120;

  const chunks: { text: string; overlapWordCount: number }[] = [];
  let i = 0;

  while (i < paragraphs.length) {
    let chunkParagraphs: string[] = [];
    let overlapParagraphs: string[] = [];
    let overlapWordCount = 0;
    let wordCount = 0;

    // Add overlap from previous chunk's tail
    if (chunks.length > 0 && i > 0) {
      let oi = i - 1;
      const overlapCandidates: string[] = [];
      let ow = 0;
      while (oi >= 0 && ow < OVERLAP_WORDS) {
        overlapCandidates.unshift(paragraphs[oi]);
        ow += paragraphs[oi].split(/\s+/).filter(Boolean).length;
        oi--;
      }
      overlapParagraphs = overlapCandidates;
      overlapWordCount = ow;
    }

    // Add new paragraphs until we hit the target
    while (i < paragraphs.length && wordCount < TARGET_WORDS) {
      const pWords = paragraphs[i].split(/\s+/).filter(Boolean).length;
      chunkParagraphs.push(paragraphs[i]);
      wordCount += pWords;
      i++;
    }

    const fullText = [...overlapParagraphs, ...chunkParagraphs].join("\n\n");
    chunks.push({ text: fullText.trim(), overlapWordCount });
  }

  return chunks;
};

const processChunk = async (
  apiKey: string,
  chunkText: string,
  overlapWordCount: number,
  isFirstChunk: boolean,
  scriptLanguage: string,
  needsFrenchTranslation: boolean
) => {
  const actions = await narrativeActionPass(apiKey, chunkText);
  const scenes = await sceneAssemblyPass(apiKey, chunkText, actions, scriptLanguage, needsFrenchTranslation);

  // If there's overlap, remove scenes whose source_text is entirely within the overlap zone.
  // The overlap is the first ~overlapWordCount words of chunkText.
  if (!isFirstChunk && overlapWordCount > 0 && scenes.length > 0) {
    const chunkWords = chunkText.split(/\s+/).filter(Boolean);
    const overlapText = normalizeForCoverage(chunkWords.slice(0, overlapWordCount).join(" "));

    // Drop leading scenes that fall entirely within the overlap
    while (scenes.length > 1) {
      const sceneNorm = normalizeForCoverage(scenes[0].source_text);
      // If the scene text is fully contained in the overlap prefix, it's a duplicate
      if (overlapText.includes(sceneNorm)) {
        console.log(`Dropping overlap-duplicate scene: "${scenes[0].title}"`);
        scenes.shift();
      } else {
        break;
      }
    }
  }

  return scenes;
};

/**
 * Merge pass: fuse scenes at chunk boundaries when they describe the same action.
 * Two adjacent scenes are merged if:
 * - They have the same narrative_action (fuzzy match)
 * - OR the second scene has continuity="continues"
 * AND they are at a chunk boundary (indicated by boundaryIndices).
 */
const mergeChunkBoundaryScenes = (
  allScenes: ReturnType<typeof validateSceneBlock>[],
  boundaryIndices: number[]
): ReturnType<typeof validateSceneBlock>[] => {
  if (allScenes.length === 0 || boundaryIndices.length === 0) return allScenes;

  const result = [...allScenes];
  // Process boundaries in reverse order to preserve indices
  for (let b = boundaryIndices.length - 1; b >= 0; b--) {
    const idx = boundaryIndices[b];
    if (idx <= 0 || idx >= result.length) continue;

    const prev = result[idx - 1];
    const curr = result[idx];

    const shouldMerge =
      curr.continuity === "continues" ||
      normalizeForCoverage(prev.narrative_action) === normalizeForCoverage(curr.narrative_action);

    if (shouldMerge) {
      console.log(`Merging boundary scenes: "${prev.title}" + "${curr.title}"`);
      const merged: ReturnType<typeof validateSceneBlock> = {
        ...prev,
        source_text: prev.source_text + " " + curr.source_text,
        ...(prev.source_text_fr && curr.source_text_fr
          ? { source_text_fr: prev.source_text_fr + " " + curr.source_text_fr }
          : prev.source_text_fr ? { source_text_fr: prev.source_text_fr } : {}),
        title: prev.title,
        visual_intention: prev.visual_intention,
        narrative_action: prev.narrative_action,
        characters: prev.characters === curr.characters ? prev.characters
          : prev.characters === "none" ? curr.characters
          : curr.characters === "none" ? prev.characters
          : `${prev.characters}, ${curr.characters}`,
        location: prev.location === curr.location ? prev.location : prev.location,
        scene_type: prev.scene_type,
        continuity: prev.continuity,
      };
      result.splice(idx - 1, 2, merged);
    }
  }

  return result;
};

// ─── Main Handler ─────────────────────────────────────────────────

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

    const { project_id } = await req.json();
    if (!project_id) throw new Error("Missing project_id");

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) throw new Error("Project not found");
    if (!project.narration?.trim()) throw new Error("No narration to segment");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const narrationText = project.narration.trim()
      // Strip all [[TAG]] section markers that may remain from script generation
      .replace(/\[\[(HOOK|CONTEXT|PROMISE|ACT[123]|CLIMAX|INSIGHT|CONCLUSION)\]\]\s*/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const scriptLanguage = project.script_language || "en";
    const needsFrenchTranslation = scriptLanguage !== "fr";
    const wordCount = narrationText.split(/\s+/).filter(Boolean).length;

    console.log(`Starting two-pass segmentation: ${wordCount} words, language: ${scriptLanguage}`);

    let allScenes: ReturnType<typeof validateSceneBlock>[] = [];

    if (wordCount > 1500) {
      // ─── Chunked processing with overlap and boundary merging ───
      console.log(`Long narration (${wordCount} words). Processing in overlapping chunks.`);
      const paragraphs = splitIntoParagraphs(narrationText);
      const chunks = buildOverlappingChunks(paragraphs);

      console.log(`Split into ${chunks.length} overlapping chunks`);

      const boundaryIndices: number[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const { text, overlapWordCount } = chunks[i];
        const chunkWords = text.split(/\s+/).filter(Boolean).length;
        console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunkWords} words, overlap: ${overlapWordCount})`);

        if (i > 0) {
          boundaryIndices.push(allScenes.length); // mark where this chunk's scenes start
        }

        const chunkScenes = await processChunk(
          LOVABLE_API_KEY, text, overlapWordCount, i === 0,
          scriptLanguage, needsFrenchTranslation
        );
        allScenes.push(...chunkScenes);
      }

      // Merge scenes at chunk boundaries that share the same narrative action
      allScenes = mergeChunkBoundaryScenes(allScenes, boundaryIndices);
      console.log(`After boundary merge: ${allScenes.length} SceneBlocks`);
    } else {
      // ─── Single-text two-pass pipeline ───
      const actions = await narrativeActionPass(LOVABLE_API_KEY, narrationText);
      allScenes = await sceneAssemblyPass(LOVABLE_API_KEY, narrationText, actions, scriptLanguage, needsFrenchTranslation);

      // Coverage retry with stricter instructions
      if (!isCompleteSegmentation(narrationText, allScenes)) {
        console.warn("Incomplete segmentation. Retrying Pass 2 with strict mode.");
        allScenes = await sceneAssemblyPass(LOVABLE_API_KEY, narrationText, actions, scriptLanguage, needsFrenchTranslation);
      }
    }

    if (allScenes.length === 0) {
      throw new Error("Aucune scène générée. Veuillez réessayer.");
    }

    console.log(`Final result: ${allScenes.length} SceneBlocks (from ${wordCount} words)`);

    // Delete existing scenes
    await supabase.from("scenes").delete().eq("project_id", project_id);

    // Insert new scenes
    const sceneRows = allScenes.map((s, i) => ({
      project_id,
      scene_order: i + 1,
      title: s.title,
      source_text: s.source_text,
      source_text_fr: s.source_text_fr || null,
      visual_intention: s.visual_intention,
      narrative_action: s.narrative_action,
      characters: s.characters,
      location: s.location,
      scene_type: s.scene_type,
      continuity: s.continuity,
    }));

    const { error: insertErr } = await supabase.from("scenes").insert(sceneRows);
    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error("Failed to save scenes");
    }

    await supabase
      .from("projects")
      .update({ status: "segmented", scene_count: allScenes.length })
      .eq("id", project_id);

    return new Response(JSON.stringify({ scenes: sceneRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("segment-narration error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";

    if (message === "RATE_LIMIT_EXCEEDED") {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message === "PAYMENT_REQUIRED") {
      return new Response(
        JSON.stringify({ error: "Payment required. Please add credits." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
