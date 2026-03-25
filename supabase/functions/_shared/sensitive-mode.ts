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
NO people. NO objects that suggest violence, suffering, or the specific event. Pure environment.`,
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

  switch (level as SensitiveLevel) {
    case 1:
      return `Softened, indirect documentary shot. Show from a distance or partial view. ${prompt}. Avoid any graphic or explicit depiction. Use wide framing and atmospheric lighting.`;
    case 2:
      return `Suggestive documentary shot — do NOT show the main event directly. Instead show reactions, environmental details, or the moment just before/after. ${prompt}. Frame off-screen or use tight detail shots to imply the scene without depicting it.`;
    case 3:
      return `Symbolic, metaphorical documentary image. Replace all literal content with visual metaphors: natural elements, abstract compositions, poetic imagery. Inspired by: ${prompt}. NO literal depiction of people or events. Pure visual poetry and symbolism.`;
    case 4:
      return `Empty environmental shot — contemplative pause. Show ONLY: landscape, architecture, sky, water, vegetation, or abstract textures. NO people, NO objects suggesting specific events. A peaceful, atmospheric breathing space. Setting inspired by the general location of: ${prompt}`;
  }
}
