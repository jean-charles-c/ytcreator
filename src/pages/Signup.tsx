import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Film, Mail, Lock, ArrowRight } from "lucide-react";

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setConfirmationSent(true);
    }
  };

  if (confirmationSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-2 justify-center mb-8">
            <Film className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-semibold text-foreground">DocuStoryboard</span>
          </div>
          <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="font-display text-2xl font-semibold text-foreground mb-2">Vérifiez votre email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Un email de confirmation a été envoyé à <span className="text-foreground font-medium">{email}</span>.
            <br />Cliquez sur le lien dans l'email pour activer votre compte.
          </p>
          <Button variant="outline" onClick={() => navigate("/login")}>
            Aller à la page de connexion
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Film className="h-6 w-6 text-primary" />
          <span className="font-display text-xl font-semibold text-foreground">DocuStoryboard</span>
        </div>

        <h1 className="font-display text-2xl font-semibold text-foreground text-center mb-1">Créer un compte</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">Commencez à créer</p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 sm:h-10 rounded border border-border bg-card pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="vous@exemple.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 sm:h-10 rounded border border-border bg-card pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="6 caractères minimum"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Confirmer le mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-10 rounded border border-border bg-card pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <Button variant="hero" className="w-full" type="submit" disabled={loading}>
            {loading ? "Création..." : "Créer mon compte"}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link to="/login" className="text-primary hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
