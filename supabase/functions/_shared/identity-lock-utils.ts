/**
 * Strip every legacy verbose Identity Lock block found in a prompt — whether
 * it sits at the very beginning OR is glued in the middle of the prompt body.
 *
 * Historical context: early storyboards stored the full identity lock block
 * (OBJECT/CHARACTER/LOCATION/VEHICLE IDENTITY LOCK + VERSION/TIME PERIOD LOCK
 * + REFERENCE IMAGES PROVIDED + NO ... DRIFT) directly inside `prompt_export`.
 * Newer code re-injects condensed identity anchors at render time from the
 * registry's `mentions_shots`, so leaving the legacy block intact:
 *   1) duplicates the lock,
 *   2) drowns the per-shot narrative fragment under ~1500 chars of boilerplate,
 *   3) anchors the model on whichever object happens to be locked first,
 *      producing visually identical images across consecutive shots.
 *
 * This stripper is intentionally tolerant: it accepts blocks at any position
 * and uses look-ahead markers to detect each block's end without depending
 * on exact whitespace.
 */
export const stripLegacyIdentityLockBlocks = (prompt: string): string => {
  if (!prompt) return prompt;

  let out = prompt;

  // 1. Remove every "(CHARACTER|LOCATION|OBJECT|VEHICLE) IDENTITY LOCK:" block.
  //    A block ends at the next legacy marker or at one of the suffix anchors
  //    that appear right after all locks in the historical format.
  const lockEndMarkers =
    "(?=" +
    [
      "(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\\s+IDENTITY\\s+LOCK\\s*:",
      "VERSION\\s*\\/\\s*TIME\\s+PERIOD\\s+LOCK\\s*:",
      "TIME\\s+PERIOD\\s*\\/\\s*HISTORICAL\\s+STATE\\s+LOCK\\s*:",
      "REFERENCE\\s+IMAGES\\s+PROVIDED\\s*:",
      "NO\\s+(?:OBJECT|TEMPORAL|CHARACTER|LOCATION)\\s+DRIFT\\s*:",
      "Image\\s+documentaire\\s+historique",
      "Qualité\\s+visuelle\\s*:",
      "Quality\\s+target\\s*:",
      "Any\\s+visible\\s+writing",
      "Ratio\\s+d'aspect\\s*:",
      "Aspect\\s+ratio\\s*:",
      "Style\\s*:",
      "$",
    ].join("|") +
    ")";

  // Repeat passes until no more legacy headers are found (handles N stacked locks).
  const headerRe = /(CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK\s*:/i;
  let safety = 12;
  while (safety-- > 0 && headerRe.test(out)) {
    const blockRe = new RegExp(
      `(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\\s+IDENTITY\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "i",
    );
    const before = out;
    out = out.replace(blockRe, " ");
    if (out === before) break; // no progress, avoid infinite loop
  }

  // 2. Remove orphan VERSION/TIME PERIOD LOCK and REFERENCE IMAGES PROVIDED
  //    blocks that may remain if the IDENTITY LOCK header itself was missing.
  const orphanBlocks = [
    new RegExp(
      `VERSION\\s*\\/\\s*TIME\\s+PERIOD\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
    new RegExp(
      `TIME\\s+PERIOD\\s*\\/\\s*HISTORICAL\\s+STATE\\s+LOCK\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
    new RegExp(
      `REFERENCE\\s+IMAGES\\s+PROVIDED\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
    new RegExp(
      `NO\\s+(?:OBJECT|TEMPORAL|CHARACTER|LOCATION)\\s+DRIFT\\s*:[\\s\\S]*?${lockEndMarkers}`,
      "gi",
    ),
  ];
  for (const re of orphanBlocks) out = out.replace(re, " ");

  // 3. Compress whitespace and stray separators left behind by the strips.
  out = out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return out;
};

/**
 * Backwards-compatible alias: older call sites still import the prefix-only
 * stripper. Forward to the new full-body stripper which is a strict superset.
 */
export const stripLegacyIdentityLockPrefix = stripLegacyIdentityLockBlocks;

/**
 * ──────────────────────────────────────────────────────────────────────────
 * Anti-contamination utilities
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Goal: prevent the storyboard AI from naming an entity (brand, atelier,
 * vehicle, character…) that belongs to a *different* scene of the same
 * project. Example bug: a Rolls-Royce shot's prompt_export contained
 * "Atelier Pagani" because Pagani Huayra is another recurring object of
 * the project, even though it is irrelevant to the current scene.
 */

type AnyObject = Record<string, any>;

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "et", "ou",
  "bois", "plan", "voiture", "auto", "moto", "objet", "piece", "pièce",
  "the", "of", "a", "an", "car", "wood", "item", "panel", "detail",
  "atelier", "studio", "salle", "showroom", "interieur", "intérieur",
]);

/** Return the most distinctive (longest, non-stopword, ≥5 chars) token of a name. */
export const distinctiveToken = (name: string): string | null => {
  const tokens = (name || "")
    .toLowerCase()
    .split(/[\s\-_'']+/)
    .filter((t) => t.length >= 5 && !STOPWORDS.has(t));
  if (tokens.length === 0) {
    return name && name.length >= 5 ? name.toLowerCase() : null;
  }
  return tokens.sort((a, b) => b.length - a.length)[0];
};

/**
 * Keep only the recurring objects that are relevant to a given scene.
 * An object is relevant when one of the following is true:
 *   - `obj.mentions_scenes` explicitly contains the scene order
 *   - the object name (or its distinctive token) appears in the scene text
 *   - the object name appears in `scene_context.objets_associes`
 */
export const filterRecurringObjectsForScene = (
  allObjects: AnyObject[],
  sceneOrder: number,
  sceneText: string,
  sceneContext?: AnyObject | null,
): AnyObject[] => {
  if (!Array.isArray(allObjects) || allObjects.length === 0) return [];
  // First, narrow composite objects (nom contains "/") to the segment that
  // actually applies to this scene — see narrowCompositeObjectForScene below.
  const normalized = allObjects.map((obj) =>
    narrowCompositeObjectForScene(obj, sceneText, sceneContext),
  );
  // If ANY object in the library has manually curated `mentions_scenes`
  // that include the current sceneOrder, consider this scene as
  // "explicitly curated by the user" → only include objects that
  // explicitly mention this sceneOrder. This prevents the text-match
  // fallback from re-injecting foreign objects (e.g. an object whose
  // distinctive token incidentally appears in `objets_associes` or in
  // the scene text but is NOT relevant to the current scene).
  const sceneIsExplicitlyCurated = normalized.some(
    (obj: AnyObject) =>
      Array.isArray(obj.mentions_scenes) && obj.mentions_scenes.includes(sceneOrder),
  );
  if (sceneIsExplicitlyCurated) {
    return normalized.filter(
      (obj: AnyObject) =>
        Array.isArray(obj.mentions_scenes) && obj.mentions_scenes.includes(sceneOrder),
    );
  }
  const haystack = (sceneText || "").toLowerCase();
  const ctxObjects = (() => {
    if (!sceneContext) return "";
    const raw = (sceneContext as any).objets_associes;
    if (Array.isArray(raw)) return raw.join(" ").toLowerCase();
    if (typeof raw === "string") return raw.toLowerCase();
    return "";
  })();

  return normalized.filter((obj: AnyObject) => {
    if (Array.isArray(obj.mentions_scenes) && obj.mentions_scenes.includes(sceneOrder)) {
      return true;
    }
    const token = distinctiveToken(obj.nom || "");
    if (!token) return false;
    if (haystack.includes(token)) return true;
    if (ctxObjects.includes(token)) return true;
    return false;
  });
};

export const filterRecurringObjectsForShot = (
  allObjects: AnyObject[],
  sceneOrder: number,
  shotId: string | null | undefined,
  fragmentText: string,
  sceneText: string,
  sceneContext?: AnyObject | null,
): AnyObject[] => {
  if (!Array.isArray(allObjects) || allObjects.length === 0) return [];

  const shotScopedObjects = shotId
    ? allObjects.filter(
        (obj: AnyObject) => Array.isArray(obj.mentions_shots) && obj.mentions_shots.includes(shotId),
      )
    : [];

  if (shotScopedObjects.length > 0) return shotScopedObjects;

  return filterRecurringObjectsForScene(
    allObjects,
    sceneOrder,
    [sceneText, fragmentText].filter(Boolean).join("\n"),
    sceneContext,
  );
};

const cleanAlias = (value: unknown): string =>
  String(value || "")
    .replace(/\s+Moderne\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const isTooGenericAlias = (value: string): boolean => {
  const v = value.toLowerCase();
  return [
    "carbone",
    "carbon",
    "carbone apparent",
    "fibre de carbone",
    "carbon fiber",
    "carbon fibre",
  ].includes(v);
};

export const forbiddenAliasesForObject = (obj: AnyObject): string[] => {
  const aliases = new Set<string>();
  const add = (value: unknown) => {
    const alias = cleanAlias(value);
    if (alias.length >= 5 && !isTooGenericAlias(alias)) aliases.add(alias);
  };

  const name = cleanAlias(obj?.nom);
  add(name);

  if (name.includes("/")) {
    const parts = name.split("/").map((part) => cleanAlias(part));
    add(parts.join(" "));
    parts.forEach((part, index) => {
      if (index > 0) add(part);
    });
    if (/blue\s+royal/i.test(parts.join(" "))) add(`${parts[0]} Blue Royal`);
  }

  const subjectMatch = String(obj?.identity_prompt || "").match(/^Subject:\s*(.+)$/im);
  if (subjectMatch?.[1]) add(subjectMatch[1]);

  const combined = `${obj?.nom || ""} ${obj?.identity_prompt || ""} ${obj?.description_visuelle || ""}`;
  if (/\bblue\s+royal\b/i.test(combined)) {
    add("Blue Royal");
    add("Blue Royal Carbon");
    add("Royal Carbon");
  }

  return Array.from(aliases);
};

export const buildForbiddenAliases = (
  allObjects: AnyObject[],
  allowedObjects: AnyObject[],
): string[] => {
  const allowedIds = new Set((allowedObjects || []).map((obj) => obj?.id).filter(Boolean));
  const allowedNames = new Set((allowedObjects || []).map((obj) => cleanAlias(obj?.nom).toLowerCase()).filter(Boolean));
  const aliases = new Set<string>();

  for (const obj of allObjects || []) {
    const idAllowed = obj?.id && allowedIds.has(obj.id);
    const nameAllowed = allowedNames.has(cleanAlias(obj?.nom).toLowerCase());
    if (idAllowed || nameAllowed) continue;
    forbiddenAliasesForObject(obj).forEach((alias) => aliases.add(alias));
  }

  return Array.from(aliases).sort((a, b) => b.length - a.length);
};

export const findForbiddenAliases = (text: string, aliases: string[]): string[] => {
  const haystack = String(text || "");
  return Array.from(new Set((aliases || []).filter((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
  })));
};

export const replaceForbiddenAliases = (
  text: string,
  aliases: string[],
  replacement: string,
): string => {
  let output = String(text || "");
  for (const alias of aliases || []) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), replacement);
  }
  return output.replace(/\s{2,}/g, " ").trim();
};

