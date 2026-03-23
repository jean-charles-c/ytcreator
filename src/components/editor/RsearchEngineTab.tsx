import { useState, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Square, Loader2, Send, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import ResearchQueryForm from "./ResearchQueryForm";
import ResearchDossierView, { parseSections } from "./ResearchDossierView";
import ResearchSectionNav from "./ResearchSectionNav";
import PdfExportButton from "./PdfExportButton";
import ResearchHistory from "./ResearchHistory";

interface RsearchEngineTabProps {
  projectId: string | null;
  projectTitle: string;
  onSendToScriptCreator?: (content: string) => void;
}

export default function RsearchEngineTab({ projectId, projectTitle, onSendToScriptCreator }: RsearchEngineTabProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | undefined>();
  const [progress, setProgress] = useState<{ current: number; total: number; section: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const exportRef = useRef<HTMLDivElement | null>(null);

  const activeSections = useMemo(() => {
    return parseSections(content)
      .filter((s) => s.name !== "__preamble__")
      .map((s) => s.name);
  }, [content]);

  const handleNavigate = useCallback((section: string) => {
    setCurrentSection(section);
    const el = sectionRefs.current[section];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  }, []);

  const saveDossier = useCallback(async (topicText: string, angle?: string, depth?: string, instructions?: string, finalContent?: string) => {
    if (!user || !projectId || !finalContent?.trim()) return;
    await (supabase as any).from("research_dossiers").insert({
      project_id: projectId,
      user_id: user.id,
      topic: topicText,
      angle: angle || null,
      depth: depth || "very deep",
      instructions: instructions || null,
      content: finalContent,
    });
  }, [user, projectId]);

  const handleGenerate = useCallback(
    async (data: { topic: string; angle?: string; depth: string; instructions?: string }) => {
      setGenerating(true);
      setContent("");
      setTopic(data.topic);
      setCurrentSection(undefined);
      setProgress(null);
      sectionRefs.current = {};

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-research`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify(data),
            signal: controller.signal,
          }
        );

        if (!response.ok || !response.body) {
          throw new Error("Erreur de connexion au service de recherche");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (!line || line.startsWith(":")) continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.error) {
                toast.error(parsed.error);
                setGenerating(false);
                return;
              }
              if (parsed.progress) {
                setProgress(parsed.progress);
              }
              if (parsed.text) {
                accumulated += parsed.text;
                setContent(accumulated);
              }
            } catch {
              // partial JSON
            }
          }
        }

        toast.success("Dossier de recherche généré avec succès");
        // Save to history
        await saveDossier(data.topic, data.angle, data.depth, data.instructions, accumulated);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast.info("Génération arrêtée");
        } else {
          console.error("Research generation error:", e);
          toast.error(e?.message || "Erreur inattendue");
        }
      } finally {
        setGenerating(false);
        abortRef.current = null;
      }
    },
    [saveDossier]
  );

  const handleLoadFromHistory = useCallback((dossier: { topic: string; content: string; angle?: string | null }) => {
    setContent(dossier.content);
    setTopic(dossier.topic);
    setCurrentSection(undefined);
    sectionRefs.current = {};
  }, []);

  const handleSendToScriptCreator = useCallback(() => {
    if (!content.trim() || !onSendToScriptCreator) return;
    // Strip section markers for clean text
    const cleanContent = content.replace(/\[SECTION:[^\]]+\]/g, "").trim();
    onSendToScriptCreator(cleanContent);
    toast.success("Dossier envoyé dans ScriptCreator");
  }, [content, onSendToScriptCreator]);

  const hasContent = content.trim().length > 0;

  return (
    <div className="container max-w-6xl py-6 sm:py-10 px-4 animate-fade-in">
      <div className="mb-6">
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-1">RsearchEngine</h2>
        <p className="text-sm text-muted-foreground">
          Générez un dossier de recherche approfondi et structuré, prêt pour la création de contenu.
        </p>
      </div>

      {!hasContent && !generating && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <ResearchQueryForm onSubmit={handleGenerate} generating={generating} />
          </div>
          <ResearchHistory
            projectId={projectId}
            onLoad={handleLoadFromHistory}
            className="lg:sticky lg:top-6"
          />
        </div>
      )}

      {(hasContent || generating) && (
        <div className="flex gap-6">
          {/* Sidebar nav */}
          <div className="hidden lg:block w-56 shrink-0 sticky top-4 self-start">
            <ResearchSectionNav
              activeSections={activeSections}
              currentSection={currentSection}
              onNavigate={handleNavigate}
            />
            {hasContent && !generating && (
              <div className="mt-4 space-y-2">
                <PdfExportButton
                  contentRef={exportRef}
                  fileName={`recherche_${projectTitle.replace(/\s+/g, "_")}`}
                />
                {onSendToScriptCreator && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-h-[36px] text-xs"
                    onClick={handleSendToScriptCreator}
                  >
                    <Send className="h-3.5 w-3.5" /> Envoyer dans ScriptCreator
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-h-[36px] text-xs"
                  onClick={() => {
                    setContent("");
                    setTopic("");
                    setCurrentSection(undefined);
                  }}
                >
                  Nouvelle recherche
                </Button>
              </div>
            )}
            {generating && (
              <div className="mt-4">
                <Button variant="destructive" size="sm" onClick={handleStop} className="w-full min-h-[36px]">
                  <Square className="h-3.5 w-3.5" /> Arrêter
                </Button>
              </div>
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Mobile controls */}
            <div className="lg:hidden flex items-center gap-2 mb-4 flex-wrap">
              {generating && (
                <Button variant="destructive" size="sm" onClick={handleStop} className="min-h-[36px]">
                  <Square className="h-3.5 w-3.5" /> Arrêter
                </Button>
              )}
              {hasContent && !generating && (
                <>
                  <PdfExportButton
                    contentRef={exportRef}
                    fileName={`recherche_${projectTitle.replace(/\s+/g, "_")}`}
                  />
                  {onSendToScriptCreator && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[36px]"
                      onClick={handleSendToScriptCreator}
                    >
                      <Send className="h-3.5 w-3.5" /> ScriptCreator
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[36px]"
                    onClick={() => {
                      setContent("");
                      setTopic("");
                      setCurrentSection(undefined);
                    }}
                  >
                    Nouvelle recherche
                  </Button>
                </>
              )}
            </div>

            {generating && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded border border-primary/20 bg-primary/5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {progress
                    ? `Section ${progress.current}/${progress.total} : ${progress.section}…`
                    : "Connexion au service de recherche…"}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border bg-card p-5 sm:p-8">
              <ResearchDossierView
                ref={exportRef}
                content={content}
                topic={topic}
                sectionRefs={sectionRefs}
              />
            </div>

            {/* Word count */}
            {hasContent && (
              <p className="text-xs text-muted-foreground mt-3 text-right">
                {content.split(/\s+/).length.toLocaleString()} mots · {content.length.toLocaleString()} caractères
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
