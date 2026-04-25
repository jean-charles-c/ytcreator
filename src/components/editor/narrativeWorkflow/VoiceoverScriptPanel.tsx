import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  Wand2,
  RefreshCw,
  Copy,
  Check,
  Filter,
  Clock,
  Hash,
  Send,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useNarrativeOutline } from "@/hooks/useNarrativeOutline";
import { useNarrativeScenes } from "@/hooks/useNarrativeScenes";
import { useVoiceoverScript } from "@/hooks/useVoiceoverScript";

interface VoiceoverScriptPanelProps {
  projectId: string | null;
  /**
   * Étape 15 — Callback pour envoyer le script complet vers le scriptInput
   * de ScriptCreator. Le contenu est nettoyé des en-têtes "SCÈNE N — Titre"
   * (le texte voix off seul est transféré). Les titres extraits sont passés
   * en second paramètre pour pré-remplir les chapitres vidéo.
   */
  onSendToScriptCreator?: (
    content: string,
    chapterTitles?: { title: string; sourceText: string }[],
  ) => void;
  /**
   * Indique si un script est déjà chargé côté ScriptCreator. Utilisé pour
   * demander confirmation avant écrasement.
   */
  hasExistingScriptInput?: boolean;
}

/**
 * Étape 14 — Génération du script voix off complet.
 * Affiche le script en un seul bloc, scène par scène, avec le format
 * `SCÈNE X — Titre de la scène`.
 * N'envoie PAS automatiquement au ScriptCreator.
 */
