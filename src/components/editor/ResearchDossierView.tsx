import { forwardRef, useMemo } from "react";

interface ResearchDossierViewProps {
  content: string;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

const SECTION_REGEX = /\[SECTION:([^\]]+)\]/g;

function parseSections(raw: string): { name: string; content: string }[] {
  const sections: { name: string; content: string }[] = [];
  const parts = raw.split(/\[SECTION:([^\]]+)\]/);

  // parts[0] is text before first section marker (preamble)
  // parts[1] is first section name, parts[2] is its content, etc.
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
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm leading-relaxed text-muted-foreground">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm leading-relaxed text-muted-foreground">$2</li>')
    // Reference markers
    .replace(/\[référence à vérifier\]/g, '<span class="text-destructive text-xs font-medium">[référence à vérifier]</span>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="text-sm leading-relaxed text-muted-foreground mb-3">')
    .replace(/\n/g, '<br/>');
}

const ResearchDossierView = forwardRef<HTMLDivElement, ResearchDossierViewProps>(
  ({ content, sectionRefs }, ref) => {
    const sections = useMemo(() => parseSections(content), [content]);

    return (
      <div ref={ref} className="research-dossier-export">
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
              <h2 className="font-display text-lg font-semibold text-foreground mb-3 pb-2 border-b border-border">
                <span className="text-primary mr-2 text-sm">{i}.</span>
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
