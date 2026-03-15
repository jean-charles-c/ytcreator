import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Film, Layers, Shield, FileText, ArrowRight, Clapperboard, Menu, X } from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "Création d'un script narratif",
    description: "La structure narrative de votre vidéo en un clic.",
  },
  {
    icon: Layers,
    title: "Narration Segmentation",
    description: "Découpez automatiquement votre voix-off en scènes visuelles exploitables.",
  },
  {
    icon: Clapperboard,
    title: "VisualPrompts Generator",
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
    description: "Exportez vos prompts prêts à l'emploi pour les IA génératives d'images ou vidéos en un clic.",
  },
  {
    icon: Film,
    title: "SEO",
    description: "Générez 10 titres, la description de la vidéo et les tags optimisés pour le référencement.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-semibold text-foreground tracking-tight">
              DocuStoryboard
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/login")}>
              Se connecter
            </Button>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="sm:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="sm:hidden border-t border-border bg-background px-4 py-3 space-y-2 animate-fade-in">
            <Button variant="hero" className="w-full min-h-[44px]" onClick={() => { navigate("/signup"); setMenuOpen(false); }}>
              Démarrer
            </Button>
            <Button variant="outline" className="w-full min-h-[44px]" onClick={() => { navigate("/login"); setMenuOpen(false); }}>
              Se connecter
            </Button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24">
        <div className="container max-w-4xl text-center px-4">
          <div className="mb-4 sm:mb-6 inline-flex items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-primary" />
            Historical Realism Engine
          </div>
          <h1 className="font-display text-3xl sm:text-5xl lg:text-7xl font-bold leading-tight tracking-tight text-foreground">
            <span className="text-primary">YouTube Creator Toolkit</span>
          </h1>
          <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            De la création du narratif au prompt image en quelques secondes. Segmentez votre script, générez des plans documentaires et exportez des prompts pour les IA génératives d'images ou vidéos puis optimisez le SEO.
          </p>
        </div>
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(27_52%_64%_/_0.06)_0%,_transparent_70%)]" />
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border py-16 sm:py-24">
        <div className="container max-w-5xl px-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-foreground text-center mb-3 sm:mb-4">
            Un pipeline complet
          </h2>
          <p className="text-center text-muted-foreground mb-10 sm:mb-16 max-w-xl mx-auto text-sm sm:text-base">
            Du texte brut aux VisualPrompts, chaque étape est automatisée et vérifiable.
          </p>
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group rounded border border-border bg-card p-5 sm:p-6 transition-colors hover:bg-surface-hover"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="mb-3 sm:mb-4 inline-flex h-10 w-10 items-center justify-center rounded bg-secondary">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display text-base sm:text-lg font-semibold text-foreground mb-1.5 sm:mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-16 sm:py-24">
        <div className="container max-w-2xl text-center px-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-3 sm:mb-4">
            Prêt à commencer ?
          </h2>
          <p className="text-muted-foreground mb-6 sm:mb-8 text-sm sm:text-base">
            Créez votre premier projet en moins de 30 secondes. Gratuit, sans carte bancaire.
          </p>
          <Button variant="hero" size="lg" onClick={() => navigate("/signup")} className="w-full sm:w-auto min-h-[48px]">
            Commencer maintenant
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 sm:py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground px-4">
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
