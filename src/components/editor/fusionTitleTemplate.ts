/**
 * fusionTitleTemplate.ts — Fusion Title Master Template
 *
 * Extracted verbatim from the DaVinci Resolve reference XML
 * ("Timeline avec titres avec le bon template.xml", clips at lines 55932–56189).
 *
 * This module stores the EXACT XML structure that Resolve expects for Fusion Title
 * clips on V2. It is the single source of truth — the export engine must clone
 * this template for every chapter title, changing ONLY the dynamic fields.
 *
 * ── ID Convention (from reference) ──
 *   clipitem id : "Fusion Title 0", "Fusion Title 3", …
 *   file id     : "Fusion Title 2" (shared by ALL clips)
 *
 *   Resolve uses sequential global IDs across elements:
 *     0 = first clipitem, 1 = internal, 2 = file, 3 = second clipitem, …
 *   Our generator simplifies to: clipitem "Fusion Title 0", "Fusion Title 1", …
 *   and file "Fusion Title 2" (fixed).
 *
 * ── Fixed fields (never change) ──
 *   <name>Fusion Title</name>
 *   <duration>120</duration>
 *   <enabled>TRUE</enabled>
 *   <in>0</in>
 *   <compositemode>normal</compositemode>
 *   3× <filter> blocks (Basic Motion, Crop, Opacity)
 *   <comments/>
 *   Full <file> block content (only on first clip)
 *
 * ── Dynamic fields (per title) ──
 *   clipitem id   → "Fusion Title {N}"
 *   <start>       → timeline frame position
 *   <end>         → timeline frame position
 *   <out>         → end - start
 *   <file>        → full block (first clip) or self-closing ref (subsequent)
 */

import type { ExportFps } from "./videoExportEngine";

// ── Constants ──────────────────────────────────────────────────────

/** Source duration used by DaVinci for Slug-based Fusion Titles */
export const FUSION_TITLE_DURATION = 120;

/** Fixed file ID — must start with "Fusion Title" for Resolve recognition */
export const FUSION_TITLE_FILE_ID = "Fusion Title 2";

// ── File block (first clip only) ───────────────────────────────────

/**
 * Full <file> block for the first Fusion Title clip.
 * Extracted verbatim from reference lines 55944–55968.
 * The fps/timebase is injected dynamically.
 */
export function buildMasterFileBlock(fps: ExportFps): string {
  return `<file id="${FUSION_TITLE_FILE_ID}">
                            <duration>${FUSION_TITLE_DURATION}</duration>
                            <rate>
                                <timebase>${fps}</timebase>
                                <ntsc>FALSE</ntsc>
                            </rate>
                            <name>Slug</name>
                            <timecode>
                                <string>00:00:00:00</string>
                                <displayformat>NDF</displayformat>
                                <rate>
                                    <timebase>${fps}</timebase>
                                    <ntsc>FALSE</ntsc>
                                </rate>
                            </timecode>
                            <media>
                                <video>
                                    <samplecharacteristics>
                                        <width>1920</width>
                                        <height>1080</height>
                                    </samplecharacteristics>
                                </video>
                            </media>
                            <mediaSource>Slug</mediaSource>
                        </file>`;
}

/**
 * Self-closing <file> reference for subsequent clips.
 * Must use the SAME id as the master block.
 */
export function buildFileReference(): string {
  return `<file id="${FUSION_TITLE_FILE_ID}"/>`;
}

// ── Filter blocks (identical for every clip) ───────────────────────

/**
 * The 3 filter blocks extracted verbatim from reference lines 55970–56070.
 * Order is critical: Basic Motion → Crop → Opacity.
 */
