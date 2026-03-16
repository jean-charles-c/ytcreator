import { cn } from "@/lib/utils";

const SECTIONS = [
  "Introduction",
  "Contexte historique",
  "Sources primaires",
  "Preuves archéologiques ou empiriques",
  "Interprétations scientifiques",
  "Théories alternatives",
  "Analyse critique",
  "Interprétations les plus plausibles",
  "Questions non résolues",
  "Conclusion",
  "Références et bibliographie",
];

interface ResearchSectionNavProps {
  activeSections: string[];
  currentSection?: string;
  onNavigate: (section: string) => void;
}

export default function ResearchSectionNav({ activeSections, currentSection, onNavigate }: ResearchSectionNavProps) {
  if (activeSections.length === 0) return null;

  return (
    <nav className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">Sections</p>
      {SECTIONS.map((section, i) => {
        const isAvailable = activeSections.includes(section);
        const isActive = currentSection === section;

        return (
          <button
            key={section}
            onClick={() => isAvailable && onNavigate(section)}
            disabled={!isAvailable}
            className={cn(
              "w-full text-left text-xs px-2.5 py-1.5 rounded transition-colors truncate",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : isAvailable
                ? "text-muted-foreground hover:text-foreground hover:bg-secondary"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <span className="mr-1.5 text-[10px] opacity-50">{i + 1}.</span>
            {section}
          </button>
        );
      })}
    </nav>
  );
}
