/**
 * Narrative Form Generator — workflow steps definition
 *
 * Source unique des étapes du workflow guidé. Utilisé par l'indicateur
 * de progression (NarrativeWorkflowProgress) et par la vue principale.
 *
 * IMPORTANT : l'ordre de ce tableau définit l'ordre d'affichage et la
 * progression. Les `id` correspondent aux états distribués stockés en base
 * (cf. migration `narrative_*` tables, champ `status`).
 */

export type NarrativeWorkflowStepId =
  | "sources"
  | "analysis"
  | "form"
  | "pitches"
  | "project"
  | "outline"
  | "scenes"
  | "script"
  | "export";

export interface NarrativeWorkflowStep {
  id: NarrativeWorkflowStepId;
  label: string;
  description: string;
}

export const NARRATIVE_WORKFLOW_STEPS: NarrativeWorkflowStep[] = [
  {
    id: "sources",
    label: "Sources",
    description: "1 à 4 vidéos YouTube ou transcriptions.",
  },
  {
    id: "analysis",
    label: "Analyse",
    description: "Extraction de la mécanique narrative sous-jacente.",
  },
  {
    id: "form",
    label: "Forme narrative",
    description: "Sauvegarde d'un modèle réutilisable.",
  },
  {
    id: "pitches",
    label: "Pitchs",
    description: "Génération de lots de 5 propositions originales.",
  },
  {
    id: "project",
    label: "Projet",
    description: "Création d'un projet distinct depuis un pitch.",
  },
  {
    id: "outline",
    label: "Sommaire",
    description: "Structure narrative en chapitres.",
  },
  {
    id: "scenes",
    label: "Scènes",
    description: "Découpage en scènes exploitables.",
  },
  {
    id: "script",
    label: "Script",
    description: "Génération du script voix off complet.",
  },
  {
    id: "export",
    label: "Export",
    description: "Envoi vers ScriptCreator et Segmentation.",
  },
];