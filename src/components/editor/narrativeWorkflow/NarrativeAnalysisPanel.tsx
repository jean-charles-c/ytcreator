import { Loader2, Sparkles, AlertCircle, CheckCircle2, RefreshCw, Save, Wand2, Info, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AnalysisPayload = {
  title?: string;
  summary?: string;
  confidence_level?: "low" | "medium" | "high";
  confidence_reason?: string;
  structure?: {
    archetype?: string;
    beats?: { name: string; role: string; placement_pct?: number }[];
    opening_strategy?: string;
    closing_strategy?: string;
  };
  patterns?: { name: string; description: string; transferable_to: string }[];
  tone?: {
    register?: string;
    emotional_palette?: string[];
    narrator_posture?: string;
  };
  rhythm?: {
    pacing?: string;
    sentence_length?: string;
    variations?: string;
  };
  writing_rules?: { rule: string; rationale: string }[];
  recommendations?: { do?: string[]; avoid?: string[] };
  variations?: {
    summary?: string;
    items?: { axis: string; observation: string }[];
  };
};

interface NarrativeAnalysisPanelProps {
  status: "idle" | "running" | "success" | "error";
  errorMessage?: string | null;
  result?: AnalysisPayload | null;
  sourcesUsed?: number;
  onRetry?: () => void;
  onSaveAsForm?: () => void;
  onGeneratePitches?: () => void;
  saving?: boolean;
}

const CONFIDENCE_TONE: Record<string, string> = {
  low: "bg-warn/10 text-warn border-warn/30",
  medium: "bg-primary/10 text-primary border-primary/30",
  high: "bg-success/10 text-success border-success/30",
};

/**
 * Étape 7 — Affichage du résultat d'analyse narrative.
 * Affiche tous les axes : structure, patterns, ton, rythme, règles, reco.
 */
export default function NarrativeAnalysisPanel({
  status,
  errorMessage,
  result,
  sourcesUsed,
  onRetry,
  onSaveAsForm,
  onGeneratePitches,
  saving = false,
}: NarrativeAnalysisPanelProps) {
  if (status === "idle") return null;

  if (status === "running") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5 flex items-start gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Analyse narrative en cours…
          </p>
          <p className="text-xs text-muted-foreground">
            L'IA extrait la mécanique narrative transférable. Cela peut prendre 30 à 90 secondes.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:p-5 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-destructive">
            Analyse impossible
          </p>
          <p className="text-xs text-muted-foreground">
            {errorMessage || "Une erreur inconnue est survenue."}
          </p>
          {onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" />
              Réessayer
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!result) return null;
  const conf = result.confidence_level ?? "medium";
  const showSingleSourceWarning = (sourcesUsed ?? 0) <= 1;
  const showLowSourceTip = !showSingleSourceWarning && (sourcesUsed ?? 0) < 3;

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="font-display text-sm sm:text-base font-semibold text-foreground">
              {result.title || "Mécanique narrative extraite"}
            </h4>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border",
                CONFIDENCE_TONE[conf] ?? CONFIDENCE_TONE.medium,
              )}
            >
              Confiance {conf}
            </span>
            {typeof sourcesUsed === "number" && (
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                · {sourcesUsed} source{sourcesUsed > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {result.confidence_reason && (
            <p className="text-[11px] text-muted-foreground italic">
              {result.confidence_reason}
            </p>
          )}
        </div>
      </div>

      {/* Bandeau de recommandation sur le nombre de sources */}
      {(showSingleSourceWarning || showLowSourceTip) && (
        <div
          className={cn(
            "rounded-md border p-2.5 flex items-start gap-2",
            showSingleSourceWarning
              ? "border-warn/30 bg-warn/5"
              : "border-primary/20 bg-primary/5",
          )}
        >
          <Info
            className={cn(
              "h-3.5 w-3.5 shrink-0 mt-0.5",
              showSingleSourceWarning ? "text-warn" : "text-primary",
            )}
          />
          <div className="text-[11px] sm:text-xs space-y-0.5">
            {showSingleSourceWarning ? (
              <>
                <p className="font-medium text-foreground">
                  Analyse basée sur une seule source.
                </p>
                <p className="text-muted-foreground">
                  La mécanique extraite reflète uniquement cette vidéo et peut
                  manquer de robustesse. Idéalement, ajoute 3 vidéos ou
                  transcriptions pour détecter une structure commune plus fiable.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Idéalement, ajoute 3 vidéos ou transcriptions pour détecter
                une structure commune plus fiable.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Synthèse */}
      {result.summary && (
        <Section title="Synthèse globale">
          <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
            {result.summary}
          </p>
        </Section>
      )}

      {/* Structure */}
      {result.structure && (
        <Section title="Structure narrative">
          {result.structure.archetype && (
            <p className="text-xs sm:text-sm">
              <span className="font-semibold text-foreground">Archétype :</span>{" "}
              <span className="text-muted-foreground">{result.structure.archetype}</span>
            </p>
          )}
          {result.structure.opening_strategy && (
            <p className="text-xs sm:text-sm">
              <span className="font-semibold text-foreground">Ouverture :</span>{" "}
              <span className="text-muted-foreground">{result.structure.opening_strategy}</span>
            </p>
          )}
          {result.structure.closing_strategy && (
            <p className="text-xs sm:text-sm">
              <span className="font-semibold text-foreground">Clôture :</span>{" "}
              <span className="text-muted-foreground">{result.structure.closing_strategy}</span>
            </p>
          )}
          {result.structure.beats && result.structure.beats.length > 0 && (
            <ol className="mt-2 space-y-1.5 text-xs sm:text-sm">
              {result.structure.beats.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                    {typeof b.placement_pct === "number" && ` · ${Math.round(b.placement_pct)}%`}
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">{b.name} :</span>{" "}
                    <span className="text-muted-foreground">{b.role}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      {/* Patterns */}
      {result.patterns && result.patterns.length > 0 && (
        <Section title="Patterns transférables">
          <ul className="space-y-2">
            {result.patterns.map((p, i) => (
              <li key={i} className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                <p className="text-xs sm:text-sm font-semibold text-foreground">{p.name}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{p.description}</p>
                {p.transferable_to && (
                  <p className="text-[10px] sm:text-[11px] text-primary mt-1">
                    → Transférable à : {p.transferable_to}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Ton & Rythme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {result.tone && (
          <Section title="Ton">
            {result.tone.register && (
              <p className="text-xs"><span className="font-semibold">Registre :</span> <span className="text-muted-foreground">{result.tone.register}</span></p>
            )}
            {result.tone.narrator_posture && (
              <p className="text-xs"><span className="font-semibold">Posture du narrateur :</span> <span className="text-muted-foreground">{result.tone.narrator_posture}</span></p>
            )}
            {result.tone.emotional_palette && result.tone.emotional_palette.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {result.tone.emotional_palette.map((e, i) => (
                  <span key={i} className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/40 text-foreground">
                    {e}
                  </span>
                ))}
              </div>
            )}
          </Section>
        )}
        {result.rhythm && (
          <Section title="Rythme">
            {result.rhythm.pacing && (
              <p className="text-xs"><span className="font-semibold">Cadence :</span> <span className="text-muted-foreground">{result.rhythm.pacing}</span></p>
            )}
            {result.rhythm.sentence_length && (
              <p className="text-xs"><span className="font-semibold">Phrases :</span> <span className="text-muted-foreground">{result.rhythm.sentence_length}</span></p>
            )}
            {result.rhythm.variations && (
              <p className="text-xs"><span className="font-semibold">Variations :</span> <span className="text-muted-foreground">{result.rhythm.variations}</span></p>
            )}
          </Section>
        )}
      </div>

      {/* Règles d'écriture */}
      {result.writing_rules && result.writing_rules.length > 0 && (
        <Section title="Règles d'écriture implicites">
          <ul className="space-y-1.5">
            {result.writing_rules.map((r, i) => (
              <li key={i} className="text-xs sm:text-sm">
                <span className="font-semibold text-foreground">• {r.rule}</span>
                {r.rationale && (
                  <span className="text-muted-foreground"> — {r.rationale}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Variations entre sources */}
      {result.variations && (
        result.variations.summary || (result.variations.items && result.variations.items.length > 0)
      ) && (
        <Section title="Variations observées entre sources">
          <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-start gap-2">
              <GitCompareArrows className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              {result.variations.summary && (
                <p className="text-xs text-foreground/90 leading-relaxed">
                  {result.variations.summary}
                </p>
              )}
            </div>
            {result.variations.items && result.variations.items.length > 0 && (
              <ul className="space-y-1 pl-5">
                {result.variations.items.map((v, i) => (
                  <li key={i} className="text-[11px] sm:text-xs">
                    <span className="font-semibold text-foreground">{v.axis} :</span>{" "}
                    <span className="text-muted-foreground">{v.observation}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}

      {/* Recommandations */}
      {result.recommendations && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {result.recommendations.do && result.recommendations.do.length > 0 && (
            <Section title="À faire">
              <ul className="space-y-1 text-xs sm:text-sm">
                {result.recommendations.do.map((d, i) => (
                  <li key={i} className="text-success-foreground/90">✓ {d}</li>
                ))}
              </ul>
            </Section>
          )}
          {result.recommendations.avoid && result.recommendations.avoid.length > 0 && (
            <Section title="À éviter">
              <ul className="space-y-1 text-xs sm:text-sm">
                {result.recommendations.avoid.map((a, i) => (
                  <li key={i} className="text-destructive/90">✗ {a}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Actions étape suivante */}
      <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          Que souhaites-tu faire de cette analyse ?
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSaveAsForm}
            disabled={!onSaveAsForm || saving}
            className="min-h-[40px] sm:min-h-[36px] w-full sm:w-auto justify-center"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="sm:hidden">Sauvegarder la forme</span>
            <span className="hidden sm:inline">Sauvegarder comme forme narrative</span>
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onGeneratePitches}
            disabled={!onGeneratePitches || saving}
            className="min-h-[40px] sm:min-h-[36px] w-full sm:w-auto justify-center"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span className="sm:hidden">Générer 5 pitchs</span>
            <span className="hidden sm:inline">Générer 5 propositions d'histoires</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h5 className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
        {title}
      </h5>
      <div className="space-y-1">{children}</div>
    </div>
  );
}