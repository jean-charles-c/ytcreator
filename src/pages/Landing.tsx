import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Film, Layers, Shield, FileText, ArrowRight, Clapperboard } from "lucide-react";

const features = [
  {
    icon: Layers,
    title: "Narration Segmentation",
    description: "Découpez automatiquement votre voix-off en scènes visuelles exploitables.",
  },
  {
    icon: Clapperboard,
    title: "Storyboard Generator",
    description: "Générez 2 à 3 plans documentaires par scène : establishing, activity, detail.",
  },
  {
    icon: Shield,
    title: "Historical Guardrails",
    description: "Cohérence historique imposée : architecture, matériaux, lumière photoréaliste.",
  },
  {
    icon: FileText,
    title: "Prompt Exporter",
    description: "Exportez vos prompts prêts à l'emploi pour Grok Image en un clic.",
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-semibold text-foreground tracking-tight">
              DocuStoryboard
            </span>
          </div>
          <Button variant="hero" size="sm" onClick={() => navigate("/signup")}>
            Démarrer
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24">
        <div className="container max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-primary" />
            Historical Realism Engine
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-foreground md:text-6xl lg:text-7xl">
            Transformez votre narration
            <br />
            <span className="text-primary">en storyboard visuel</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            De la voix-off au prompt image en quelques secondes. DocuStoryboard AI segmente votre script, génère des plans documentaires et exporte des prompts prêts pour Grok Image.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button variant="hero" size="lg" onClick={() => navigate("/signup")}>
              Commencer gratuitement
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/dashboard")}>
              Voir une démo
            </Button>
          </div>
        </div>

        {/* Decorative grid overlay */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(27_52%_64%_/_0.06)_0%,_transparent_70%)]" />
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border py-24">
        <div className="container max-w-5xl">
          <h2 className="font-display text-3xl font-semibold text-foreground text-center mb-4">
            Un pipeline complet
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto">
            Du texte brut au storyboard professionnel, chaque étape est automatisée et vérifiable.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group rounded border border-border bg-card p-6 transition-colors hover:bg-surface-hover"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded bg-secondary">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-24">
        <div className="container max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground mb-4">
            Prêt à storyboarder ?
          </h2>
          <p className="text-muted-foreground mb-8">
            Créez votre premier projet en moins de 30 secondes. Gratuit, sans carte bancaire.
          </p>
          <Button variant="hero" size="lg" onClick={() => navigate("/signup")}>
            Lancer DocuStoryboard AI
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <span className="font-display">DocuStoryboard AI</span>
          </div>
          <span>© 2026 — Tous droits réservés</span>
        </div>
      </footer>
    </div>
  );
}
