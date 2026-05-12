import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import NarrativeWorkflowView from "@/components/editor/narrativeWorkflow/NarrativeWorkflowView";

/**
 * Page autonome du Narrative Form Generator, accessible depuis « Mes projets ».
 * - `/narrative-form` : démarrage à blanc, sans projet.
 * - `/narrative-form/:projectId` : NFG d'un projet existant, avec historique.
 */
export default function NarrativeFormStandalone() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams] = useSearchParams();
  const analysisId = searchParams.get("analysis");

  useEffect(() => {
    document.title = "Narrative Form Generator — YouTube Creator Toolkit";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <NarrativeWorkflowView
        projectId={projectId ?? null}
        mode={projectId ? "embedded" : "standalone"}
        initialAnalysisId={analysisId}
        onBack={() => navigate("/dashboard")}
      />
    </div>
  );
}