import type { RecurringObject } from "@/components/editor/ObjectRegistryPanel";

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "et", "ou",
  "bois", "plan", "voiture", "auto", "moto", "objet", "piece", "pièce",
  "the", "of", "a", "an", "car", "wood", "item", "panel", "detail",
  "atelier", "studio", "salle", "showroom", "interieur", "intérieur",
]);

const distinctiveToken = (name: string): string | null => {
  const tokens = (name || "")
    .toLowerCase()
    .split(/[\s\-_'']+/)
    .filter((t) => t.length >= 5 && !STOPWORDS.has(t));
  if (tokens.length === 0) {
    return name && name.length >= 5 ? name.toLowerCase() : null;
  }
  return tokens.sort((a, b) => b.length - a.length)[0];
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Return the recurring objects whose distinctive token appears in `prompt`
 * but which are NOT part of the shot's authorized scene set (i.e. their
 * `mentions_scenes` does not include the current scene order).
 *
 * Used by ShotCard to surface a contamination warning when the AI has
 * borrowed a brand/atelier name from a different scene of the project.
 */
export const detectForeignEntities = (
  prompt: string | null | undefined,
  allObjects: RecurringObject[] | undefined,
  sceneOrder: number | undefined,
): { nom: string; token: string }[] => {
  if (!prompt || !allObjects || allObjects.length === 0 || sceneOrder === undefined) return [];
  const haystack = prompt.toLowerCase();
  const allowed = new Set<string>();
  const foreign: { nom: string; token: string }[] = [];
  for (const obj of allObjects) {
    const t = distinctiveToken(obj.nom || "");
    if (!t) continue;
    if (Array.isArray(obj.mentions_scenes) && obj.mentions_scenes.includes(sceneOrder)) {
      allowed.add(t);
    }
  }
  for (const obj of allObjects) {
    const t = distinctiveToken(obj.nom || "");
    if (!t) continue;
    if (allowed.has(t)) continue;
    const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, "i");
    if (re.test(haystack)) {
      foreign.push({ nom: obj.nom, token: t });
    }
  }
  // De-duplicate by token
  const seen = new Set<string>();
  return foreign.filter((f) => {
    if (seen.has(f.token)) return false;
    seen.add(f.token);
    return true;
  });
};