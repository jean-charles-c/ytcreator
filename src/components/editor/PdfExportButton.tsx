import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PdfExportButtonProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
  fileName?: string;
}

// A4 portrait dimensions in mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 15;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_MM * 2;
const SECTION_GAP_MM = 4;
const CANVAS_SCALE = 2;

export default function PdfExportButton({ contentRef, fileName = "dossier-recherche" }: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const JsPDF = (jsPdfModule as any).jsPDF ?? (jsPdfModule as any).default;

      const root = contentRef.current;
      let sections = Array.from(
        root.querySelectorAll<HTMLElement>("[data-pdf-section]")
      );
      // Fallback: capture the whole node as one section if none are marked
      if (sections.length === 0) sections = [root];

      const pdf = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let currentY = MARGIN_MM;
      let isFirstDraw = true;

      for (const section of sections) {
        const canvas = await html2canvas(section, {
          scale: CANVAS_SCALE,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: section.scrollWidth,
        });

        const widthPx = canvas.width / CANVAS_SCALE;
        const heightPx = canvas.height / CANVAS_SCALE;
        const scale = CONTENT_WIDTH_MM / widthPx;
        const totalHeightMM = heightPx * scale;

        // Case 1: fits in remaining space on the current page → draw whole.
        const remaining = A4_HEIGHT_MM - MARGIN_MM - currentY;
        if (totalHeightMM <= remaining) {
          const imgData = canvas.toDataURL("image/jpeg", 0.92);
          pdf.addImage(imgData, "JPEG", MARGIN_MM, currentY, CONTENT_WIDTH_MM, totalHeightMM);
          currentY += totalHeightMM + SECTION_GAP_MM;
          isFirstDraw = false;
          continue;
        }

        // Case 2: section taller than what's left. If page already has content, jump to new page.
        if (!isFirstDraw && currentY > MARGIN_MM) {
          pdf.addPage();
          currentY = MARGIN_MM;
        }

        // Case 3: section now drawn from top of page. If still taller than one page, slice it.
        if (totalHeightMM <= CONTENT_HEIGHT_MM) {
          const imgData = canvas.toDataURL("image/jpeg", 0.92);
          pdf.addImage(imgData, "JPEG", MARGIN_MM, currentY, CONTENT_WIDTH_MM, totalHeightMM);
          currentY += totalHeightMM + SECTION_GAP_MM;
          isFirstDraw = false;
        } else {
          // Slice the canvas vertically across multiple pages.
          const pageHeightPx = Math.floor((CONTENT_HEIGHT_MM / scale) * CANVAS_SCALE);
          const sourceWidthPx = canvas.width;
          let sourceY = 0;
          while (sourceY < canvas.height) {
            const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sourceY);
            const sliceCanvas = document.createElement("canvas");
            sliceCanvas.width = sourceWidthPx;
            sliceCanvas.height = sliceHeightPx;
            const ctx = sliceCanvas.getContext("2d");
            if (!ctx) break;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, sourceWidthPx, sliceHeightPx);
            ctx.drawImage(
              canvas,
              0, sourceY, sourceWidthPx, sliceHeightPx,
              0, 0, sourceWidthPx, sliceHeightPx,
            );
            const sliceImg = sliceCanvas.toDataURL("image/jpeg", 0.92);
            const sliceHeightMM = (sliceHeightPx / CANVAS_SCALE) * scale;
            pdf.addImage(sliceImg, "JPEG", MARGIN_MM, MARGIN_MM, CONTENT_WIDTH_MM, sliceHeightMM);
            sourceY += sliceHeightPx;
            if (sourceY < canvas.height) {
              pdf.addPage();
              currentY = MARGIN_MM;
            } else {
              currentY = MARGIN_MM + sliceHeightMM + SECTION_GAP_MM;
            }
          }
          isFirstDraw = false;
        }
      }

      pdf.save(`${fileName}.pdf`);
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
