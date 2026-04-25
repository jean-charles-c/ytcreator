import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Link2,
  ClipboardPaste,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Youtube,
  RefreshCw,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  getSourceSemanticStatus,
  isSourceAnalyzable,
  STATUS_LABELS,
  type SourceSemanticStatus,
} from "./sourceStatus";

/**
 * Étape 5 — Source Manager 1 à 4 sources.
 *
 * Ce composant gère uniquement le CRUD des sources narratives. Il
 * n'effectue PAS d'appel à l'analyse IA (étape ultérieure) ni à
 * l'extraction automatique YouTube (étape ultérieure).
 *
 * Règles métier :
 *  - Maximum 4 sources par utilisateur (toutes confondues, MVP).
 *  - Une source possède soit une URL YouTube, soit une transcription
 *    collée manuellement (les deux peuvent coexister).
 *  - Les sources incomplètes (sans transcription) sont visibles, on
 *    n'en masque aucune.
 */

const MAX_SOURCES = 4;
const TRANSCRIPT_PREVIEW = 220;

export type NarrativeSourceRow = {
  id: string;
  user_id: string;
  youtube_url: string | null;
  title: string | null;
  channel: string | null;
  notes: string | null;
  transcript: string | null;
  transcript_source: string;
  fetch_status: string;
  status: string;
  language: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

type SourceFormState = {
  title: string;
  youtube_url: string;
  channel: string;
  transcript: string;
  notes: string;
};

type DialogMode =
  | { kind: "closed" }
  | { kind: "create-url" }
  | { kind: "create-transcript" }
  | { kind: "edit"; source: NarrativeSourceRow };

const EMPTY_FORM: SourceFormState = {
  title: "",
  youtube_url: "",
  channel: "",
  transcript: "",
  notes: "",
};

function isLikelyYoutubeUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === "youtu.be";
  } catch {
    return false;
  }
}

