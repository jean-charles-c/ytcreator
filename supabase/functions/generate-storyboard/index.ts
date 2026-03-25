import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSensitiveModeInstruction } from "../_shared/sensitive-mode.ts";
import { segmentSceneNarrative, getNarrativeSegments, computeNarrativeShotCount } from "../_shared/narrative-segmentation.ts";
import { validateAllocation, repairAllocation } from "../_shared/shot-allocation-validator.ts";
import { analyzeRedundancy, enforceCameraRotation } from "../_shared/visual-redundancy-detector.ts";

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
- source_sentence MUST be the EXACT original sentence OR exact sentence segment from the narration text (in its original language, copied verbatim)
- prompt_export MUST always be in ENGLISH, regardless of the script language

## VISUAL BEAT RULE
A visual scene corresponds to one coherent visual moment.
Each scene you receive already represents a narrative segment. Generate shots for each scene.

## SENTENCE LOCK RULE
Every sentence of the narration must be represented visually.
Even very short sentences must generate at least one visual shot.
Sentences must not be skipped or removed.
If a sentence is long, it must be split into consecutive exact segments that together reconstruct the full sentence in order.

## SHORT SENTENCE EXPANSION RULE
Very short sentences must still generate visual shots.
Short sentences often represent strong documentary beats and must not be merged.

## NARRATIVE SEGMENTATION RULE
Each scene is pre-segmented into narrative units (NarrativeUnits) based on sense, not character count.
The MANDATORY_shot_count reflects this narrative segmentation.
Each shot must correspond to exactly one narrative unit — an illustrable visual moment.
Do NOT merge multiple narrative units into one shot.
Do NOT split a single narrative unit across multiple shots.
If a sentence is short but represents a distinct beat, it must have its own shot.
If a sentence is long but carries a single coherent idea, it should remain one shot.

## SHOT SEGMENTATION RULE — CRITICAL
For long sentences, the ordered source_sentence values must partition the original sentence without overlap and without duplication.
Each shot must illustrate ONLY its own exact segment of narration, never the full long sentence if that sentence has been split.
CRITICAL: Every shot prompt must describe ONLY what the corresponding sentence or sentence segment says. Never invent visual content that is not present in the narration text.

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

## CONTEXTUAL PROMPT CONSTRUCTION — CRITICAL
Each prompt_export must be built from the SPECIFIC fragment it illustrates, NOT from the full scene text.

### Context injection rules:
1. ALWAYS start with the historical period + geographic location from the scene's CONTEXTE block
2. Include characters ONLY when the fragment mentions or implies people — do not inject character descriptions into landscape or object shots
3. Include ambiance/mood ONLY when it adds visual value to THIS specific fragment
4. Include continuity notes ONLY when the fragment represents a transition or narrative shift
5. NEVER dump all context fields mechanically — select only what is visually relevant to the fragment

### Fragment fidelity rule:
The prompt must describe what the FRAGMENT says, not what the scene says in general.
If a fragment describes "stone walls built without mortar", the prompt must focus on stone walls and masonry techniques — NOT on the broader city or its trade routes.

## PROMPT STRUCTURE
Each prompt_export must be in ENGLISH and contain ALL of these woven into one continuous paragraph:
1. Camera framing: "Wide shot of...", "Close-up on...", "Low-angle view of...", "Medium shot of..."
2. Fragment-specific visual content: what the fragment describes, with hyper-specific materials, textures, colors
3. Characters if present IN THE FRAGMENT: pose, gesture, clothing fabric and color, facial expression, body language
4. Environment grounded in the scene's lieu and époque: what surrounds the subject, period-accurate background elements
5. Foreground elements adding depth, relevant to the fragment's subject
6. Lighting: describe light source, direction, quality, shadows — motivated by the scene's ambiance when available
7. Atmosphere and mood from the fragment's narrative tone: dust, haze, humidity, temperature feel
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

const TARGET_CHARS_PER_SHOT = 100;

const normalizeNarrationText = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const collectBoundaryPositions = (text: string, regex: RegExp): number[] => {
  regex.lastIndex = 0;
  const positions: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    positions.push(match.index + match[0].length);
  }

  return positions;
};

