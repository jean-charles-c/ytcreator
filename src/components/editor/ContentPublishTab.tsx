import { useState, useMemo } from "react";
import { Copy, Check, FileText, Youtube, Tag, Type, AlignLeft, Mic, ScrollText, ChevronDown, Image } from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Tables } from "@/integrations/supabase/types";

type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

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

interface ContentPublishTabProps {
  generatedScript: string | null;
  seoResults: SeoResults;
  scenes?: Scene[];
  shots?: Shot[];
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success(`${label} copié ✓`);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      title={`Copier ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CopyableBlock({
  children,
  text,
  label,
  onClick,
}: {
  children: React.ReactNode;
  text: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="group rounded border border-border bg-card p-4 transition-colors hover:border-primary/30 relative cursor-pointer"
      onClick={() => {
        if (onClick) {
          onClick();
        } else {
          navigator.clipboard.writeText(text).then(() => {
            toast.success(`${label} copié ✓`);
          });
        }
      }}
    >
      <div className="absolute top-3 right-3">
        <CopyButton text={text} label={label} />
      </div>
      {children}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  open,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <CollapsibleTrigger
      onClick={onToggle}
      className="flex items-center gap-2 w-full py-3 text-left group"
    >
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <span className="font-display text-sm font-semibold text-foreground">{title}</span>
      <svg
        className={`ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </CollapsibleTrigger>
  );
}