export default function VoiceoverScriptPanel({
  projectId,
  onSendToScriptCreator,
  hasExistingScriptInput = false,
}: VoiceoverScriptPanelProps) {
  const { data: outlineData, loading: loadingOutline } = useNarrativeOutline(projectId);
  const outline = outlineData?.outline ?? null;
  const chapters = outlineData?.chapters ?? [];
  const { scenesByChapter, loading: loadingScenes } = useNarrativeScenes(
    projectId,
    outline?.id ?? null,
  );
  const { script, loading: loadingScript, reload } = useVoiceoverScript(
    projectId,
    outline?.id ?? null,
  );

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validatedOnly, setValidatedOnly] = useState(false);
  const [askOverwrite, setAskOverwrite] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [sending, setSending] = useState(false);
  const [askSendOverwrite, setAskSendOverwrite] = useState(false);

  const allScenes = useMemo(
    () => Object.values(scenesByChapter).flat(),
    [scenesByChapter],
  );
  const validatedCount = useMemo(
    () => allScenes.filter((s) => s.validated).length,
    [allScenes],
  );
  const totalScenes = allScenes.length;
  const eligibleScenes = validatedOnly ? validatedCount : totalScenes;

  const callGenerate = useCallback(
    async (overwrite: boolean) => {
      if (!projectId) return;
      if (eligibleScenes === 0) {
        toast.error(
          validatedOnly
            ? "Aucune scène validée disponible."
            : "Aucune scène disponible. Génère d'abord les scènes.",
        );
        return;
      }
      setBusy(true);
      try {
        const { data: res, error } = await supabase.functions.invoke(
          "generate-voiceover-script",
          {
            body: {
              project_id: projectId,
              overwrite,
              validated_only: validatedOnly,
              instructions: instructions.trim() || null,
            },
          },
        );
        if (error) {
          const msg =
            (error as any)?.context?.body?.error ||
            (error as any)?.message ||
            "Erreur lors de la génération";
          throw new Error(msg);
        }
        if (!res?.ok) {
          if (res?.error === "script_exists") {
            setAskOverwrite(true);
            return;
          }
          throw new Error(res?.error || "Génération échouée");
        }
        toast.success(
          `Script voix off généré (${res.scenes_count ?? 0} scènes, ~${res.word_count ?? 0} mots).`,
        );
        await reload();
      } catch (e: any) {
        console.error("generate voiceover script", e);
        toast.error(e?.message || "Erreur lors de la génération");
      } finally {
        setBusy(false);
      }
    },
    [projectId, validatedOnly, instructions, eligibleScenes, reload],
  );

  const onCopy = useCallback(async () => {
    if (!script?.content) return;
    try {
      await navigator.clipboard.writeText(script.content);
      setCopied(true);
      toast.success("Script copié dans le presse-papiers.");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error("Impossible de copier.");
    }
  }, [script]);

  /**
   * Étape 15 — Envoi du script vers le scriptInput de ScriptCreator.
   * - Disponible uniquement si script_created (script existe).
   * - Préserve titres de scène et sauts de ligne (envoi du contenu tel quel).
   * - Marque sent_to_scriptcreator_at sur la ligne voiceover_scripts.
   * - Demande confirmation si un script est déjà présent dans ScriptCreator.
   */
  const doSendToScriptCreator = useCallback(async () => {
    if (!script?.content || !onSendToScriptCreator) return;
    setSending(true);
    try {
      // 1. Extraction des titres de scènes + nettoyage du texte voix off.
      //    Format source : "SCÈNE N — Titre\n<voix off>\n\nSCÈNE N+1 — ..."
      const sceneHeaderRe = /^\s*SC[ÈE]NE\s+\d+\s*[—\-–:]\s*(.+?)\s*$/i;
      const blocks = script.content.split(/\n\s*\n+/);
      const chapters: { title: string; sourceText: string }[] = [];
      const cleanedBlocks: string[] = [];
      for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        const first = lines[0] ?? "";
        const m = first.match(sceneHeaderRe);
        if (m) {
          const title = m[1].trim();
          const body = lines.slice(1).join("\n").trim();
          if (body) {
            chapters.push({ title, sourceText: body });
            cleanedBlocks.push(body);
          }
        } else {
          const trimmed = block.trim();
          if (trimmed) cleanedBlocks.push(trimmed);
        }
      }
      const cleanedContent = cleanedBlocks.join("\n\n").trim();
      onSendToScriptCreator(cleanedContent, chapters);

      // 2. Marquage du statut côté DB (non-bloquant pour l'envoi).
      try {
        await supabase
          .from("voiceover_scripts")
          .update({
            status: "sent_to_scriptcreator",
            sent_to_scriptcreator_at: new Date().toISOString(),
          })
          .eq("id", script.id);
        await reload();
      } catch (e) {
        console.warn("[VoiceoverScriptPanel] mark sent failed", e);
      }

      toast.success(
        chapters.length
          ? `Script envoyé (${chapters.length} chapitres pré-remplis).`
          : "Script envoyé dans ScriptCreator.",
      );
    } finally {
      setSending(false);
    }
  }, [script, onSendToScriptCreator, reload]);

  const onSendClick = useCallback(() => {
    if (!script?.content || !onSendToScriptCreator) return;
    if (hasExistingScriptInput) {
      setAskSendOverwrite(true);
      return;
    }
    void doSendToScriptCreator();
  }, [script, onSendToScriptCreator, hasExistingScriptInput, doSendToScriptCreator]);

  if (!projectId) return null;
  if (loadingOutline) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
      </div>
    );
  }
  if (!outline) return null;

  const formatDuration = (s: number | null | undefined) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m} min ${sec.toString().padStart(2, "0")}s` : `${sec}s`;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <h4 className="font-display text-sm sm:text-base font-semibold text-foreground">
              Script voix off final
            </h4>
            {script && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                v{script.generation_index}
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            Génère un script en un seul bloc, scène par scène. Le format respecte
            la forme narrative et reste copiable vers ScriptCreator.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            size="sm"
            disabled={busy || loadingScenes || eligibleScenes === 0}
            onClick={() => callGenerate(script !== null)}
            className="min-h-[40px] sm:min-h-[36px] w-full sm:w-auto justify-center"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : script ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            <span className="ml-1.5 sm:hidden">
              {script ? "Régénérer" : "Générer le script"}
            </span>
            <span className="ml-1.5 hidden sm:inline">
              {script ? "Régénérer le script" : "Générer le script voix off"}
            </span>
          </Button>
        </div>
      </div>

      {/* Filtres et options */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border/60 bg-background/40 p-3">
        <div className="flex items-center gap-2 min-h-[36px]">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Switch
            id="validated-only"
            checked={validatedOnly}
            onCheckedChange={setValidatedOnly}
            disabled={busy}
          />
          <Label htmlFor="validated-only" className="text-xs cursor-pointer">
            Scènes validées uniquement
          </Label>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {totalScenes} scène{totalScenes > 1 ? "s" : ""} disponible
          {totalScenes > 1 ? "s" : ""} ·{" "}
          <span className="text-primary">{validatedCount} validée{validatedCount > 1 ? "s" : ""}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowInstructions((v) => !v)}
          className="sm:ml-auto text-[11px] text-primary hover:underline min-h-[32px] inline-flex items-center"
        >
          {showInstructions ? "Masquer" : "Ajouter"} des consignes
        </button>
      </div>

      {showInstructions && (
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Consignes éditoriales optionnelles (rythme, ton particulier, contraintes spécifiques)…"
          className="text-xs min-h-[80px]"
          disabled={busy}
        />
      )}

      {totalScenes === 0 && !loadingScenes && (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          Génère d'abord les scènes pour produire le script voix off.
        </div>
      )}

      {loadingScript && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement du script…
        </div>
      )}

      {script && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
            {script.title && (
              <span className="font-semibold text-foreground text-xs w-full sm:w-auto truncate">{script.title}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3 w-3" /> {script.word_count} mots
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> ≈ {formatDuration(script.estimated_duration_seconds)}
            </span>
            {script.ai_model && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border truncate max-w-[140px]">
                {script.ai_model}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="sm:ml-auto h-9 sm:h-7"
              onClick={onCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5 text-[11px]">
                {copied ? "Copié" : "Copier"}
              </span>
            </Button>
          </div>

          <Textarea
            value={script.content}
            readOnly
            className="font-mono text-[12px] leading-relaxed min-h-[280px] sm:min-h-[400px] whitespace-pre-wrap bg-background/60"
          />

          {/* Étape 15 — Envoi vers ScriptCreator */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 pt-1">
            {onSendToScriptCreator ? (
              <Button
                type="button"
                size="sm"
                onClick={onSendClick}
                disabled={sending || !script.content?.trim()}
                className="min-h-[40px] sm:min-h-[36px] w-full sm:w-auto justify-center"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">Envoyer vers ScriptCreator</span>
              </Button>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Copie le script pour le coller dans ScriptCreator.
              </p>
            )}
            {script.sent_to_scriptcreator_at && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Envoyé le{" "}
                {new Date(script.sent_to_scriptcreator_at).toLocaleString("fr-FR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            L'envoi insère le script tel quel dans le scriptInput de ScriptCreator,
            en préservant les titres de scènes et les sauts de ligne.
          </p>
        </div>
      )}

      <AlertDialog open={askOverwrite} onOpenChange={setAskOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer le script voix off existant ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un script voix off existe déjà pour ce sommaire. Confirmer pour le remplacer
              par une nouvelle génération.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAskOverwrite(false);
                void callGenerate(true);
              }}
            >
              Remplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Étape 15 — Confirmation d'écrasement du scriptInput existant */}
      <AlertDialog open={askSendOverwrite} onOpenChange={setAskSendOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer le script présent dans ScriptCreator ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un texte est déjà chargé dans le scriptInput de ScriptCreator. L'envoi va le
              remplacer par le script voix off généré ici. Cette action est sans effet sur
              les autres fonctionnalités de ScriptCreator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAskSendOverwrite(false);
                void doSendToScriptCreator();
              }}
            >
              Remplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}