const pickBoundaryPosition = (
  start: number,
  totalLength: number,
  remainingSegments: number,
  maxChars: number,
  candidates: number[]
): number | null => {
  const remainingLength = totalLength - start;
  const minPos = start + Math.max(1, remainingLength - maxChars * (remainingSegments - 1));
  const maxPos = Math.min(totalLength - 1, start + maxChars);

  if (minPos > maxPos) return null;

  const idealPos = start + Math.ceil(remainingLength / remainingSegments);
  const validCandidates = candidates.filter((pos) => pos >= minPos && pos <= maxPos);
  if (validCandidates.length === 0) return null;

  return validCandidates.reduce((best, pos) =>
    Math.abs(pos - idealPos) < Math.abs(best - idealPos) ? pos : best
  );
};

const splitLongSentenceIntoSegments = (
  sentence: string,
  maxChars = TARGET_CHARS_PER_SHOT
): string[] => {
  const text = normalizeNarrationText(sentence);
  if (!text) return [];

  const requiredSegments = Math.max(1, Math.ceil(text.length / maxChars));
  if (requiredSegments === 1) return [text];

  const preferredBoundaryPositions = Array.from(new Set([
    ...collectBoundaryPositions(text, /,["\u201D\u2019'»]?\s+/g),
    ...collectBoundaryPositions(text, /;\s+/g),
    ...collectBoundaryPositions(text, /:\s+/g),
    ...collectBoundaryPositions(text, /—\s*/g),
    ...collectBoundaryPositions(text, /–\s*/g),
  ])).sort((a, b) => a - b);

  const wordBoundaryPositions = Array.from(new Set(
    collectBoundaryPositions(text, /\s+/g)
  )).sort((a, b) => a - b);

  const segments: string[] = [];
  let start = 0;
  let remainingSegments = requiredSegments;

  while (remainingSegments > 1) {
    const preferredPos = pickBoundaryPosition(
      start,
      text.length,
      remainingSegments,
      maxChars,
      preferredBoundaryPositions.filter((pos) => pos > start)
    );

    const fallbackPos = pickBoundaryPosition(
      start,
      text.length,
      remainingSegments,
      maxChars,
      wordBoundaryPositions.filter((pos) => pos > start)
    );

    const splitPos = preferredPos ?? fallbackPos ?? Math.min(text.length - 1, start + maxChars);
    const segment = text.slice(start, splitPos).trim();
    if (!segment) break;

    segments.push(segment);
    start = splitPos;
    remainingSegments -= 1;
  }

  const tail = text.slice(start).trim();
  if (tail) segments.push(tail);

  return segments.length > 0 ? segments : [text];
};

const splitSceneIntoShotSegments = (text: string): string[] =>
  getNarrativeSegments(text);

const buildContextualPrompt = (fragment: string, scene?: any, shotType?: string, shotIndex?: number): string => {
  const ctx = scene?.scene_context as Record<string, string> | null;

  // 1. Historical & geographic anchor (mandatory first sentence)
  const epoque = ctx?.epoque || "the historical period";
  const lieu = ctx?.lieu || "the described location";
  const anchor = `In ${epoque}, ${lieu}`;

  // 2. Camera framing from shot type
  const cameraMap: Record<string, string> = {
    "Plan d'ensemble": "Wide establishing shot",
    "Plan d'activité": "Medium shot capturing action",
    "Plan d'interaction": "Two-shot or group composition",
    "Plan environnemental": "Atmospheric environmental shot",
    "Plan de détail d'artefact": "Close-up detail shot",
    "Plan de détail scientifique": "Macro examination shot",
    "Plan portrait": "Portrait shot",
    "Plan subjectif": "Point-of-view shot",
  };
  const cameraFraming = cameraMap[shotType || ""] || "Cinematic shot";

  // 3. Characters (only if relevant to this fragment)
  const personnages = ctx?.personnages;
  const fragmentLower = fragment.toLowerCase();
  let characterNote = "";
  if (personnages && personnages !== "Non déterminé") {
    // Only inject character details if the fragment mentions people or actions
    const hasHumanCue = /\b(people|person|king|queen|ruler|trader|craftsmen|builder|worker|priest|warrior|chief|community|population|inhabitants|they|he|she|them)\b/i.test(fragment)
      || /\b(peuple|roi|reine|dirigeant|commerçant|artisan|bâtisseur|ouvrier|prêtre|guerrier|chef|communauté|population|habitants|ils|il|elle|eux)\b/i.test(fragment);
    if (hasHumanCue) {
      characterNote = ` Characters present: ${personnages}.`;
    }
  }

  // 4. Ambiance & tone (selective injection)
  const ambiance = ctx?.ambiance;
  const ton = ctx?.ton;
  let moodNote = "";
  if (ambiance && ambiance !== "Non déterminé") {
    moodNote = ` Atmosphere: ${ambiance}.`;
  } else if (ton && ton !== "Non déterminé") {
    moodNote = ` Tone: ${ton}.`;
  }

  // 5. Visual intention (scene-level)
  const visualIntention = scene?.visual_intention;
  const intentionNote = visualIntention ? ` Visual intention: ${visualIntention}.` : "";

  // 6. Scene continuity for coherence
  const continuity = scene?.continuity;
  const continuityNote = continuity ? ` Scene continuity: ${continuity}.` : "";

  // 7. Build the prompt — fragment is the core subject
  return `${anchor}, ${cameraFraming.toLowerCase()} illustrating: "${fragment}".${characterNote}${moodNote}${intentionNote}${continuityNote} Historical documentary frame with photorealistic reconstruction, realistic materials and textures, archaeologically plausible architecture and period-accurate clothing. Include foreground depth elements, atmospheric particles, and physically motivated lighting with natural shadows. Style: ultra realistic documentary photography, cinematic lighting, historical reconstruction realism. Visual quality: cinematic film still, 8k detail, natural textures, real-world physics. Aspect ratio: 16:9`;
};

// Keep legacy name for compatibility
const fallbackPrompt = buildContextualPrompt;

const fallbackDescription = (sentence: string): string =>
  `Description visuelle du segment narratif : "${sentence}"`;

const buildSegmentShot = (
  segment: string,
  scene: any,
  shotIndex: number,
  baseShot?: any,
  reuseGeneratedContent = false
) => {
  const shotType = baseShot?.shot_type || CAMERA_TYPES[shotIndex % CAMERA_TYPES.length];
  const normalizedSegment = normalizeNarrationText(segment);
  const normalizedSceneText = normalizeNarrationText(scene?.source_text || "");
  const inheritedSceneTranslation = normalizedSegment && normalizedSegment === normalizedSceneText
    ? scene?.source_text_fr || null
    : null;
  const sourceSentenceFr = reuseGeneratedContent
    ? baseShot?.source_sentence_fr?.trim() || inheritedSceneTranslation
    : inheritedSceneTranslation;

  return {
    shot_type: shotType,
    description: reuseGeneratedContent
      ? baseShot?.description || fallbackDescription(segment)
      : fallbackDescription(segment),
    source_sentence: segment,
    source_sentence_fr: sourceSentenceFr,
    prompt_export: reuseGeneratedContent
      ? baseShot?.prompt_export || fallbackPrompt(segment, scene, shotType)
      : fallbackPrompt(segment, scene, shotType),
    guardrails: baseShot?.guardrails || "historically accurate clothing, architecture, and materials",
  };
};

const buildFallbackShots = (scene: any) => {
  const segments = splitSceneIntoShotSegments(scene.source_text || "");
  return segments.map((segment, index) => buildSegmentShot(segment, scene, index));
};

const buildFallbackStoryboard = (scenes: any[]) =>
  scenes.map((scene) => ({
    scene_id: scene.id,
    shots: buildFallbackShots(scene),
  }));

const normalizeTranslationKey = (value: string): string =>
  normalizeNarrationText(value).toLowerCase();

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const extractMessageText = (content: unknown): string => {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part: any) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .join(" ")
    .trim();
};

/**
 * Detects corrupted French accents where é/è/ê/ë were replaced by apostrophes.
 * Pattern: word-internal apostrophe not preceded by common French contractions (l', d', n', s', j', qu', c').
 */
const hasCorruptedAccents = (text: string): boolean => {
  // Match word'letter patterns that are NOT valid French contractions
  const suspiciousPattern = /(?<![ldnsjcLDNSJC])\b\w+'[a-zA-Z]/g;
  const matches = text.match(suspiciousPattern) || [];
  // If more than 2 suspicious patterns, likely corrupted
  return matches.length > 2;
};

const parseTranslationToolOutput = (
  payload: any,
): Array<{ source_sentence: string; source_sentence_fr: string }> => {
  const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];

  try {
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return Array.isArray(parsed?.translations) ? parsed.translations : [];
    }

    const rawContent = extractMessageText(payload?.choices?.[0]?.message?.content);
    if (!rawContent) return [];

    const parsed = JSON.parse(rawContent);
    return Array.isArray(parsed?.translations) ? parsed.translations : [];
  } catch (error) {
    console.warn("Failed to parse translation payload", error);
    return [];
  }
};