function SubCollapsible({
  icon: Icon,
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  icon: React.ElementType;
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full py-2.5 px-3 text-left rounded-md bg-muted/40 hover:bg-muted/70 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-display font-semibold text-foreground uppercase tracking-wider">{title}</span>
        {badge && <span className="text-[10px] text-muted-foreground ml-1">({badge})</span>}
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-2 pb-1 pl-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CollapsibleBlock({
  title,
  text,
  label,
  defaultOpen = false,
}: {
  title: string;
  text: string;
  label: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <CollapsibleTrigger
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 flex-1 text-left"
          >
            <ChevronDown
              className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
            <span className="text-[11px] font-mono text-muted-foreground">{title}</span>
          </CollapsibleTrigger>
          <CopyButton text={text} label={label} />
        </div>
        <CollapsibleContent>
          <div className="px-3 pb-3">
            <pre className="rounded bg-background border border-border p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text">
              {text}
            </pre>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function cleanScriptForExport(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t === "") return true;
      return !t.startsWith("---") && !t.startsWith("#");
    })
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip section tags [[HOOK]], [[ACT1]] etc. to get pure VO text */
function cleanScriptVoOnly(raw: string): string {
  const withMarks = cleanScriptForExport(raw);
  return withMarks
    .replace(/\[\[[A-Z0-9_]+\]\]\s*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoVoiceOverBlocks(raw: string): string[] {
  const clean = cleanScriptForExport(raw);
  const sentences = clean.split(/(?<=\.)\s+/);
  const blocks: string[] = [];
  let currentBlock = "";
  for (const sentence of sentences) {
    const candidate = currentBlock ? currentBlock + " " + sentence : sentence;
    if (candidate.length > 8300 && currentBlock.length > 0) {
      blocks.push(currentBlock.trim());
      currentBlock = sentence;
    } else {
      currentBlock = candidate;
    }
  }
  if (currentBlock.trim()) blocks.push(currentBlock.trim());
  return blocks;
}

export default function ContentPublishTab({ generatedScript, seoResults, scenes = [], shots = [] }: ContentPublishTabProps) {
  const [scriptOpen, setScriptOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);

  const titles = seoResults?.titles ?? null;
  const description = seoResults?.description ?? null;
  const tags = seoResults?.tags ?? null;

  const hasScript = !!generatedScript;
  const hasSeo = !!(titles || description || tags);

  const { promptsNumbered, promptsRaw } = useMemo(() => {
    if (scenes.length === 0 || shots.length === 0) return { promptsNumbered: "", promptsRaw: "" };
    let numbered = "";
    let raw = "";
    let shotIndex = 1;
    const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
    sortedScenes.forEach((scene) => {
      const sceneShots = shots
        .filter((s) => s.scene_id === scene.id)
        .sort((a, b) => a.shot_order - b.shot_order);
      sceneShots.forEach((shot) => {
        const prompt = shot.prompt_export || shot.description;
        numbered += `SHOT ${shotIndex}: ${prompt}\n\n`;
        raw += `${prompt}\n\n`;
        shotIndex++;
      });
    });
    return { promptsNumbered: numbered.trim(), promptsRaw: raw.trim() };
  }, [scenes, shots]);

  const hasPrompts = promptsNumbered.length > 0;
  const hasContent = hasScript || hasSeo || hasPrompts;

  const cleanedScript = hasScript ? cleanScriptForExport(generatedScript!) : null;
  const cleanedScriptVo = hasScript ? cleanScriptVoOnly(generatedScript!) : null;
  const voBlocks = hasScript ? splitIntoVoiceOverBlocks(generatedScript!) : [];

  const subtitlesText = useMemo(() => {
    if (scenes.length === 0 || shots.length === 0) return null;
    const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
    const lines: string[] = [];
    sortedScenes.forEach((scene) => {
      const sceneShots = shots
        .filter((s) => s.scene_id === scene.id)
        .sort((a, b) => a.shot_order - b.shot_order);
      sceneShots.forEach((shot) => {
        const text = (shot.source_sentence || "")
          .replace(/\[\[[A-Z0-9_]+\]\]\s*/g, "")
          .trim();
        if (text) lines.push(text);
      });
    });
    return lines.length > 0 ? lines.join("\n\n") : null;
  }, [scenes, shots]);

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        Copy Paste
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Centralisez et copiez rapidement votre contenu pour publication.
      </p>

      {!hasContent ? (
        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Générez d'abord un script dans ScriptCreator et/ou le packaging SEO pour voir le contenu ici.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SCRIPT / VO Section */}
          <Collapsible open={scriptOpen} onOpenChange={setScriptOpen}>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 sm:px-6">
                <SectionHeader
                  icon={FileText}
                  title="SCRIPT / VO"
                  open={scriptOpen}
                  onToggle={() => setScriptOpen((v) => !v)}
                />
              </div>
              <CollapsibleContent>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
                  {hasScript ? (
                    <>
                      {/* SCRIPT pur VO */}
                      <SubCollapsible icon={ScrollText} title="SCRIPT">
                        <CopyableBlock text={cleanedScriptVo!} label="Script">
                          <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                            {cleanedScriptVo}
                          </pre>
                        </CopyableBlock>
                      </SubCollapsible>

                      {/* SCRIPT avec Marks des chapitres */}
                      <SubCollapsible icon={ScrollText} title="SCRIPT AVEC MARKS DES CHAPITRES">
                        <CopyableBlock text={cleanedScript!} label="Script avec marks">
                          <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                            {cleanedScript}
                          </pre>
                        </CopyableBlock>
                      </SubCollapsible>

                      {/* VO sub-collapsible */}
                      <SubCollapsible icon={Mic} title="VO" badge={`${voBlocks.length} bloc(s)`}>
                        <div className="space-y-2">
                          {voBlocks.map((block, i) => (
                            <CollapsibleBlock
                              key={`vo-${i}`}
                              title={`Block ${i + 1} — ${block.length} car.`}
                              text={block}
                              label={`VO Block ${i + 1}`}
                            />
                          ))}
                        </div>
                      </SubCollapsible>

                      {/* SOUS-TITRES */}
                      {subtitlesText && (
                        <SubCollapsible icon={AlignLeft} title="SOUS-TITRES" badge={`${shots.length} shots`}>
                          <CopyableBlock text={subtitlesText} label="Sous-titres">
                            <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                              {subtitlesText}
                            </pre>
                          </CopyableBlock>
                        </SubCollapsible>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic py-4">
                      Aucun script généré. Utilisez ScriptCreator pour en créer un.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* SEO Section */}
          <Collapsible open={seoOpen} onOpenChange={setSeoOpen}>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 sm:px-6">
                <SectionHeader
                  icon={Youtube}
                  title="SEO"
                  open={seoOpen}
                  onToggle={() => setSeoOpen((v) => !v)}
                />
              </div>
              <CollapsibleContent>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
                  {!hasSeo ? (
                    <p className="text-sm text-muted-foreground italic py-4">
                      Aucun contenu SEO. Générez le packaging YouTube dans l'onglet SEO.
                    </p>
                  ) : (
                    <>
                      {/* Titres sub-collapsible */}
                      {titles && titles.length > 0 && (
                        <SubCollapsible icon={Type} title="TITRES">
                          <div className="space-y-2">
                            {titles.map((t, i) => (
                              <CopyableBlock key={i} text={t.title} label={`Titre ${i + 1}`}>
                                <pre className="rounded bg-background border border-border p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                                  {t.title}
                                </pre>
                              </CopyableBlock>
                            ))}
                          </div>
                        </SubCollapsible>
                      )}

                      {/* Description sub-collapsible */}
                      {description && (
                        <SubCollapsible icon={AlignLeft} title="DESCRIPTIONS">
                          <CopyableBlock text={description} label="Description">
                            <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                              {description}
                            </pre>
                          </CopyableBlock>
                        </SubCollapsible>
                      )}

                      {/* Tags sub-collapsible */}
                      {tags && (
                        <SubCollapsible icon={Tag} title="TAGS" badge={`${tags.length}/500 car.`}>
                          <CopyableBlock text={tags} label="Tags">
                            <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                              {tags}
                            </pre>
                          </CopyableBlock>
                        </SubCollapsible>
                      )}
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* PROMPTS Section */}
          <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 sm:px-6">
                <SectionHeader
                  icon={Image}
                  title="PROMPTS"
                  open={promptsOpen}
                  onToggle={() => setPromptsOpen((v) => !v)}
                />
              </div>
              <CollapsibleContent>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
                  {!hasPrompts ? (
                    <p className="text-sm text-muted-foreground italic py-4">
                      Aucun prompt visuel. Générez les VisualPrompts d'abord.
                    </p>
                  ) : (
                    <>
                      <SubCollapsible icon={ScrollText} title="Prompts numérotés">
                        <CopyableBlock text={promptsNumbered} label="Prompts numérotés">
                          <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                            {promptsNumbered}
                          </pre>
                        </CopyableBlock>
                      </SubCollapsible>
                      <SubCollapsible icon={ScrollText} title="Prompts seuls">
                        <CopyableBlock text={promptsRaw} label="Prompts seuls">
                          <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                            {promptsRaw}
                          </pre>
                        </CopyableBlock>
                      </SubCollapsible>
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
