import { Film, Import, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface VideoPromptsTabProps {
  projectId: string;
  onImportFromVisualPrompts: () => void;
  onCreateManual: () => void;
}

export default function VideoPromptsTab({
  projectId,
  onImportFromVisualPrompts,
  onCreateManual,
}: VideoPromptsTabProps) {
  return (
    <div className="container max-w-4xl py-6 sm:py-10 px-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <Film className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground">
          VideoPrompts
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Transformez vos prompts visuels en directives vidéo structurées pour le
        pipeline de rendu.
      </p>

      {/* Empty state */}
      <Card className="border-dashed border-2 border-border bg-secondary/20">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-6 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Film className="h-8 w-8 text-primary" />
          </div>

          <div className="space-y-2 max-w-md">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Aucun prompt vidéo
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Importez le contexte existant depuis vos VisualPrompts ou créez
              manuellement vos premiers prompts vidéo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              variant="default"
              size="lg"
              onClick={onImportFromVisualPrompts}
              className="min-h-[44px]"
            >
              <Import className="h-4 w-4" />
              Importer depuis VisualPrompts
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={onCreateManual}
              className="min-h-[44px]"
            >
              <PlusCircle className="h-4 w-4" />
              Créer manuellement
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