const translateSegmentToFrench = async (
  segment: string,
  apiKey: string,
): Promise<string | null> => {
  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      max_tokens: 256,
      messages: [
        {
          role: "system",
          content:
            "Translate the following narration segment to French. Return ONLY the French translation, nothing else.",
        },
        { role: "user", content: segment },
      ],
    }),
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    console.warn("Single-segment translation failed", aiResponse.status, errText);
    return null;
  }

  const aiData = await aiResponse.json();
  const translated = extractMessageText(aiData?.choices?.[0]?.message?.content);
  return translated || null;
};

const translateSegmentsToFrench = async (
  segments: string[],
  apiKey: string,
): Promise<Map<string, string>> => {
  const uniqueSegments = Array.from(
    new Map(
      segments
        .map((segment) => normalizeNarrationText(segment))
        .filter(Boolean)
        .map((segment) => [normalizeTranslationKey(segment), segment]),
    ).entries(),
  );

  const translations = new Map<string, string>();
  const chunks = chunkArray(uniqueSegments, 20);

  for (const chunk of chunks) {
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        max_tokens: 4096,
        messages: [
          {
            role: "system",
            content:
              "Translate narration segments to French. Be faithful, concise, and preserve meaning exactly. Return only the requested tool call.",
          },
          {
            role: "user",
            content: `Translate these narration segments to French and return one translation for each source sentence.\n\n${chunk
              .map(([, segment], index) => `${index + 1}. ${segment}`)
              .join("\n")}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "translate_segments",
              description: "Returns faithful French translations for narration segments.",
              parameters: {
                type: "object",
                properties: {
                  translations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        source_sentence: { type: "string" },
                        source_sentence_fr: { type: "string" },
                      },
                      required: ["source_sentence", "source_sentence_fr"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["translations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "translate_segments" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.warn("Batch translation failed", aiResponse.status, errText);
    } else {
      const aiData = await aiResponse.json();
      const parsedTranslations = parseTranslationToolOutput(aiData);

      for (const item of parsedTranslations) {
        const source = normalizeNarrationText(item?.source_sentence || "");
        let translation = typeof item?.source_sentence_fr === "string"
          ? item.source_sentence_fr.trim()
          : "";
        // Detect corrupted accents: if French text has words like "communaut's" where accent was replaced by apostrophe
        if (translation && hasCorruptedAccents(translation)) {
          console.warn("Corrupted accents detected in translation, skipping:", translation.slice(0, 80));
          translation = "";
        }
        if (source && translation) {
          translations.set(normalizeTranslationKey(source), translation);
        }
      }
    }

    for (const [key, segment] of chunk) {
      if (translations.has(key)) continue;
      const fallbackTranslation = await translateSegmentToFrench(segment, apiKey);
      if (fallbackTranslation) translations.set(key, fallbackTranslation);
    }
  }

  return translations;
};

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

    const { project_id, scene_id, sensitive_level } = await req.json();
    if (!project_id) throw new Error("Missing project_id");

    const sensitiveModeBlock = getSensitiveModeInstruction(sensitive_level);

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

    // Shot count: narrative segmentation based on sense units
    const calcShotCount = (text: string): number => {
      return computeNarrativeShotCount(text);
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
      const narrativeSegments = getNarrativeSegments(s.source_text);
      const shotCount = Math.max(1, narrativeSegments.length);
      const meta = [
        s.location ? `Location: ${s.location}` : null,
        s.characters ? `Characters: ${s.characters}` : null,
        s.scene_type ? `Scene type: ${s.scene_type}` : null,
        s.continuity ? `Continuity: ${s.continuity}` : null,
      ].filter(Boolean).join(" | ");

      // Inject scene_context (BlocContexteScene) for richer visual grounding
      const ctx = s.scene_context as Record<string, string> | null;
      const contextBlock = ctx ? [
        `  CONTEXTE DE LA SCÈNE:`,
        `    Contexte: ${ctx.contexte_scene || "Non déterminé"}`,
        `    Sujet: ${ctx.sujet || "Non déterminé"}`,
        `    Lieu: ${ctx.lieu || "Non déterminé"}`,
        `    Époque: ${ctx.epoque || "Non déterminé"}`,
        `    Personnages: ${ctx.personnages || "Non déterminé"}`,
        ctx.ambiance ? `    Ambiance: ${ctx.ambiance}` : null,
        ctx.ton ? `    Ton: ${ctx.ton}` : null,
        `    Cohérence: ${ctx.coherence_globale || "Cohérent"}`,
      ].filter(Boolean).join("\n") : "";

      // List pre-computed narrative fragments so the AI knows exactly which text each shot must illustrate
      const fragmentList = narrativeSegments
        .map((seg, idx) => `    Fragment ${idx + 1}: "${seg}"`)
        .join("\n");

      return `Scene ${s.scene_order} (id: ${s.id}, MANDATORY_shot_count: ${shotCount}): "${s.title}"${meta ? ` [${meta}]` : ""}\n${contextBlock}\n  Narration: ${s.source_text}\n  Visual intention: ${s.visual_intention || "N/A"}\n  PRE-COMPUTED FRAGMENTS (each fragment = one shot, use as source_sentence):\n${fragmentList}`;
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
            { role: "system", content: CINEMATIC_PROMPT_SYSTEM + sensitiveModeBlock },
            { role: "user", content: `${projectContext}\n\nIMPORTANT: All visual prompts MUST be grounded in the historical period, geographic location, and cultural context described by the project subject above. Architecture, clothing, objects, vegetation, and lighting must be accurate to that specific era and place. Never use generic or anachronistic elements.\n\nCONTEXTUAL ANCHORING RULE — CRITICAL:\nEvery prompt_export MUST begin its first sentence by explicitly stating the historical period/era and geographic location from the scene's CONTEXTE block (lieu + époque). This anchoring is MANDATORY in every single prompt_export. All architecture, clothing, objects, vegetation, skin tones, and lighting MUST be specific to that era, culture, and place. Never use generic, Western, or anachronistic elements.\n\nSCENE CONTEXT USAGE RULE:\nEach scene below includes a CONTEXTE DE LA SCÈNE block with: Contexte, Sujet, Lieu, Époque, Personnages, Ambiance, Ton, and Cohérence. You MUST use this information SELECTIVELY:\n- ALWAYS ground every prompt_export in the correct lieu and époque\n- Include personnages ONLY when the fragment mentions or implies people\n- Include ambiance/ton ONLY when it enhances the visual quality of THAT specific fragment\n- Do NOT mechanically inject all context fields — select only what is visually relevant\n\nFRAGMENT-SPECIFIC PROMPTS — CRITICAL:\nEach scene includes PRE-COMPUTED FRAGMENTS. Each fragment = exactly one shot.\n- Use each fragment as the source_sentence for its corresponding shot\n- The prompt_export MUST illustrate ONLY what THAT fragment describes, not the full scene\n- If a fragment describes stone walls, the prompt focuses on stone walls — not on trade routes or city life\n- Context from CONTEXTE enriches the prompt but the FRAGMENT is the visual subject\n\nGenerate cinematic documentary shots optimized for Grok Image for these scenes. CRITICAL RULES:\n1. Generate EXACTLY the number of shots indicated by MANDATORY_shot_count for each scene. This is NON-NEGOTIABLE.\n2. Each shot MUST use the corresponding PRE-COMPUTED FRAGMENT as its source_sentence.\n3. shot_type and description MUST be in FRENCH.\n4. source_sentence MUST be the EXACT fragment text copied verbatim.\n5. prompt_export MUST be in ENGLISH and must illustrate ONLY that exact fragment.\n6. Do NOT merge fragments. Do NOT skip fragments.\n7. Prompts must stay strictly faithful to the fragment text, enriched by scene context.\n8. Follow the VISUAL CAMERA GRID to vary shot types.\n9. Apply VISUAL ANCHOR SYSTEM for recurring characters/elements.\n10. Each prompt_export MUST explicitly open with the historical period/era and geographic location from the scene's CONTEXTE — this is MANDATORY for every single prompt.${translationRule}\n\n${sceneDescriptions}` },
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

      const sceneText = normalizeNarrationText(scene.source_text || "");
      const sceneSentences = splitSentences(sceneText);
      const expectedSegments = splitSceneIntoShotSegments(sceneText);
      const requiredShotCount = Math.max(1, expectedSegments.length);
      const normalize = (value: string) => normalizeNarrationText(value).toLowerCase();

      if (requiredShotCount === 1) {
        const currentShot = sceneShots[0];
        const canReuse = normalize(currentShot?.source_sentence || "") === normalize(sceneText);
        sceneShots = [buildSegmentShot(sceneText, scene, 0, currentShot, canReuse)];
      } else {
        const exactShotsBySegment = new Map<string, any>();
        for (const shot of sceneShots) {
          const key = normalize(shot?.source_sentence || "");
          if (key && !exactShotsBySegment.has(key)) exactShotsBySegment.set(key, shot);
        }

        const alreadyExact = sceneShots.length === requiredShotCount
          && expectedSegments.every((segment, idx) => normalize(sceneShots[idx]?.source_sentence || "") === normalize(segment));

        if (!alreadyExact) {
          console.log(`Scene ${scene.id}: rebuilding shots from exact narration segments (${requiredShotCount} required)`);
        }

        sceneShots = expectedSegments.map((segment, idx) => {
          const exactShot = exactShotsBySegment.get(normalize(segment));
          const indexedShot = sceneShots[idx];
          const baseShot = exactShot ?? indexedShot ?? null;
          const canReuse = !!exactShot || normalize(indexedShot?.source_sentence || "") === normalize(segment);

          return buildSegmentShot(segment, scene, idx, baseShot, canReuse);
        });
      }

      // ── SORT SHOTS BY READING ORDER ──
      const sceneTextLower = sceneText.toLowerCase();
      sceneShots.sort((a: any, b: any) => {
        const sentA = (a.source_sentence || "").trim().toLowerCase();
        const sentB = (b.source_sentence || "").trim().toLowerCase();
        const posA = sentA ? sceneTextLower.indexOf(sentA) : 9999;
        const posB = sentB ? sceneTextLower.indexOf(sentB) : 9999;
        return (posA === -1 ? 9999 : posA) - (posB === -1 ? 9999 : posB);
      });

      // ── ALLOCATION VALIDATION & REPAIR ──
      const currentFragments = sceneShots.map((s: any) => s.source_sentence || "");
      const allocationReport = validateAllocation(sceneText, currentFragments);

      if (!allocationReport.valid) {
        console.log(`Scene ${scene.id}: allocation invalid (${allocationReport.coveragePercent}% coverage, ${allocationReport.issues.length} issues). Repairing...`);
        const repairedFragments = repairAllocation(sceneText, expectedSegments, currentFragments);
        sceneShots = repairedFragments.map((fragment, idx) => {
          const existingShot = sceneShots[idx];
          return buildSegmentShot(fragment, scene, idx, existingShot, false);
        });
        console.log(`Scene ${scene.id}: repaired to ${sceneShots.length} shots`);
      } else {
        console.log(`Scene ${scene.id}: allocation valid (${allocationReport.coveragePercent}% coverage)`);
      }

      // ── NON-REDUNDANCY ENFORCEMENT ──
      const redundancyReport = analyzeRedundancy(scene.id, sceneShots);
      if (redundancyReport.hasHighSeverity) {
        console.log(`Scene ${scene.id}: redundancy detected (score: ${redundancyReport.diversityScore}/100, ${redundancyReport.issues.length} issues). Enforcing camera rotation.`);
        const fixedCameras = enforceCameraRotation(sceneShots);
        sceneShots = sceneShots.map((shot: any, idx: number) => ({
          ...shot,
          shot_type: fixedCameras[idx],
        }));
      } else {
        console.log(`Scene ${scene.id}: diversity OK (score: ${redundancyReport.diversityScore}/100)`);
      }

      // ── POST-SPLIT: scinder les shots dont source_sentence > 100 caractères ──
      const postSplitShots: any[] = [];
      for (const shot of sceneShots) {
        const sourceSentence = normalizeNarrationText(shot?.source_sentence || "");
        if (sourceSentence.length > TARGET_CHARS_PER_SHOT) {
          const subSegments = splitLongSentenceIntoSegments(sourceSentence, TARGET_CHARS_PER_SHOT);
          if (subSegments.length > 1) {
            console.log(`Scene ${scene.id}: splitting shot "${sourceSentence.slice(0, 50)}…" (${sourceSentence.length} chars) into ${subSegments.length} sub-shots`);
            for (let si = 0; si < subSegments.length; si++) {
              postSplitShots.push(
                buildSegmentShot(subSegments[si], scene, postSplitShots.length, si === 0 ? shot : null, si === 0)
              );
            }
            continue;
          }
        }
        postSplitShots.push(shot);
      }
      sceneShots = postSplitShots;

      // ── TRANSLATION: translate missing source_sentence_fr ──
      const missingSegments = sceneShots
        .map((shot: any) => ({
          source_sentence: normalizeNarrationText(shot?.source_sentence || ""),
          source_sentence_fr: typeof shot?.source_sentence_fr === "string"
            ? shot.source_sentence_fr.trim()
            : "",
        }))
        .filter((shot: any) => shot.source_sentence && !shot.source_sentence_fr)
        .map((shot: any) => shot.source_sentence);

      if (missingSegments.length > 0) {
        const translations = await translateSegmentsToFrench(missingSegments, LOVABLE_API_KEY);
        sceneShots = sceneShots.map((shot: any) => {
          const existingTranslation = typeof shot?.source_sentence_fr === "string"
            ? shot.source_sentence_fr.trim()
            : "";

          if (existingTranslation) {
            return { ...shot, source_sentence_fr: existingTranslation };
          }

          const normalizedSource = normalizeNarrationText(shot?.source_sentence || "");
          const translated = normalizedSource
            ? translations.get(normalizeTranslationKey(normalizedSource))
            : null;

          return {
            ...shot,
            source_sentence_fr: translated || null,
          };
        });
      }

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
          prompt_export: shot?.prompt_export || fallbackPrompt(fbSentence, scene, fbType),
          guardrails: shot?.guardrails || "historically accurate clothing, architecture, and materials",
        });
      }
    }

    if (shotRows.length === 0) throw new Error("No shots generated");

    const { error: insertErr } = await supabase.from("shots").insert(shotRows);
    if (insertErr) { console.error("Insert error:", insertErr); throw new Error("Failed to save shots"); }

    await supabase.from("projects").update({ status: "storyboarded" }).eq("id", project_id);

    // ── PERSIST ALLOCATION TRACEABILITY ──
    const allocationSummary = scenes.map((scene: any) => {
      const scnShots = shotRows.filter((r: any) => r.scene_id === scene.id);
      const fragments = scnShots.map((s: any) => s.source_sentence || "");
      const report = validateAllocation(normalizeNarrationText(scene.source_text || ""), fragments);
      return {
        scene_id: scene.id,
        scene_title: scene.title,
        shot_count: scnShots.length,
        coverage_percent: report.coveragePercent,
        valid: report.valid,
        issues_count: report.issues.length,
        issues: report.issues.map((i: any) => ({ type: i.type, detail: i.detail })),
      };
    });

    await supabase
      .from("project_scriptcreator_state")
      .update({
        shot_versions: [{
          timestamp: new Date().toISOString(),
          total_shots: shotRows.length,
          allocation: allocationSummary,
        }],
      })
      .eq("project_id", project_id);

    return new Response(JSON.stringify({
      shots_count: shotRows.length,
      allocation: allocationSummary,
    }), {
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