function wordCount(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface SourceManagerProps {
  onSourcesChange?: (count: number) => void;
  /** Appelé quand l'utilisateur clique sur « Analyser la structure narrative ». */
  onAnalyze?: (analyzableSources: NarrativeSourceRow[]) => void;
}

export default function SourceManager({ onSourcesChange, onAnalyze }: SourceManagerProps) {
  const { user } = useAuth();
  const [sources, setSources] = useState<NarrativeSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogMode>({ kind: "closed" });
  const [form, setForm] = useState<SourceFormState>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<NarrativeSourceRow | null>(null);
  /** ID des sources actuellement en cours d'extraction auto. */
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());

  const count = sources.length;
  const canAdd = count < MAX_SOURCES;

  const fetchSources = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("narrative_sources")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Impossible de charger les sources");
      setLoading(false);
      return;
    }
    setSources((data as NarrativeSourceRow[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    onSourcesChange?.(sources.length);
  }, [sources.length, onSourcesChange]);

  const openCreateUrl = useCallback(() => {
    if (!canAdd) {
      toast.error(`Maximum ${MAX_SOURCES} sources atteint`);
      return;
    }
    setForm(EMPTY_FORM);
    setDialog({ kind: "create-url" });
  }, [canAdd]);

  const openCreateTranscript = useCallback(() => {
    if (!canAdd) {
      toast.error(`Maximum ${MAX_SOURCES} sources atteint`);
      return;
    }
    setForm(EMPTY_FORM);
    setDialog({ kind: "create-transcript" });
  }, [canAdd]);

  const openEdit = useCallback((source: NarrativeSourceRow) => {
    setForm({
      title: source.title ?? "",
      youtube_url: source.youtube_url ?? "",
      channel: source.channel ?? "",
      transcript: source.transcript ?? "",
      notes: source.notes ?? "",
    });
    setDialog({ kind: "edit", source });
  }, []);

  const closeDialog = useCallback(() => {
    if (saving) return;
    setDialog({ kind: "closed" });
    setForm(EMPTY_FORM);
  }, [saving]);

  const validateForm = useCallback((mode: DialogMode["kind"]): string | null => {
    const t = form.title.trim();
    const url = form.youtube_url.trim();
    const transcript = form.transcript.trim();

    if (mode === "create-url") {
      if (!url) return "L'URL YouTube est requise.";
      if (!isLikelyYoutubeUrl(url)) return "URL YouTube invalide.";
    }
    if (mode === "create-transcript") {
      if (transcript.length < 50) {
        return "La transcription doit contenir au moins 50 caractères.";
      }
    }
    if (mode === "edit") {
      if (!url && !transcript) {
        return "Une URL YouTube ou une transcription est requise.";
      }
      if (url && !isLikelyYoutubeUrl(url)) return "URL YouTube invalide.";
    }
    if (t.length > 200) return "Titre trop long (200 max).";
    if (transcript.length > 200_000) return "Transcription trop longue (200 000 max).";
    return null;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    const err = validateForm(dialog.kind as DialogMode["kind"]);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);

    const trimmedTranscript = form.transcript.trim();
    const trimmedUrl = form.youtube_url.trim();
    const trimmedTitle = form.title.trim();

    const payload = {
      user_id: user.id,
      title: trimmedTitle || null,
      channel: form.channel.trim() || null,
      youtube_url: trimmedUrl || null,
      transcript: trimmedTranscript || null,
      notes: form.notes.trim() || null,
      transcript_source: trimmedTranscript ? "manual" : "manual",
      fetch_status: trimmedTranscript ? "ready" : trimmedUrl ? "pending" : "pending",
      status: "source_input",
    };

    try {
      if (dialog.kind === "edit") {
        const { error } = await (supabase as any)
          .from("narrative_sources")
          .update(payload)
          .eq("id", dialog.source.id);
        if (error) throw error;
        toast.success("Source mise à jour");
      } else {
        if (!canAdd) {
          toast.error(`Maximum ${MAX_SOURCES} sources atteint`);
          setSaving(false);
          return;
        }
        const { error } = await (supabase as any)
          .from("narrative_sources")
          .insert(payload);
        if (error) throw error;
        toast.success("Source ajoutée");
      }
      await fetchSources();
      setDialog({ kind: "closed" });
      setForm(EMPTY_FORM);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  }, [user, dialog, form, validateForm, canAdd, fetchSources]);

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("narrative_sources")
      .delete()
      .eq("id", pendingDelete.id);
    setSaving(false);
    if (error) {
      toast.error("Suppression impossible");
      return;
    }
    toast.success("Source supprimée");
    setPendingDelete(null);
    fetchSources();
  }, [pendingDelete, fetchSources]);

  const dialogTitle = useMemo(() => {
    if (dialog.kind === "create-url") return "Ajouter une URL YouTube";
    if (dialog.kind === "create-transcript") return "Coller une transcription";
    if (dialog.kind === "edit") return "Modifier la source";
    return "";
  }, [dialog]);

  /**
   * Tente l'extraction automatique de la transcription via l'edge function
   * `fetch-youtube-transcript`. Met à jour `fetch_status` et `transcript`
   * en base. En cas d'échec → `fetch_status = "failed"` (l'utilisateur
   * passe alors en fallback manuel).
   *
   * Ne bloque jamais les autres sources : chaque appel est isolé et les
   * erreurs sont catchées localement.
   */
  const tryAutoFetch = useCallback(
    async (sourceId: string, url: string, language: string | null) => {
      if (!user) return;
      setFetchingIds((prev) => new Set(prev).add(sourceId));
      await (supabase as any)
        .from("narrative_sources")
        .update({ fetch_status: "fetching" })
        .eq("id", sourceId);
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, fetch_status: "fetching" } : s)),
      );

      try {
        const { data, error } = await supabase.functions.invoke(
          "fetch-youtube-transcript",
          { body: { url, language: language || "fr" } },
        );
        if (error) throw error;

        if (data?.ok && typeof data.transcript === "string") {
          await (supabase as any)
            .from("narrative_sources")
            .update({
              transcript: data.transcript,
              language: data.language ?? language ?? "fr",
              fetch_status: "auto_fetched",
              transcript_source: "youtube_auto",
            })
            .eq("id", sourceId);
          toast.success("Transcription extraite automatiquement");
        } else {
          await (supabase as any)
            .from("narrative_sources")
            .update({ fetch_status: "failed" })
            .eq("id", sourceId);
          toast.warning(
            "Extraction automatique impossible — collez la transcription manuellement.",
          );
        }
      } catch (e) {
        console.error("auto-fetch error", e);
        await (supabase as any)
          .from("narrative_sources")
          .update({ fetch_status: "failed" })
          .eq("id", sourceId);
        toast.warning(
          "Extraction automatique indisponible — collez la transcription manuellement.",
        );
      } finally {
        setFetchingIds((prev) => {
          const next = new Set(prev);
          next.delete(sourceId);
          return next;
        });
        await fetchSources();
      }
    },
    [user, fetchSources],
  );

  const handleRetryFetch = useCallback(
    (s: NarrativeSourceRow) => {
      if (!s.youtube_url) {
        toast.error("Aucune URL à utiliser pour la récupération automatique.");
        return;
      }
      tryAutoFetch(s.id, s.youtube_url, s.language);
    },
    [tryAutoFetch],
  );

  const analyzableSources = useMemo(
    () => sources.filter((s) => isSourceAnalyzable(s)),
    [sources],
  );
  const canAnalyze = analyzableSources.length >= 1;

  const handleAnalyze = useCallback(() => {
    if (!canAnalyze) {
      toast.error(
        "Au moins une transcription valide est requise pour lancer l'analyse.",
      );
      return;
    }
    if (onAnalyze) {
      onAnalyze(analyzableSources);
    } else {
      toast.info(
        "Analyse narrative — branchement à venir à l'étape suivante du workflow.",
      );
    }
  }, [canAnalyze, onAnalyze, analyzableSources]);

  return (
    <section className="space-y-3 sm:space-y-4">
      {/* Header + counter + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div>
          <h3 className="font-display text-sm sm:text-base font-semibold text-foreground">
            Sources narratives
          </h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground">
            <span
              className={cn(
                "font-medium",
                count === 0 && "text-muted-foreground",
                count > 0 && count < MAX_SOURCES && "text-primary",
                count >= MAX_SOURCES && "text-destructive",
              )}
            >
              {count}/{MAX_SOURCES} sources
            </span>{" "}
            · 1 minimum, 3 recommandées, {MAX_SOURCES} maximum.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openCreateUrl}
            disabled={!canAdd || loading}
            className="min-h-[36px]"
          >
            <Link2 className="h-4 w-4" />
            Ajouter une URL YouTube
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={openCreateTranscript}
            disabled={!canAdd || loading}
            className="min-h-[36px]"
          >
            <ClipboardPaste className="h-4 w-4" />
            Coller une transcription
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des sources…
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 sm:p-8 text-center">
          <Plus className="h-5 w-5 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-[11px] sm:text-xs lg:text-sm text-foreground font-medium mb-1">
            Aucune source pour le moment
          </p>
          <p className="text-[11px] sm:text-xs text-muted-foreground max-w-md mx-auto">
            Ajoutez entre 1 et {MAX_SOURCES} sources (URL YouTube ou transcription collée) pour
            préparer l'analyse narrative.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 sm:space-y-3">
          {sources.map((s, i) => {
            const semantic: SourceSemanticStatus = getSourceSemanticStatus(s);
            const st = STATUS_LABELS[semantic];
            const isFetching =
              fetchingIds.has(s.id) || semantic === "fetching_transcript";
            const canRetry =
              !!s.youtube_url &&
              !isFetching &&
              (semantic === "fetch_failed" ||
                semantic === "url_added" ||
                semantic === "manual_transcript_required");
            const transcriptText = s.transcript?.trim() ?? "";
            const preview =
              transcriptText.length > TRANSCRIPT_PREVIEW
                ? transcriptText.slice(0, TRANSCRIPT_PREVIEW) + "…"
                : transcriptText;
            const hasUrl = !!s.youtube_url;
            const hasTranscript = transcriptText.length > 0;
            return (
              <li
                key={s.id}
                className="rounded-lg border border-border bg-card p-3 sm:p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
                    aria-label={`Source ${i + 1}`}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h4 className="font-medium text-sm text-foreground truncate">
                        {s.title || (hasUrl ? "Source YouTube" : "Transcription collée")}
                      </h4>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          hasUrl
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {hasUrl ? (
                          <Youtube className="h-3 w-3" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                        {hasUrl ? "YouTube" : "Texte"}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          st.tone === "ok" &&
                            "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          st.tone === "warn" &&
                            "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          st.tone === "error" &&
                            "bg-destructive/10 text-destructive",
                          st.tone === "info" &&
                            "bg-primary/10 text-primary",
                          st.tone === "muted" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {st.tone === "ok" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : st.tone === "info" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {st.label}
                      </span>
                    </div>

                    {hasUrl && (
                      <a
                        href={s.youtube_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[11px] sm:text-xs text-primary hover:underline"
                      >
                        {s.youtube_url}
                      </a>
                    )}

                    {hasTranscript ? (
                      <p className="text-[11px] sm:text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                        {preview}
                      </p>
                    ) : semantic === "fetch_failed" ? (
                      <p className="text-[11px] sm:text-xs text-destructive">
                        L'extraction automatique n'a pas abouti. Ouvrez la vidéo, copiez la
                        transcription depuis YouTube, puis collez-la via « Modifier ».
                      </p>
                    ) : (
                      <p className="text-[11px] sm:text-xs italic text-muted-foreground">
                        Aucune transcription. {hasUrl ? "Tentative d'extraction en attente, ou collez-la manuellement via « Modifier »." : "Modifiez la source pour en coller une."}
                      </p>
                    )}

                    <p className="text-[10px] text-muted-foreground">
                      {hasTranscript && <>{wordCount(transcriptText).toLocaleString()} mots · </>}
                      Ajoutée le {new Date(s.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col sm:flex-row gap-1">
                    {canRetry && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetryFetch(s)}
                        aria-label="Réessayer l'extraction automatique"
                        title="Réessayer l'extraction automatique"
                        className="h-8 px-2"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(s)}
                      aria-label="Modifier la source"
                      className="h-8 px-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(s)}
                      aria-label="Supprimer la source"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!canAdd && !loading && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Limite atteinte ({MAX_SOURCES}/{MAX_SOURCES}). Supprimez une source pour en ajouter une nouvelle.
        </p>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialog.kind !== "closed"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {dialog.kind === "create-url" &&
                "Vous pourrez coller la transcription plus tard si elle n'est pas extraite automatiquement."}
              {dialog.kind === "create-transcript" &&
                "Collez le texte intégral de la transcription. L'URL est optionnelle."}
              {dialog.kind === "edit" &&
                "Modifiez l'URL, la transcription ou les métadonnées de cette source."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="src-title" className="text-xs">Titre (optionnel)</Label>
              <Input
                id="src-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex : L'effondrement de Lehman Brothers"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-url" className="text-xs">URL YouTube</Label>
              <Input
                id="src-url"
                value={form.youtube_url}
                onChange={(e) => setForm((f) => ({ ...f, youtube_url: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=…"
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-channel" className="text-xs">Chaîne (optionnel)</Label>
              <Input
                id="src-channel"
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                placeholder="Ex : Arte, Nota Bene…"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-transcript" className="text-xs">
                Transcription{" "}
                <span className="text-muted-foreground font-normal">
                  ({wordCount(form.transcript).toLocaleString()} mots)
                </span>
              </Label>
              <Textarea
                id="src-transcript"
                value={form.transcript}
                onChange={(e) => setForm((f) => ({ ...f, transcript: e.target.value }))}
                placeholder="Collez ici la transcription complète de la vidéo…"
                className="min-h-[180px] max-h-[320px] font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-notes" className="text-xs">Notes (optionnel)</Label>
              <Textarea
                id="src-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Pourquoi cette source ? Que retenir ?"
                className="min-h-[60px] text-xs"
                maxLength={1000}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {dialog.kind === "edit" ? "Enregistrer" : "Ajouter la source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette source ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. La transcription et les métadonnées seront perdues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}