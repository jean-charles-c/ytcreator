import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PdfExportButtonProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
  fileName?: string;
}

export default function PdfExportButton({ contentRef, fileName = "dossier-recherche" }: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const opt = {
        margin: [15, 15, 15, 15],
        filename: `${fileName}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };
      await html2pdf().set(opt).from(contentRef.current).save();
      toast.success("PDF exporté avec succès");
    } catch (e) {
      console.error("PDF export error:", e);
      toast.error("Erreur lors de l'export PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="hero" size="sm" onClick={handleExport} disabled={exporting} className="min-h-[40px]">
      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Export PDF
    </Button>
  );
}
