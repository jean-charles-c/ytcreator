import { useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  MapPin,
  Clock,
  Users,
  BookOpen,
  BarChart3,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Scene = Tables<"scenes">;

interface SceneContext {
  contexte_scene: string;
  sujet: string;
  lieu: string;
  epoque: string;
  personnages: string;
  coherence_globale: string;
}

interface QaCheck {
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
}

interface SceneQaResult {
  scene: Scene;
  checks: QaCheck[];
  score: number; // 0-100
}

const STATUS_ICON = {
  ok: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  warning: <AlertTriangle className="h-3 w-3 text-amber-500" />,
  error: <XCircle className="h-3 w-3 text-red-500" />,
};

function analyzeScene(scene: Scene, index: number, allScenes: Scene[]): SceneQaResult {
  const ctx = (scene as any).scene_context as SceneContext | null;
  const checks: QaCheck[] = [];

  // 1. Bloc CONTEXTE complet
  if (!ctx) {
    checks.push({ label: "Bloc CONTEXTE", status: "error", detail: "Absent — pas de bloc contexte" });
  } else {
    const fields = ["contexte_scene", "sujet", "lieu", "epoque", "personnages", "coherence_globale"];
    const missing = fields.filter((f) => !ctx[f as keyof SceneContext] || ctx[f as keyof SceneContext] === "Non déterminé");
    if (missing.length === 0) {
      checks.push({ label: "Bloc CONTEXTE", status: "ok", detail: "6/6 champs renseignés" });
    } else if (missing.length <= 2) {
      checks.push({ label: "Bloc CONTEXTE", status: "warning", detail: `${6 - missing.length}/6 champs — manquants : ${missing.join(", ")}` });
    } else {
      checks.push({ label: "Bloc CONTEXTE", status: "error", detail: `${6 - missing.length}/6 champs — manquants : ${missing.join(", ")}` });
    }
  }

  // 2. Cohérence lieu
  if (ctx) {
    const coherence = ctx.coherence_globale || "";
    if (coherence.includes("[Continuité totale]")) {
      checks.push({ label: "Cohérence lieu", status: "ok", detail: "Continuité totale avec le contexte global" });
    } else if (coherence.includes("[Variation locale justifiée]")) {
      checks.push({ label: "Cohérence lieu", status: "ok", detail: "Variation locale justifiée" });
    } else if (coherence.includes("[Adaptation interprétée]")) {
      checks.push({ label: "Cohérence lieu", status: "warning", detail: "Adaptation interprétée — à vérifier" });
    } else if (coherence.includes("[Exception narrative cohérente]")) {
      checks.push({ label: "Cohérence lieu", status: "warning", detail: "Exception narrative — vérifier la cohérence" });
    } else {
      checks.push({ label: "Cohérence lieu", status: "ok", detail: coherence.slice(0, 60) || "OK" });
    }
  }

  // 3. Cohérence époque
  if (ctx) {
    if (ctx.epoque && ctx.epoque !== "Non déterminé") {
      const prevCtx = index > 0 ? (allScenes[index - 1] as any).scene_context as SceneContext | null : null;
      if (prevCtx && prevCtx.epoque && prevCtx.epoque !== ctx.epoque) {
        const coherence = ctx.coherence_globale || "";
        if (coherence.includes("Variation temporelle")) {
          checks.push({ label: "Cohérence époque", status: "warning", detail: `Changement : ${prevCtx.epoque} → ${ctx.epoque}` });
        } else {
          checks.push({ label: "Cohérence époque", status: "error", detail: `Changement non justifié : ${prevCtx.epoque} → ${ctx.epoque}` });
        }
      } else {
        checks.push({ label: "Cohérence époque", status: "ok", detail: ctx.epoque });
      }
    } else {
      checks.push({ label: "Cohérence époque", status: "warning", detail: "Époque non déterminée" });
    }
  }

  // 4. Continuité personnages
  if (ctx) {
    const personnages = ctx.personnages || "";
    if (personnages === "Non déterminé" || personnages === "Aucun personnage actif") {
      checks.push({ label: "Personnages", status: "warning", detail: personnages });
    } else if (personnages.includes("(")) {
      // Structured format "Nom (rôle)"
      checks.push({ label: "Personnages", status: "ok", detail: personnages.slice(0, 80) });
    } else if (personnages === "none") {
      checks.push({ label: "Personnages", status: "warning", detail: "Aucun personnage identifié" });
    } else {
      checks.push({ label: "Personnages", status: "ok", detail: personnages.slice(0, 80) });
    }
  }

  // 5. Utilité visuelle
  if (scene.visual_intention && scene.visual_intention !== "Non spécifié") {
    checks.push({ label: "Intention visuelle", status: "ok", detail: scene.visual_intention.slice(0, 80) });
  } else {
    checks.push({ label: "Intention visuelle", status: "error", detail: "Aucune intention visuelle définie" });
  }

  // Score
  const weights = { ok: 20, warning: 10, error: 0 };
  const score = Math.round(checks.reduce((acc, c) => acc + weights[c.status], 0) / checks.length * 5);

  return { scene, checks, score };
}

interface SegmentationQaPanelProps {
  scenes: Scene[];
}

export default function SegmentationQaPanel({ scenes }: SegmentationQaPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const results = useMemo(() => scenes.map((s, i) => analyzeScene(s, i, scenes)), [scenes]);

  const globalScore = useMemo(() => {
    if (results.length === 0) return 0;
    return Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length);
  }, [results]);

  const stats = useMemo(() => {
    let contextComplete = 0;
    let locationStable = 0;
    let epochStable = 0;
    let charsTracked = 0;
    let visualReady = 0;

    for (const r of results) {
      for (const c of r.checks) {
        if (c.label === "Bloc CONTEXTE" && c.status === "ok") contextComplete++;
        if (c.label === "Cohérence lieu" && c.status === "ok") locationStable++;
        if (c.label === "Cohérence époque" && c.status === "ok") epochStable++;
        if (c.label === "Personnages" && c.status === "ok") charsTracked++;
        if (c.label === "Intention visuelle" && c.status === "ok") visualReady++;
      }
    }

    return { contextComplete, locationStable, epochStable, charsTracked, visualReady, total: results.length };
  }, [results]);

  if (scenes.length === 0) return null;

  const scoreColor = globalScore >= 80 ? "text-green-500" : globalScore >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <details className="mb-6 rounded-lg border border-border bg-card p-3 sm:p-5 group">
      <summary className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5 sm:gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden flex-wrap min-h-[44px]">
        <BarChart3 className="h-4 w-4 text-primary shrink-0" />
        <span className="hidden sm:inline">Validation Qualité Segmentation</span>
        <span className="sm:hidden">Qualité</span>
        <span className={`ml-1 sm:ml-2 text-xs font-bold ${scoreColor}`}>{globalScore}%</span>
        <span className="hidden sm:inline ml-1 text-xs text-muted-foreground font-normal">— {results.length} scènes</span>
        <span className="ml-auto text-muted-foreground text-xs group-open:rotate-90 transition-transform">▶</span>
      </summary>

      <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
        {/* Global indicators */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
          {[
            { icon: <BookOpen className="h-3 w-3 sm:h-3.5 sm:w-3.5" />, label: "Contexte", labelFull: "Contexte complet", value: stats.contextComplete, total: stats.total },
            { icon: <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" />, label: "Lieu", labelFull: "Lieu stable", value: stats.locationStable, total: stats.total },
            { icon: <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />, label: "Époque", labelFull: "Époque stable", value: stats.epochStable, total: stats.total },
            { icon: <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />, label: "Perso.", labelFull: "Personnages suivis", value: stats.charsTracked, total: stats.total },
            { icon: <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />, label: "Visuel", labelFull: "Visuel prêt", value: stats.visualReady, total: stats.total },
          ].map((stat) => {
            const pct = stat.total > 0 ? Math.round((stat.value / stat.total) * 100) : 0;
            const color = pct >= 80 ? "text-green-600 bg-green-500/10 border-green-500/20" : pct >= 50 ? "text-amber-600 bg-amber-500/10 border-amber-500/20" : "text-red-600 bg-red-500/10 border-red-500/20";
            return (
              <div key={stat.labelFull} className={`rounded border p-1.5 sm:p-2 text-center ${color}`}>
                <div className="flex items-center justify-center gap-1 mb-0.5">{stat.icon}</div>
                <div className="text-sm sm:text-lg font-bold">{stat.value}/{stat.total}</div>
                <div className="text-[9px] sm:text-[10px] leading-tight hidden sm:block">{stat.labelFull}</div>
                <div className="text-[9px] leading-tight sm:hidden">{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* Per-scene detail */}
        <div className="space-y-1">
          {results.map((r) => {
            const isExpanded = expanded === r.scene.id;
            const worstStatus = r.checks.some((c) => c.status === "error") ? "error" : r.checks.some((c) => c.status === "warning") ? "warning" : "ok";
            return (
              <div key={r.scene.id} className="rounded border border-border bg-background">
                <button
                  onClick={() => setExpanded(isExpanded ? null : r.scene.id)}
                  className="w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors min-h-[44px]"
                >
                  {STATUS_ICON[worstStatus]}
                  <span className="font-medium text-foreground text-xs shrink-0">S{r.scene.scene_order}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{r.scene.title}</span>
                  <span className={`text-[10px] font-bold shrink-0 ${r.score >= 80 ? "text-green-500" : r.score >= 50 ? "text-amber-500" : "text-red-500"}`}>{r.score}%</span>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                </button>
                {isExpanded && (
                  <div className="px-2 sm:px-3 pb-2 sm:pb-3 space-y-1.5 border-t border-border pt-2">
                    {r.checks.map((c, ci) => (
                      <div key={ci} className="flex items-start gap-1.5 sm:gap-2 text-xs">
                        <span className="shrink-0 mt-0.5">{STATUS_ICON[c.status]}</span>
                        <span className="font-medium text-foreground w-20 sm:w-28 shrink-0">{c.label}</span>
                        <span className="text-muted-foreground break-words min-w-0">{c.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
