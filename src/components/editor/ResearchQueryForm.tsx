import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Search } from "lucide-react";

interface ResearchQueryFormProps {
  onSubmit: (data: { topic: string; angle?: string; depth: string; instructions?: string }) => void;
  generating: boolean;
}

const DEPTH_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "deep", label: "Deep" },
  { value: "very deep", label: "Very deep (recommandé)" },
];

export default function ResearchQueryForm({ onSubmit, generating }: ResearchQueryFormProps) {
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [depth, setDepth] = useState("very deep");
  const [instructions, setInstructions] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    onSubmit({
      topic: topic.trim(),
      angle: angle.trim() || undefined,
      depth,
      instructions: instructions.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Sujet de recherche *</Label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="ex. Les pyramides de Gizeh : techniques de construction"
            disabled={generating}
            className="bg-background"
          />
        </div>

        <Button
          type="submit"
          variant="hero"
          size="lg"
          disabled={generating || !topic.trim()}
          className="w-full min-h-[52px] shadow-sm shadow-primary/20"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Génération en cours...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" /> Lancer la recherche
            </>
          )}
        </Button>
      </div>

      <Accordion type="single" collapsible className="rounded-xl border border-border bg-card px-4 sm:px-5">
        <AccordionItem value="advanced-options" className="border-none">
          <AccordionTrigger className="py-3 text-sm font-medium text-foreground hover:no-underline">
            Options avancées
          </AccordionTrigger>
          <AccordionContent className="pt-1">
            <div className="space-y-5">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Angle de recherche</Label>
                <Input
                  value={angle}
                  onChange={(e) => setAngle(e.target.value)}
                  placeholder="ex. Focus sur les théories alternatives et preuves archéologiques"
                  disabled={generating}
                  className="bg-background"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Niveau de profondeur</Label>
                <Select value={depth} onValueChange={setDepth} disabled={generating}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPTH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Instructions complémentaires</Label>
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="ex. Insister sur les découvertes récentes (2020+), mentionner les controverses académiques..."
                  disabled={generating}
                  rows={3}
                  className="bg-background resize-none"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </form>
  );
}
