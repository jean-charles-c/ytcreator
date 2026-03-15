import { useState } from "react";
import { Copy, Check, FileText, Youtube, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

function cleanScriptForExport(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("---") && line.trim() !== "")
    .map((line) => line.trim())
    .join("\n");
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

export default function ContentPublishTab({ generatedScript, seoResults }: ContentPublishTabProps) {
  const [scriptOpen, setScriptOpen] = useState(true);
  const [seoOpen, setSeoOpen] = useState(true);

  const titles = seoResults?.titles ?? null;
  const description = seoResults?.description ?? null;
  const tags = seoResults?.tags ?? null;

  const hasScript = !!generatedScript;
  const hasSeo = !!(titles || description || tags);
  const hasContent = hasScript || hasSeo;

  const cleanedScript = hasScript ? cleanScriptForExport(generatedScript!) : null;
  const voBlocks = hasScript ? splitIntoVoiceOverBlocks(generatedScript!) : [];

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        Content Publish
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
                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  {hasScript ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* SCRIPT Column */}
                      <div>
                        <h4 className="text-xs font-display font-medium text-primary mb-3 uppercase tracking-wider">Script</h4>
                        <div className="space-y-2">
                          {cleanedScript!.split("\n").filter(Boolean).map((paragraph, i) => (
                            <CopyableBlock key={`script-${i}`} text={paragraph} label={`Script Block ${i + 1}`}>
                              <pre className="rounded bg-background border border-border p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                                {paragraph}
                              </pre>
                            </CopyableBlock>
                          ))}
                        </div>
                      </div>
                      {/* VO Column */}
                      <div>
                        <h4 className="text-xs font-display font-medium text-primary mb-3 uppercase tracking-wider">VO</h4>
                        <div className="space-y-2">
                          {voBlocks.map((block, i) => (
                            <CopyableBlock key={`vo-${i}`} text={block} label={`VO Block ${i + 1}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-muted-foreground font-mono">Block {i + 1} — {block.length} car.</span>
                              </div>
                              <pre className="rounded bg-background border border-border p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                                {block}
                              </pre>
                            </CopyableBlock>
                          ))}
                        </div>
                      </div>
                    </div>
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
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
                  {!hasSeo ? (
                    <p className="text-sm text-muted-foreground italic py-4">
                      Aucun contenu SEO. Générez le packaging YouTube dans l'onglet SEO.
                    </p>
                  ) : (
                    <>
                      {/* Titles */}
                      {titles && titles.length > 0 && (
                        <div>
                          <h4 className="text-xs font-display font-medium text-primary mb-2">Titres</h4>
                          <div className="space-y-2">
                            {titles.map((t, i) => (
                              <CopyableBlock key={i} text={t.title} label={`Titre ${i + 1}`}>
                                <pre className="rounded bg-background border border-border p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                                  {t.title}
                                </pre>
                              </CopyableBlock>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      {description && (
                        <div>
                          <h4 className="text-xs font-display font-medium text-primary mb-2">Description</h4>
                          <CopyableBlock text={description} label="Description">
                            <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                              {description}
                            </pre>
                          </CopyableBlock>
                        </div>
                      )}

                      {/* Tags */}
                      {tags && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Tag className="h-3.5 w-3.5 text-primary" />
                            <h4 className="text-xs font-display font-medium text-primary">Tags</h4>
                            <span className="text-[10px] text-muted-foreground">({tags.length}/500 car.)</span>
                          </div>
                          <CopyableBlock text={tags} label="Tags">
                            <pre className="rounded bg-background border border-border p-3 sm:p-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text pr-10">
                              {tags}
                            </pre>
                          </CopyableBlock>
                        </div>
                      )}
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
