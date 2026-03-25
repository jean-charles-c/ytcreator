/**
 * Sensitive Mode — Shared prompt transformation rules for visual constraint levels.
 *
 * Levels:
 *   1 = Atténué — softened angles, indirect representation
 *   2 = Suggéré — partial off-frame, visual suggestion
 *   3 = Implicite / Symbolique — symbols, visual metaphors
 *   4 = Hors-champ total — no direct representation at all
 */

export type SensitiveLevel = 1 | 2 | 3 | 4;

const SENSITIVE_TERMS_PATTERN = /\b(blood|bloody|gore|gory|murder|kill|dead\s+body|corpse|cadav(?:er|re)|grave|exhum(?:ed|ation)?|death|violent|violence|wound|wounded|skull|suffering|body|torso|face|mouth)\b/gi;

function extractSafeSettingContext(prompt: string): string {
  const firstSentence = prompt.split(/[.!?]/)[0] ?? "";
  return firstSentence
    .replace(SENSITIVE_TERMS_PATTERN, " ")
    .replace(/\b(close-up|medium close-up|tight(?:ly)? framed|portrait|subjective view|focuses? on|show(?:ing)?|depict(?:ing|ion)?)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

const LEVEL_INSTRUCTIONS: Record<SensitiveLevel, string> = {
  1: `SENSITIVE MODE — LEVEL 1 (Atténué):
Represent the scene with softened angles. Use indirect framing: show the subject from behind, partially obscured, or at a distance.
Avoid graphic or explicit depiction. Prefer wide shots, silhouettes, or partial views.
The emotional weight must come from composition and lighting, not from showing the subject directly.`,

  2: `SENSITIVE MODE — LEVEL 2 (Suggéré):
The sensitive content must be suggested but NOT shown. Use off-frame techniques: 
- Show reactions of witnesses or bystanders instead of the event itself
- Frame the shot just before or just after the moment
- Use tight close-ups on hands, objects, or environmental details that imply what happened
- Shadows, reflections, or blurred background elements can hint at the scene
The viewer must understand what is happening without seeing it directly.`,

  3: `SENSITIVE MODE — LEVEL 3 (Implicite / Symbolique):
Replace ALL direct or indirect representation with symbolic/metaphorical imagery.
Use visual metaphors: a wilting flower, broken glass, an empty chair, storm clouds, flowing water, scattered objects.
The image must evoke the emotional tone and theme WITHOUT depicting any person, action, or specific event from the narration.
Think art photography or editorial illustration — pure visual poetry.`,

  4: `SENSITIVE MODE — LEVEL 4 (Hors-champ total):
Generate ONLY an environmental/atmospheric shot with NO human figures, NO action, and NO reference to the sensitive event.
Show: empty landscapes, architectural details, textures, sky, water, vegetation, or abstract light patterns.
The shot must provide a visual breathing space. It should feel like a contemplative pause in the documentary.
NO people. NO bodies. NO faces. NO graves. NO blood. NO objects that suggest violence, suffering, or the specific event.
Keep ONLY the broad historical or geographic atmosphere when useful. Never echo the disturbing narrative details. Pure environment.`,
};

/**
 * Returns the sensitive mode instruction block to inject into a prompt system message.
 * Returns empty string if no level is set (null/undefined).
 */
export function getSensitiveModeInstruction(level: number | null | undefined): string {
  if (level == null || level < 1 || level > 4) return "";
  return `\n\n${LEVEL_INSTRUCTIONS[level as SensitiveLevel]}\n\nCRITICAL: The sensitive mode instruction above takes ABSOLUTE PRIORITY over all other visual directions. You MUST comply fully.`;
}

/**
 * Wraps/modifies a prompt_export text to enforce sensitive mode constraints for image generation.
 * Returns the modified prompt or the original if no level is set.
 */
export function transformPromptForSensitiveMode(prompt: string, level: number | null | undefined): string {
  if (level == null || level < 1 || level > 4) return prompt;

  const safeSettingContext = extractSafeSettingContext(prompt);

  switch (level as SensitiveLevel) {
    case 1:
      return `Softened, indirect documentary shot. Show from a distance or partial view. ${prompt}. Avoid any graphic or explicit depiction. Use wide framing and atmospheric lighting.`;
    case 2:
      return `Suggestive off-screen documentary shot — never depict the sensitive event directly. Convey it only through witness reactions, disturbed environmental details, and tight close-ups of hands, objects, or contextual traces. Frame the scene just before or just after the implied moment, using partial obstruction, shallow depth of field, reflections, shadows, or blurred background elements to make the situation immediately understandable without showing any explicit action. No blood, no nudity, no visible injuries, no visible weapons, no graphic detail. ${prompt}`;
    case 3:
      return `Symbolic, metaphorical documentary image. Replace all literal content with visual metaphors: natural elements, abstract compositions, poetic imagery. Inspired by: ${prompt}. NO literal depiction of people or events. Pure visual poetry and symbolism.`;
    case 4:
      return `Empty environmental shot — contemplative pause. Show ONLY landscape, architecture, sky, water, vegetation, weather, empty interiors, or abstract textures. NO people. NO bodies. NO faces. NO graves. NO blood. NO objects suggesting death, violence, or a specific event. Preserve only the broad historical or geographic atmosphere${safeSettingContext ? ` from this safe context: ${safeSettingContext}` : " of the documentary setting"}. A peaceful, distant breathing space.`;
  }
}
