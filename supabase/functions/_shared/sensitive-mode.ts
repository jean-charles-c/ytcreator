/**
 * Sensitive Mode — Shared prompt transformation rules for visual constraint levels.
 *
 * Levels:
 *   1 = Atténué — softened angles, indirect representation
 *   2 = Suggéré — partial off-frame, visual suggestion
 *   3 = Implicite / Symbolique — symbols, visual metaphors
 *   4 = Hors-champ total — no direct representation at all
 *
 * Context anchoring: all levels extract and preserve the original context
 * (era, location, atmosphere, setting) so the visual stays faithful to the
 * documentary universe even when the sensitive action is removed.
 */

export type SensitiveLevel = 1 | 2 | 3 | 4;

const SENSITIVE_TERMS_PATTERN = /\b(blood|bloody|gore|gory|murder|kill|dead\s+body|corpse|cadav(?:er|re)|grave|exhum(?:ed|ation)?|death|violent|violence|wound|wounded|skull|suffering|body|torso|face|mouth)\b/gi;

// ─── Context Anchor Extraction ────────────────────────────────────────────────
// Scans the FULL prompt for contextual information (era, location, atmosphere,
// architecture, lighting, weather, decor) and returns a mandatory context block.

const CONTEXT_PATTERNS: { label: string; pattern: RegExp }[] = [
  // Time periods / eras
  { label: "era", pattern: /\b(\d{1,2}(?:st|nd|rd|th)\s+century|(?:ancient|medieval|victorian|renaissance|baroque|modern|contemporary|colonial|ottoman|roman|byzantine|neolithic|iron\s+age|bronze\s+age|pre-columbian|post-war|interwar|belle\s+époque)\b[\w\s]{0,30})/gi },
  { label: "era", pattern: /\b(\d{3,4}s?(?:\s*[-–]\s*\d{3,4}s?)?)\b/g },
  // Specific date markers (e.g. "XVe siècle", "XIXe")
  { label: "era", pattern: /\b([IVXLCDM]+e?\s+si[eè]cle)\b/gi },

  // Locations / geography
  { label: "location", pattern: /\b(in\s+(?:the\s+)?[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3})/g },
  { label: "location", pattern: /\b((?:castle|château|church|cathedral|mosque|temple|palace|fortress|village|city|town|port|harbor|mountain|valley|river|desert|forest|jungle|steppe|tundra|coast|island|cemetery|market|square|courtyard|dungeon|crypt|cellar|attic|tower|bridge|ruins?)\s*(?:of\s+)?[\w\s'-]{0,40})/gi },

  // Atmosphere / lighting / weather
  { label: "atmosphere", pattern: /\b((?:dim|warm|cold|golden|harsh|soft|dramatic|moonlit|candlelit|torch-?lit|flickering|hazy|misty|foggy|stormy|overcast|dawn|dusk|twilight|midnight|sunrise|sunset|rainy|snowy|dusty|smoky|humid|arid|gloomy|somber|eerie|serene|oppressive)\s*(?:light(?:ing)?|atmosphere|ambiance|sky|air|weather|glow|shadows?)?)/gi },

  // Architecture / decor / materials
  { label: "setting", pattern: /\b((?:stone|wooden|marble|brick|clay|iron|bronze|gold|silver|ornate|carved|crumbling|ruined|weathered|ancient|moss-covered|ivy-covered|tapestried|vaulted|arched|columned|domed|thatched|cobblestone|narrow|winding)\s+(?:walls?|floors?|ceiling|columns?|arches?|doors?|gates?|windows?|stairs?|corridors?|halls?|rooms?|chambers?|streets?|alleys?|paths?|roads?))/gi },

  // Textiles / objects / props (decor cues)
  { label: "setting", pattern: /\b((?:tapestry|tapestries|candles?|torch(?:es)?|lanterns?|chandeliers?|furniture|drapes?|curtains?|carpets?|rugs?|pottery|ceramics?|manuscripts?|scrolls?|weapons?\s+rack|armor|shields?|banners?|flags?|icons?|relics?|altars?|crosses|crucifixes))/gi },
];

/**
 * Extracts context anchors (era, location, atmosphere, setting) from the full prompt.
 * Returns a deduplicated, categorised mandatory context string.
 */
function extractContextAnchors(prompt: string): string {
  const found: Record<string, Set<string>> = {
    era: new Set(),
    location: new Set(),
    atmosphere: new Set(),
    setting: new Set(),
  };

  for (const { label, pattern } of CONTEXT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(prompt)) !== null) {
      const value = match[1]?.trim();
      if (value && value.length > 2) {
        // Clean sensitive terms from the extracted context
        const cleaned = value
          .replace(SENSITIVE_TERMS_PATTERN, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (cleaned.length > 2) {
          found[label].add(cleaned);
        }
      }
    }
  }

  const parts: string[] = [];
  if (found.era.size) parts.push(`Era/Period: ${[...found.era].join(", ")}`);
  if (found.location.size) parts.push(`Location: ${[...found.location].join(", ")}`);
  if (found.atmosphere.size) parts.push(`Atmosphere: ${[...found.atmosphere].join(", ")}`);
  if (found.setting.size) parts.push(`Setting/Decor: ${[...found.setting].join(", ")}`);

  return parts.length > 0
    ? `MANDATORY CONTEXT — you MUST preserve this exact universe:\n${parts.join("\n")}`
    : "";
}

// ─── Legacy helper (kept for backward compat) ────────────────────────────────

function extractSafeSettingContext(prompt: string): string {
  const firstSentence = prompt.split(/[.!?]/)[0] ?? "";
  return firstSentence
    .replace(SENSITIVE_TERMS_PATTERN, " ")
    .replace(/\b(close-up|medium close-up|tight(?:ly)? framed|portrait|subjective view|focuses? on|show(?:ing)?|depict(?:ing|ion)?)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

// ─── Level Instructions (for system-message injection) ────────────────────────

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
 * Strips sensitive action content from a prompt while keeping safe context.
 * Used for levels 3-4 where the original event description must not appear.
 */
function stripSensitiveAction(prompt: string): string {
  return prompt
    .replace(SENSITIVE_TERMS_PATTERN, "")
    .replace(/\b(close-up|medium close-up|tight(?:ly)? framed|portrait|subjective view|focuses? on|show(?:ing)?|depict(?:ing|ion)?|reveal(?:ing|s)?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

/**
 * Wraps/modifies a prompt_export text to enforce sensitive mode constraints for image generation.
 * Returns the modified prompt or the original if no level is set.
 *
 * All levels now extract and inject mandatory context anchors (era, location,
 * atmosphere, setting) so the image stays in the correct documentary universe.
 */
export function transformPromptForSensitiveMode(prompt: string, level: number | null | undefined): string {
  if (level == null || level < 1 || level > 4) return prompt;

  const contextBlock = extractContextAnchors(prompt);
  const contextPrefix = contextBlock ? `${contextBlock}\n\n` : "";

  switch (level as SensitiveLevel) {
    case 1:
      return `${contextPrefix}Softened, indirect documentary shot. Show from a distance or partial view. ${prompt}. Avoid any graphic or explicit depiction. Use wide framing and atmospheric lighting.`;

    case 2:
      return `${contextPrefix}Suggestive off-screen documentary shot — never depict the sensitive event directly. Convey it only through witness reactions, disturbed environmental details, and tight close-ups of hands, objects, or contextual traces. Frame the scene just before or just after the implied moment, using partial obstruction, shallow depth of field, reflections, shadows, or blurred background elements to make the situation immediately understandable without showing any explicit action. No blood, no nudity, no visible injuries, no visible weapons, no graphic detail. ${prompt}`;

    case 3: {
      // For level 3: keep context anchors + cleaned prompt for inspiration, but enforce symbolism
      const cleanedPrompt = stripSensitiveAction(prompt);
      return `${contextPrefix}Symbolic, metaphorical documentary image set in the EXACT context described above. Replace all literal content with visual metaphors: natural elements, abstract compositions, poetic imagery that evoke the emotional tone. Inspired by: ${cleanedPrompt}. NO literal depiction of people or events. Pure visual poetry and symbolism rooted in the specified era, location, and atmosphere.`;
    }

    case 4: {
      // For level 4: context anchors + fully sanitized environmental prompt
      const cleanedPrompt = stripSensitiveAction(prompt);
      // Also extract a broader safe context from the full prompt (not just first sentence)
      const safeFallback = extractSafeSettingContext(prompt);
      return `${contextPrefix}Empty environmental shot — contemplative pause set in the EXACT historical and geographic context described above. Show ONLY landscape, architecture, sky, water, vegetation, weather, empty interiors, or abstract textures from this specific setting. NO people. NO bodies. NO faces. NO graves. NO blood. NO objects suggesting death, violence, or a specific event.${cleanedPrompt ? ` Visual atmosphere drawn from: ${cleanedPrompt}.` : ""}${!contextBlock && safeFallback ? ` Context: ${safeFallback}.` : ""} A peaceful, distant breathing space faithful to the documentary's universe.`;
    }
  }
}
