/**
 * resolveXmlValidator.ts — Post-generation validation for DaVinci Resolve XML
 *
 * Validates the generated XML string against the reference structure rules
 * before allowing export. Returns structured errors/warnings for the UI.
 */

import { FUSION_TITLE_FILE_ID, FUSION_TITLE_DURATION } from "./fusionTitleTemplate";

export interface ValidationIssue {
  level: "error" | "warning";
  rule: string;
  message: string;
}

export interface XmlValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate a generated XML string for Resolve compatibility.
 * Checks Fusion Title structure, file references, and forbidden patterns.
 */
export function validateResolveXml(xml: string): XmlValidationResult {
  const issues: ValidationIssue[] = [];

  const hasFusionTitles = xml.includes("Fusion Title");

  if (hasFusionTitles) {
    // Rule 1: First Fusion Title clip must contain the full <file> block
    const fullFilePattern = `<file id="${FUSION_TITLE_FILE_ID}">`;
    if (!xml.includes(fullFilePattern)) {
      issues.push({
        level: "error",
        rule: "FUSION_FILE_DEFINITION",
        message: `Le premier titre Fusion doit contenir la définition complète du bloc <file id="${FUSION_TITLE_FILE_ID}">`,
      });
    }

    // Rule 2: File block must contain <mediaSource>Slug</mediaSource>
    if (!xml.includes("<mediaSource>Slug</mediaSource>")) {
      issues.push({
        level: "error",
        rule: "FUSION_MEDIA_SOURCE",
        message: "Le bloc <file> du Fusion Title doit contenir <mediaSource>Slug</mediaSource>",
      });
    }

    // Rule 3: No pathurl on Fusion Title file blocks
    // Check specifically within the Fusion Title track region
    const fusionTrackStart = xml.indexOf(`<file id="${FUSION_TITLE_FILE_ID}">`);
    if (fusionTrackStart >= 0) {
      const fusionRegion = xml.slice(fusionTrackStart, fusionTrackStart + 2000);
      if (fusionRegion.includes("<pathurl>")) {
        issues.push({
          level: "error",
          rule: "FUSION_NO_PATHURL",
          message: "Les Fusion Title ne doivent pas contenir de <pathurl> — ce sont des Slugs, pas des médias externes",
        });
      }
    }

    // Rule 4: All 3 required filters must be present
    const requiredFilters = ["Basic Motion", "Crop", "Opacity"];
    for (const filterName of requiredFilters) {
      // Count occurrences — should appear at least once per Fusion Title clip
      if (!xml.includes(`<name>${filterName}</name>`)) {
        issues.push({
          level: "error",
          rule: "FUSION_MISSING_FILTER",
          message: `Filtre manquant dans les Fusion Title : ${filterName}`,
        });
      }
    }

    // Rule 5: Duration must be the reference value (120)
    const clipDurationMatch = xml.match(
      /<clipitem id="Fusion Title 0">[\s\S]*?<duration>(\d+)<\/duration>/
    );
    if (clipDurationMatch && Number(clipDurationMatch[1]) !== FUSION_TITLE_DURATION) {
      issues.push({
        level: "error",
        rule: "FUSION_DURATION",
        message: `La durée source des Fusion Title doit être ${FUSION_TITLE_DURATION}, trouvé: ${clipDurationMatch[1]}`,
      });
    }

    // Rule 6: clipitem IDs must follow "Fusion Title N" pattern AND not collide with file id
    const clipIds = [...xml.matchAll(/clipitem id="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((id) => id.startsWith("Fusion Title"));
    for (const id of clipIds) {
      if (!/^Fusion Title \d+$/.test(id)) {
        issues.push({
          level: "error",
          rule: "FUSION_CLIP_ID_FORMAT",
          message: `ID de clipitem invalide : "${id}" — doit être "Fusion Title N"`,
        });
      }
      if (id === FUSION_TITLE_FILE_ID) {
        issues.push({
          level: "error",
          rule: "FUSION_ID_COLLISION",
          message: `Collision d'ID : clipitem "${id}" utilise le même ID que le bloc <file> — Resolve confond clip et fichier`,
        });
      }
    }

    // Rule 7: Subsequent clips must use self-closing file reference
    const shortRefs = (xml.match(new RegExp(`<file id="${FUSION_TITLE_FILE_ID}"/>`, "g")) || []).length;
    const fullRefs = (xml.match(new RegExp(`<file id="${FUSION_TITLE_FILE_ID}">`, "g")) || []).length;
    if (clipIds.length > 1 && shortRefs < clipIds.length - 1) {
      issues.push({
        level: "warning",
        rule: "FUSION_FILE_REUSE",
        message: `${clipIds.length - 1} titres devraient réutiliser la référence courte, trouvé ${shortRefs} (définitions complètes: ${fullRefs})`,
      });
    }

    // Rule 8: No <generatoritem> (legacy format)
    if (xml.includes("<generatoritem")) {
      issues.push({
        level: "error",
        rule: "LEGACY_GENERATORITEM",
        message: "L'ancien format <generatoritem> est présent — doit être remplacé par des <clipitem> Fusion Title",
      });
    }

    // Rule 9: No effectid Text (legacy text injection)
    if (xml.includes("<effectid>Text</effectid>")) {
      issues.push({
        level: "error",
        rule: "LEGACY_TEXT_EFFECT",
        message: "L'ancien effet Text est présent — les Fusion Title n'utilisent pas d'effectid Text",
      });
    }
  }

  return {
    valid: issues.filter((i) => i.level === "error").length === 0,
    issues,
  };
}

/**
 * Format validation issues as a human-readable report.
 */
export function formatValidationReport(result: XmlValidationResult): string {
  if (result.valid && result.issues.length === 0) {
    return "✅ XML Resolve valide — aucun problème détecté.";
  }

  const lines: string[] = [];
  const errors = result.issues.filter((i) => i.level === "error");
  const warnings = result.issues.filter((i) => i.level === "warning");

  if (errors.length > 0) {
    lines.push(`🔴 ${errors.length} erreur(s) bloquante(s) :`);
    errors.forEach((e, i) => lines.push(`  ${i + 1}. [${e.rule}] ${e.message}`));
  }

  if (warnings.length > 0) {
    lines.push(`⚠️ ${warnings.length} avertissement(s) :`);
    warnings.forEach((w, i) => lines.push(`  ${i + 1}. [${w.rule}] ${w.message}`));
  }

  return lines.join("\n");
}
