import React, { useState, useCallback, useRef } from "react";
import { Upload, Copy, Download, ChevronDown, ChevronUp, AlertTriangle, Check, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { parseXmeml, generatePython, type ExtractedTitle } from "@/components/editor/titleInjectorGenerator";


/* ═══════════════════ COMPONENT ═══════════════════ */
export default function TitleInjector() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [timelineName, setTimelineName] = useState("");
  const [titles, setTitles] = useState<ExtractedTitle[]>([]);
  const [fps, setFps] = useState(25);
  const [warning, setWarning] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

  /* file handling */
  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".xml")) {
      toast({ title: "Fichier non supporté", description: "Seuls les fichiers .xml sont acceptés.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setXmlContent(text);
      setFileName(file.name);
      const result = parseXmeml(text);
      setFps(result.fps);
      setTitles(result.titles);
      setWarning(result.warning);
      setScript(null);
    };
    reader.readAsText(file);
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const generate = () => {
    if (!titles.length) return;
    const py = generatePython(titles, fps, timelineName || "Main Sequence", templateName || "Fusion Title");
    setScript(py);
  };

  const copyScript = async () => {
    if (!script) return;
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copié !" });
  };

  const downloadScript = () => {
    if (!script) return;
    const blob = new Blob([script], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resolve_titles.py";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── render ─── */
  return (
    <div className="min-h-screen bg-[#1a1a2e] text-[#e0e0ee] font-body">
      {/* header */}
      <header className="border-b border-[#2a2a44] px-6 py-4 flex items-center gap-3">
        <FileCode2 className="w-6 h-6 text-[#c9a65a]" />
        <h1 className="font-display text-xl font-semibold tracking-tight">DaVinci Resolve Title Injector</h1>
      </header>

      <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-61px)]">
        {/* ── LEFT PANEL ── */}
        <div className="lg:w-[480px] shrink-0 border-r border-[#2a2a44] p-6 overflow-y-auto space-y-5">
          {/* drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#3a3a5c] rounded-lg p-8 text-center cursor-pointer hover:border-[#c9a65a]/60 transition-colors"
          >
            <Upload className="mx-auto w-8 h-8 mb-2 text-[#8888aa]" />
            <p className="text-sm text-[#8888aa]">
              {fileName ? <span className="text-[#c9a65a]">{fileName}</span> : "Glisse un fichier .xml ici ou clique pour parcourir"}
            </p>
            <input ref={fileInputRef} type="file" accept=".xml" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>

          {/* inputs */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-[#8888aa] mb-1 block">Fusion Title template name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Lower Third, Title 01..."
                className="bg-[#12122a] border-[#2a2a44] text-[#e0e0ee] placeholder:text-[#555]"
              />
            </div>
            <div>
              <Label className="text-xs text-[#8888aa] mb-1 block">Timeline name in Resolve</Label>
              <Input
                value={timelineName}
                onChange={(e) => setTimelineName(e.target.value)}
                placeholder="e.g. Main Sequence"
                className="bg-[#12122a] border-[#2a2a44] text-[#e0e0ee] placeholder:text-[#555]"
              />
            </div>
          </div>

          {/* warning */}
          {warning && (
            <div className="flex items-start gap-2 bg-[#3a2a1a] border border-[#6a4a2a] rounded-lg p-3 text-sm text-[#e8a840]">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          )}

          {/* table */}
          {titles.length > 0 && (
            <div className="rounded-lg border border-[#2a2a44] overflow-hidden">
              <div className="px-3 py-2 bg-[#12122a] text-xs text-[#8888aa] font-medium">{titles.length} titre(s) extraits — {fps} fps</div>
              <ScrollArea className="max-h-[320px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2a2a44] text-[#8888aa]">
                      <th className="px-3 py-2 text-left w-8">#</th>
                      <th className="px-3 py-2 text-left">Start</th>
                      <th className="px-3 py-2 text-left">End</th>
                      <th className="px-3 py-2 text-right">Dur.</th>
                      <th className="px-3 py-2 text-left">Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {titles.map((t) => (
                      <tr key={t.index} className="border-b border-[#1e1e38] hover:bg-[#1e1e38]/60">
                        <td className="px-3 py-1.5 text-[#8888aa]">{t.index}</td>
                        <td className="px-3 py-1.5 font-mono">{t.startTC}</td>
                        <td className="px-3 py-1.5 font-mono">{t.endTC}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{t.durationFrames}f</td>
                        <td className="px-3 py-1.5 max-w-[180px] truncate" title={t.text}>{t.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          <Button
            onClick={generate}
            disabled={!xmlContent || titles.length === 0}
            className="w-full bg-[#c9a65a] text-[#1a1a2e] hover:bg-[#d4b36a] disabled:opacity-40 font-semibold"
          >
            Generate Script
          </Button>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {!script ? (
            <div className="h-full flex items-center justify-center text-[#555] text-sm">
              <p>Le script Python apparaîtra ici après génération.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button onClick={copyScript} variant="outline" size="sm" className="gap-1.5 border-[#2a2a44] text-[#ccc] hover:bg-[#2a2a44]">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copié" : "Copier"}
                </Button>
                <Button onClick={downloadScript} variant="outline" size="sm" className="gap-1.5 border-[#2a2a44] text-[#ccc] hover:bg-[#2a2a44]">
                  <Download className="w-3.5 h-3.5" />
                  Télécharger .py
                </Button>
              </div>

              <ScrollArea className="rounded-lg border border-[#2a2a44] bg-[#0e0e1e] max-h-[calc(100vh-260px)]">
                <pre className="p-4 text-xs font-mono text-[#c8c8e0] whitespace-pre overflow-x-auto leading-relaxed">{script}</pre>
              </ScrollArea>

              {/* How to use */}
              <div className="border border-[#2a2a44] rounded-lg">
                <button
                  onClick={() => setHowToOpen(!howToOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#aaa] hover:text-[#ddd] transition-colors"
                >
                  <span>Comment utiliser ce script</span>
                  {howToOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {howToOpen && (
                  <ol className="px-4 pb-4 space-y-1.5 text-xs text-[#999] list-decimal list-inside">
                    <li>Ouvre DaVinci Resolve</li>
                    <li>Ouvre ou crée ton projet et importe tes médias</li>
                    <li>Va dans <strong className="text-[#ccc]">Workspace → Console</strong></li>
                    <li>Sélectionne l'onglet <strong className="text-[#ccc]">Py3</strong></li>
                    <li>Clique sur l'icône dossier pour charger le fichier .py, ou colle le script</li>
                    <li>Appuie sur <strong className="text-[#ccc]">Run</strong></li>
                    <li>Le script va créer/mettre à jour la piste V2 avec tes Fusion Titles</li>
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