export function buildMasterFilters(): string {
  return `<filter>
                            <enabled>TRUE</enabled>
                            <start>0</start>
                            <end>${FUSION_TITLE_DURATION}</end>
                            <effect>
                                <name>Basic Motion</name>
                                <effectid>basic</effectid>
                                <effecttype>motion</effecttype>
                                <mediatype>video</mediatype>
                                <effectcategory>motion</effectcategory>
                                <parameter>
                                    <name>Scale</name>
                                    <parameterid>scale</parameterid>
                                    <value>100</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>10000</valuemax>
                                </parameter>
                                <parameter>
                                    <name>Center</name>
                                    <parameterid>center</parameterid>
                                    <value>
                                        <horiz>0</horiz>
                                        <vert>0</vert>
                                    </value>
                                </parameter>
                                <parameter>
                                    <name>Rotation</name>
                                    <parameterid>rotation</parameterid>
                                    <value>0</value>
                                    <valuemin>-100000</valuemin>
                                    <valuemax>100000</valuemax>
                                </parameter>
                                <parameter>
                                    <name>Anchor Point</name>
                                    <parameterid>centerOffset</parameterid>
                                    <value>
                                        <horiz>0</horiz>
                                        <vert>0</vert>
                                    </value>
                                </parameter>
                            </effect>
                        </filter>
                        <filter>
                            <enabled>TRUE</enabled>
                            <start>0</start>
                            <end>${FUSION_TITLE_DURATION}</end>
                            <effect>
                                <name>Crop</name>
                                <effectid>crop</effectid>
                                <effecttype>motion</effecttype>
                                <mediatype>video</mediatype>
                                <effectcategory>motion</effectcategory>
                                <parameter>
                                    <name>left</name>
                                    <parameterid>left</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                                <parameter>
                                    <name>right</name>
                                    <parameterid>right</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                                <parameter>
                                    <name>top</name>
                                    <parameterid>top</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                                <parameter>
                                    <name>bottom</name>
                                    <parameterid>bottom</parameterid>
                                    <value>0</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                            </effect>
                        </filter>
                        <filter>
                            <enabled>TRUE</enabled>
                            <start>0</start>
                            <end>${FUSION_TITLE_DURATION}</end>
                            <effect>
                                <name>Opacity</name>
                                <effectid>opacity</effectid>
                                <effecttype>motion</effecttype>
                                <mediatype>video</mediatype>
                                <effectcategory>motion</effectcategory>
                                <parameter>
                                    <name>opacity</name>
                                    <parameterid>opacity</parameterid>
                                    <value>100</value>
                                    <valuemin>0</valuemin>
                                    <valuemax>100</valuemax>
                                </parameter>
                            </effect>
                        </filter>`;
}

// ── Validation ─────────────────────────────────────────────────────

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that the master template is structurally complete.
 * Call this at export time to block invalid outputs.
 */
export function validateMasterTemplate(): TemplateValidationResult {
  const errors: string[] = [];

  // Check file block
  const fileBlock = buildMasterFileBlock(24);
  if (!fileBlock.includes(`id="${FUSION_TITLE_FILE_ID}"`)) {
    errors.push("File block missing correct id attribute");
  }
  if (!fileBlock.includes("<mediaSource>Slug</mediaSource>")) {
    errors.push("File block missing <mediaSource>Slug</mediaSource>");
  }
  if (!fileBlock.includes("<name>Slug</name>")) {
    errors.push("File block missing <name>Slug</name>");
  }

  // Check filters
  const filters = buildMasterFilters();
  const requiredEffects = ["Basic Motion", "Crop", "Opacity"];
  for (const effect of requiredEffects) {
    if (!filters.includes(`<name>${effect}</name>`)) {
      errors.push(`Missing required filter: ${effect}`);
    }
  }

  // Check filter order (Basic Motion before Crop before Opacity)
  const bmIdx = filters.indexOf("Basic Motion");
  const cropIdx = filters.indexOf("Crop");
  const opIdx = filters.indexOf("Opacity");
  if (bmIdx > cropIdx || cropIdx > opIdx) {
    errors.push("Filters are not in correct order: Basic Motion → Crop → Opacity");
  }

  // Check file reference
  const ref = buildFileReference();
  if (!ref.includes(`id="${FUSION_TITLE_FILE_ID}"`)) {
    errors.push("File reference uses wrong id");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
