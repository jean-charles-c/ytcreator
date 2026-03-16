import { forwardRef, useMemo } from "react";

interface ResearchDossierViewProps {
  content: string;
  topic?: string;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

const SECTION_REGEX = /\[SECTION:([^\]]+)\]/g;

function parseSections(raw: string): { name: string; content: string }[] {
  const sections: { name: string; content: string }[] = [];
  const parts = raw.split(/\[SECTION:([^\]]+)\]/);

  if (parts[0]?.trim()) {
    sections.push({ name: "__preamble__", content: parts[0].trim() });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i]?.trim();
    const content = parts[i + 1]?.trim() || "";
    if (name) sections.push({ name, content });
  }

  return sections;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm leading-relaxed text-muted-foreground">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm leading-relaxed text-muted-foreground">$2</li>')
    .replace(/\[référence à vérifier\]/g, '<span class="text-destructive text-xs font-medium">[référence à vérifier]</span>')
    .replace(/\n\n/g, '</p><p class="text-sm leading-relaxed text-muted-foreground mb-3">')
    .replace(/\n/g, '<br/>');
}

const ResearchDossierView = forwardRef<HTMLDivElement, ResearchDossierViewProps>(
  ({ content, topic, sectionRefs }, ref) => {
    const sections = useMemo(() => parseSections(content), [content]);

    return (
      <div ref={ref} className="research-dossier-export">
        {/* Topic header for PDF and display */}
        {topic && (
          <div className="mb-8 pb-4 border-b-2 border-primary/30">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Dossier de recherche</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight">
              {topic}
            </h1>
          </div>
        )}

        {sections.map((section, i) => {
          if (section.name === "__preamble__") {
            return (
              <div key="preamble" className="mb-6">
                <p
                  className="text-sm leading-relaxed text-muted-foreground mb-3"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                />
              </div>
            );
          }

          return (
            <div
              key={section.name}
              ref={(el) => { sectionRefs.current[section.name] = el; }}
              className="mb-8 scroll-mt-4"
            >
              <h2 className="font-display text-lg sm:text-xl font-bold text-foreground mb-3 pb-2 border-b border-border">
                <span className="text-primary mr-2 text-base font-semibold">{i}.</span>
                {section.name}
              </h2>
              <div
                className="text-sm leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: `<p class="text-sm leading-relaxed text-muted-foreground mb-3">${renderMarkdown(section.content)}</p>`,
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }
);

ResearchDossierView.displayName = "ResearchDossierView";

export default ResearchDossierView;
export { parseSections };
