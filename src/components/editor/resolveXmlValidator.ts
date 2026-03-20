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

    // ── ExternalMediaGuard (Rules 10-15) ──────────────────────────────
    // Detect fields inside Fusion Title clipitems that make Resolve treat
    // the title as an external media file instead of a native Fusion Title.

    // Extract all Fusion Title clipitem blocks for deep inspection
    const fusionClipBlocks: string[] = [];
    const fusionClipRegex = /<clipitem id="Fusion Title \d+">([\s\S]*?)<\/clipitem>/g;
    let clipMatch: RegExpExecArray | null;
    while ((clipMatch = fusionClipRegex.exec(xml)) !== null) {
      fusionClipBlocks.push(clipMatch[0]);
    }

    const forbiddenInFusionClip: { tag: string; rule: string; message: string }[] = [
      {
        tag: "<stillframe>",
        rule: "FUSION_EXTERNAL_STILLFRAME",
        message: "Un Fusion Title contient <stillframe> — Resolve le traite comme une image fixe externe",
      },
      {
        tag: "<masterclipid>",
        rule: "FUSION_EXTERNAL_MASTERCLIP",
        message: "Un Fusion Title contient <masterclipid> — réservé aux vrais médias, pas aux titres Fusion",
      },
      {
        tag: "<anamorphic>",
        rule: "FUSION_EXTERNAL_ANAMORPHIC",
        message: "Un Fusion Title contient <anamorphic> — champ de média externe absent du template valide",
      },
      {
        tag: "<sourcetrack>",
        rule: "FUSION_EXTERNAL_SOURCETRACK",
        message: "Un Fusion Title contient <sourcetrack> — champ de média externe absent du template valide",
      },
      {
        tag: "<pixelaspectratio>",
        rule: "FUSION_EXTERNAL_PIXELASPECT",
        message: "Un Fusion Title contient <pixelaspectratio> — champ de média externe absent du template valide",
      },
    ];

    for (const block of fusionClipBlocks) {
      for (const forbidden of forbiddenInFusionClip) {
        if (block.includes(forbidden.tag)) {
          issues.push({
            level: "error",
            rule: forbidden.rule,
            message: forbidden.message,
          });
          break; // One detection per rule is enough
        }
      }

      // Special check: <media><video> inside clipitem (not inside <file>)
      const blockWithoutFile = block.replace(/<file[^/]*>[\s\S]*?<\/file>/g, "");
      if (blockWithoutFile.includes("<media>")) {
        issues.push({
          level: "error",
          rule: "FUSION_EXTERNAL_MEDIA_BLOCK",
          message: "Un Fusion Title contient un bloc <media> au niveau clipitem — sémantique de média externe",
        });
        break;
      }
    }

    // ── ResolveImportGate (Rules 16-17) ───────────────────────────────
    // Structural parity: verify the first Fusion Title clipitem contains
    // exactly the expected tag sequence from the master template.
    // This catches any drift even if individual forbidden-field rules pass.

    if (fusionClipBlocks.length > 0) {
      const firstClip = fusionClipBlocks[0];

      // Expected top-level tag order inside the first clipitem (from reference XML)
      const EXPECTED_TAG_SEQUENCE = [
        "name", "duration", "rate", "start", "end", "enabled", "in", "out",
        "file", "compositemode", "filter", "filter", "filter", "comments",
      ];

      // Extract actual top-level tags (direct children of clipitem)
      const actualTags: string[] = [];
      // Strip the outer <clipitem> wrapper
      const inner = firstClip.replace(/^<clipitem[^>]*>/, "").replace(/<\/clipitem>$/, "");
      // Match top-level opening tags (not nested ones) by tracking depth
      const tagRegex = /<(\/?)([\w-]+)[^>]*>/g;
      let depth = 0;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = tagRegex.exec(inner)) !== null) {
        const isClosing = tagMatch[1] === "/";
        const tagName = tagMatch[2];
        if (isClosing) {
          depth = Math.max(0, depth - 1);
        } else {
          if (depth === 0) {
            actualTags.push(tagName);
          }
          // Self-closing tags don't increase depth
          if (!tagMatch[0].endsWith("/>")) {
            depth++;
          }
        }
      }

      // Compare sequences
      const expectedStr = EXPECTED_TAG_SEQUENCE.join(",");
      const actualStr = actualTags.join(",");
      if (actualStr !== expectedStr) {
        // Find first divergence point for diagnostic
        let divergeIdx = 0;
        for (let i = 0; i < Math.max(EXPECTED_TAG_SEQUENCE.length, actualTags.length); i++) {
          if (EXPECTED_TAG_SEQUENCE[i] !== actualTags[i]) {
            divergeIdx = i;
            break;
          }
        }
        const expected = EXPECTED_TAG_SEQUENCE[divergeIdx] ?? "(fin)";
        const actual = actualTags[divergeIdx] ?? "(fin)";

        issues.push({
          level: "error",
          rule: "FUSION_STRUCTURAL_PARITY",
          message: `Structure du premier Fusion Title diverge du modèle valide à la position ${divergeIdx} : attendu <${expected}>, trouvé <${actual}>. Séquence attendue : [${expectedStr}]`,
        });
      }

      // Rule 17: Subsequent clips must NOT contain full <file> block
      for (let i = 1; i < fusionClipBlocks.length; i++) {
        if (fusionClipBlocks[i].includes(`<file id="${FUSION_TITLE_FILE_ID}">`)) {
          issues.push({
            level: "error",
            rule: "FUSION_SUBSEQUENT_FULL_FILE",
            message: `Le Fusion Title ${i + 1} contient une définition complète <file> au lieu de la référence courte — Resolve duplique le média`,
          });
          break;
        }
      }
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
    return "✅ XML Resolve valide — importable sans relink de Fusion Title.";
  }

  const lines: string[] = [];
  const errors = result.issues.filter((i) => i.level === "error");
  const warnings = result.issues.filter((i) => i.level === "warning");

  if (errors.length > 0) {
    lines.push(`🔴 ${errors.length} erreur(s) bloquante(s) :`);
    errors.forEach((e, i) => lines.push(`  ${i + 1}. [${e.rule}] ${e.message}`));
    lines.push("");
    lines.push("⛔ Verdict : susceptible de produire « Fichier introuvable » dans Resolve. Export bloqué.");
  }

  if (warnings.length > 0) {
    lines.push(`⚠️ ${warnings.length} avertissement(s) :`);
    warnings.forEach((w, i) => lines.push(`  ${i + 1}. [${w.rule}] ${w.message}`));
  }

  if (errors.length === 0) {
    lines.push("");
    lines.push("✅ Verdict : théoriquement importable sans relink de Fusion Title.");
  }

  return lines.join("\n");
}
