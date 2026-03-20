/**
 * forbiddenReferenceDetector.ts — ForbiddenReferenceDetector
 *
 * Classifies XML references found by XmlReferenceScanner as
 * "allowed" or "blocking" for Fusion Title clips.
 * Normal video clips are never blocked by these rules.
 */

import type { XmlReference, ScanResult } from "./xmlReferenceScanner";

export interface ClassifiedReference {
  ref: XmlReference;
  status: "allowed" | "blocking";
  reason: string;
}

export interface DetectionResult {
  /** All classified references (Fusion Title only) */
  classified: ClassifiedReference[];
  /** Only the blocking ones */
  blocking: ClassifiedReference[];
  /** True if no blocking references found */
  clean: boolean;
}

/**
 * Tags that are strictly forbidden inside any Fusion Title clipitem.
 * These make Resolve treat the title as an external media file.
 */
const FORBIDDEN_FUSION_TAGS: Record<string, string> = {
  pathurl: "Chemin local vers un fichier externe — Resolve cherche un fichier à relier",
  stillframe: "Marqueur d'image fixe — Resolve traite le titre comme une image importée",
  media: "Bloc média au niveau clipitem — sémantique de média externe",
  video: "Bloc vidéo au niveau clipitem — sémantique de média externe",
  samplecharacteristics: "Caractéristiques d'échantillon — champ de média classique absent du template Fusion valide",
  masterclipid: "Référence à un master clip — réservé aux vrais médias, pas aux titres Fusion",
  anamorphic: "Champ anamorphique — absent du template Fusion valide",
  sourcetrack: "Piste source — champ de média externe absent du template Fusion valide",
  pixelaspectratio: "Ratio de pixel — champ de média externe absent du template Fusion valide",
  reel: "Nom de bobine — référence média externe non supportée par l'export",
};

/**
 * Patterns that indicate a local filesystem path (always forbidden in Fusion Titles).
 */
const LOCAL_PATH_PATTERNS = [
  /^file:\/\/\//,
  /^\/Users\//,
  /^\/home\//,
  /^[A-Z]:\\/,
  /^\\\\/, // UNC paths
];

/**
 * Classify a single Fusion Title reference as allowed or blocking.
 */
function classifyFusionRef(ref: XmlReference): ClassifiedReference {
  // Check if the tag itself is forbidden
  const forbiddenReason = FORBIDDEN_FUSION_TAGS[ref.tag];
  if (forbiddenReason) {
    return { ref, status: "blocking", reason: forbiddenReason };
  }

  // Check if the value contains a local filesystem path
  for (const pattern of LOCAL_PATH_PATTERNS) {
    if (pattern.test(ref.value)) {
      return {
        ref,
        status: "blocking",
        reason: `Chemin local détecté (${ref.value.substring(0, 80)}) — fichier inexistant dans l'export`,
      };
    }
  }

  return { ref, status: "allowed", reason: "Champ autorisé dans le template Fusion valide" };
}

/**
 * Analyze scan results and classify Fusion Title references.
 * Normal video clips are NOT evaluated — only Fusion Titles.
 */
export function detectForbiddenReferences(scanResult: ScanResult): DetectionResult {
  const classified = scanResult.fusionTitleRefs.map(classifyFusionRef);
  const blocking = classified.filter((c) => c.status === "blocking");

  return {
    classified,
    blocking,
    clean: blocking.length === 0,
  };
}

/**
 * Format blocking references as a human-readable diagnostic.
 */
export function formatBlockingReport(result: DetectionResult): string {
  if (result.clean) {
    return "✅ Aucune référence interdite détectée dans les Fusion Title.";
  }

  const lines = [
    `🔴 ${result.blocking.length} référence(s) interdite(s) dans les Fusion Title :`,
    "",
  ];

  for (const { ref, reason } of result.blocking) {
    lines.push(`  • [${ref.tag}] dans "${ref.clipItemId}" (${ref.track})`);
    lines.push(`    Chemin : ${ref.xmlPath}`);
    if (ref.value) lines.push(`    Valeur : ${ref.value.substring(0, 120)}`);
    lines.push(`    Raison : ${reason}`);
    lines.push("");
  }

  lines.push("⛔ Export bloqué — ces références feraient échouer l'import dans DaVinci Resolve.");
  return lines.join("\n");
}
