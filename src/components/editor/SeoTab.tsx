import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Youtube, Loader2, Trophy, Copy, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface NarrativeAnalysis {
  central_mystery: string;
  main_contradiction: string;
  intriguing_discoveries: string[];
  narrative_tensions: { title: string; description: string }[];
}

interface YoutubeTitle {
  rank: number;
  title: string;
  hook_type: string;
}

interface SeoResults {
  titles: YoutubeTitle[] | null;
  description: string | null;
  tags: string | null;
}

interface SeoTabProps {
  projectId: string | null;
  analysis: NarrativeAnalysis | null;
  extractedText: string | null;
  narration?: string;
  scriptLanguage: string;
  seoResults: SeoResults;
  onSeoResultsChange: (results: SeoResults) => void;
}

const hookBadgeColor = (type: string) => {
  const map: Record<string, string> = {
    question: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    paradoxe: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    superlatif: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    mystère: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    révélation: "bg-red-500/10 text-red-400 border-red-500/20",
    paradox: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    superlative: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    mystery: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    revelation: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return map[type.toLowerCase()] || "bg-secondary text-muted-foreground border-border";
};

export default function SeoTab({ projectId, analysis, extractedText, narration, scriptLanguage, seoResults, onSeoResultsChange }: SeoTabProps) {
  const [generatingTitles, setGeneratingTitles] = useState(false);

  const youtubeTitles = seoResults.titles;
  const youtubeDescription = seoResults.description;
  const youtubeTags = seoResults.tags;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copié`);
    }).catch(() => toast.error("Impossible de copier"));
  };

  const effectiveText = extractedText || narration || null;

  const runYoutubePackaging = useCallback(async () => {
    if (!effectiveText) return;
    setGeneratingTitles(true);
    try {
      const body: any = { text: effectiveText, language: scriptLanguage };
      if (analysis) body.analysis = analysis;
      const { data, error } = await supabase.functions.invoke("youtube-packaging", { body });
      if (error) { toast.error("Erreur de génération"); console.error(error); setGeneratingTitles(false); return; }
      if (data?.error) { toast.error(data.error); setGeneratingTitles(false); return; }
      const sorted = (data.titles as YoutubeTitle[]).sort((a, b) => a.rank - b.rank);
      setYoutubeTitles(sorted);
      setYoutubeDescription(data.description || null);
      setYoutubeTags(data.tags || null);
      toast.success("SEO YouTube généré");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingTitles(false);
  }, [analysis, effectiveText, scriptLanguage]);

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        SEO & YouTube Packaging
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Générez des titres, description et tags YouTube optimisés.
      </p>

      {!effectiveText ? (
        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <Youtube className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Lancez d'abord l'analyse narrative dans l'onglet ScriptCreator ou saisissez votre narration dans ScriptInput.
            </p>
          </div>
        </div>
      ) : (
        <>
          {!youtubeTitles && (
            <div className="mb-6">
              <Button variant="hero" disabled={generatingTitles} onClick={runYoutubePackaging} className="min-h-[44px]">
                {generatingTitles ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération SEO...</> : <><Youtube className="h-4 w-4" /> Générer le packaging YouTube</>}
              </Button>
            </div>
          )}

          {generatingTitles && (
            <div className="flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Génération du packaging YouTube…</p>
            </div>
          )}

          {youtubeTitles && (
            <div className="space-y-6 animate-fade-in">
              {/* Titles */}
              <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Youtube className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-semibold text-foreground">Titres YouTube — classés par potentiel de clic</h3>
                </div>
                <div className="space-y-2">
                  {youtubeTitles.map((t, i) => (
                    <div key={i} className="flex items-start sm:items-center gap-2 sm:gap-3 rounded border border-border bg-background p-3 transition-colors hover:bg-secondary/30">
                      <div className={`flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-xs font-bold mt-0.5 sm:mt-0 ${i === 0 ? "bg-primary text-primary-foreground" : i < 3 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : t.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{t.title}</p>
                        <span className={`inline-block mt-1 sm:hidden text-[10px] px-2 py-0.5 rounded-full border ${hookBadgeColor(t.hook_type)}`}>
                          {t.hook_type}
                        </span>
                      </div>
                      <span className={`hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${hookBadgeColor(t.hook_type)}`}>
                        {t.hook_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              {youtubeDescription && (
                <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Youtube className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-sm font-semibold text-foreground">Description YouTube</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(youtubeDescription, "Description")} className="h-8 text-xs">
                      <Copy className="h-3 w-3" /> Copier
                    </Button>
                  </div>
                  <div className="rounded border border-border bg-background p-3 sm:p-4">
                    <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">{youtubeDescription}</pre>
                  </div>
                </div>
              )}

              {/* Tags */}
              {youtubeTags && (
                <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-sm font-semibold text-foreground">Tags YouTube</h3>
                      <span className="text-[10px] text-muted-foreground">({youtubeTags.length}/500 car.)</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(youtubeTags, "Tags")} className="h-8 text-xs">
                      <Copy className="h-3 w-3" /> Copier
                    </Button>
                  </div>
                  <div className="rounded border border-border bg-background p-3 sm:p-4">
                    <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">{youtubeTags}</pre>
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <Button variant="outline" onClick={() => { setYoutubeTitles(null); setYoutubeDescription(null); setYoutubeTags(null); }} className="min-h-[44px]">
                <Youtube className="h-4 w-4" /> Régénérer le packaging
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