/**
 * Scan a generated prompt and return the names of recurring objects that
 * should NOT have been mentioned (i.e. they belong to a different scene).
 *
 * - `allObjects`: full project recurring library
 * - `allowedObjects`: objects authorized for the current scene
 * - returns: array of foreign object names actually present in the prompt
 */
export const detectForeignEntities = (
  prompt: string,
  allObjects: AnyObject[],
  allowedObjects: AnyObject[],
): string[] => {
  if (!prompt || !Array.isArray(allObjects) || allObjects.length === 0) return [];
  const haystack = prompt.toLowerCase();
  const allowedTokens = new Set(
    (allowedObjects || [])
      .map((o) => distinctiveToken(o.nom || ""))
      .filter((t): t is string => !!t),
  );
  const foreign: string[] = [];
  for (const obj of allObjects) {
    const token = distinctiveToken(obj.nom || "");
    if (!token) continue;
    if (allowedTokens.has(token)) continue;
    // word-boundary aware: avoid matching tokens embedded in another word
    const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i");
    if (re.test(haystack)) {
      foreign.push(obj.nom);
    }
  }
  return Array.from(new Set(foreign));
};

/** Shared ENTITY ISOLATION rule injected into AI system/user prompts. */
export const ENTITY_ISOLATION_RULE = `ENTITY ISOLATION RULE — CRITICAL (anti-contamination):
- The prompt_export MUST ONLY mention brands, vehicles, ateliers, workshops,
  characters, locations and objects that are listed in the CURRENT SCENE's
  CONTEXTE block (lieu, sujet, objets_associes) or in that scene's filtered
  OBJETS RÉCURRENTS DANS CETTE SCÈNE list.
- NEVER name a brand / atelier / vehicle / character / location that belongs
  to a different scene of the same project, even if it appears in the
  project's global recurring library or in other scenes.
- If the scene's lieu is generic (e.g. "studio", "showroom", "salle blanche"),
  describe a neutral environment — do NOT invent or borrow a specific brand
  name (Pagani, Rolls-Royce, Ferrari, etc.) that is absent from the scene.
- When in doubt about a brand/atelier name, OMIT it rather than guess.`;