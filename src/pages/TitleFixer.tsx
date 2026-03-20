import React, { useState, useCallback, useRef } from "react";
import {
  Upload, Download, Copy, Check, Play, FileCode2,
  ChevronRight, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

/* ═══════════════ HELPERS ═══════════════ */

function framesToTC(frame: number, fps: number): string {
  if (fps <= 0) return "00:00:00:00";
  const f = frame % fps;
  const ts = Math.floor(frame / fps);
  const s = ts % 60;
  const tm = Math.floor(ts / 60);
  const m = tm % 60;
  const h = Math.floor(tm / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

interface TitleInfo {
  index: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  startTC: string;
  endTC: string;
  text: string;
}

/* ═══════════════ FULL FILE BLOCK ═══════════════ */

function buildFullFileBlock(fps: number): string {
  return `<file id="Fusion Title 2">
                            <duration>120</duration>
                            <rate>
                                <timebase>${fps}</timebase>
                                <ntsc>FALSE</ntsc>
                            </rate>
                            <name>Slug</name>
                            <timecode>
                                <string>00:00:00:00</string>
                                <displayformat>NDF</displayformat>
                                <rate>
                                    <timebase>${fps}</timebase>
                                    <ntsc>FALSE</ntsc>
                                </rate>
                            </timecode>
                            <media>
                                <video>
                                    <samplecharacteristics>
                                        <width>1920</width>
                                        <height>1080</height>
                                    </samplecharacteristics>
                                </video>
                            </media>
                            <mediaSource>Slug</mediaSource>
                        </file>`;
}

/* ═══════════════ PARSER ═══════════════ */

function parseXml(xmlStr: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  if (doc.querySelector("parsererror"))
    return { fps: 0, titles: [] as TitleInfo[], warning: "Fichier XML invalide." };

  const rateNodes = doc.getElementsByTagName("rate");
  let fps = 24;
  if (rateNodes.length > 0) {
    const tb = rateNodes[0].getElementsByTagName("timebase")[0]?.textContent?.trim();
    if (tb) fps = parseInt(tb, 10) || 24;
  }

  const videoEls = doc.getElementsByTagName("video");
  if (videoEls.length === 0)
    return { fps, titles: [] as TitleInfo[], warning: "Aucun bloc <video> trouvé." };

  const tracks = videoEls[0].getElementsByTagName("track");
  if (tracks.length < 2)
    return { fps, titles: [] as TitleInfo[], warning: "Pas de piste V2 trouvée." };

  const v1Clips = Array.from(tracks[0].getElementsByTagName("clipitem"));
  const v2Clips = Array.from(tracks[1].getElementsByTagName("clipitem"));

  const fusionClips = v2Clips.filter((c) => {
    const n = c.getElementsByTagName("name")[0]?.textContent?.trim();
    return n === "Fusion Title";
  });

  if (fusionClips.length === 0)
    return { fps, titles: [] as TitleInfo[], warning: "Aucun Fusion Title trouvé sur V2." };

  const titles: TitleInfo[] = fusionClips.map((clip, idx) => {
    const start = parseInt(clip.getElementsByTagName("start")[0]?.textContent?.trim() ?? "0", 10) || 0;
    const end = parseInt(clip.getElementsByTagName("end")[0]?.textContent?.trim() ?? "0", 10) || 0;
    const dur = end - start;

    let text = "";
    for (const v1 of v1Clips) {
      const v1s = parseInt(v1.getElementsByTagName("start")[0]?.textContent?.trim() ?? "0", 10) || 0;
      const v1e = parseInt(v1.getElementsByTagName("end")[0]?.textContent?.trim() ?? "0", 10) || 0;
      if (start >= v1s && start < v1e) {
        const mc1 = v1.getElementsByTagName("mastercomment1")[0]?.textContent?.trim();
        if (mc1) { text = mc1; break; }
      }
    }
    if (!text) text = `Title ${idx + 1}`;

    return {
      index: idx + 1, startFrame: start, endFrame: end, durationFrames: dur,
      startTC: framesToTC(start, fps), endTC: framesToTC(end, fps), text,
    };
  });

  return { fps, titles, warning: null as string | null };
}

/* ═══════════════ XML TRANSFORMER ═══════════════ */

function fixXml(xmlStr: string, fps: number): { fixed: string; diffLines: string[] } {
  let result = xmlStr;
  const diffLines: string[] = [];

  // 1. Replace sequence name
  result = result.replace(
    /<sequence[^>]*>[\s\S]*?<name>[^<]*<\/name>/,
    (match) => {
      const replaced = match.replace(/<name>[^<]*<\/name>/, "<name>Main Sequence (Resolve)</name>");
      diffLines.push("+ <name>Main Sequence (Resolve)</name>");
      return replaced;
    }
  );

  // 2. Add timecode block after <out>-1</out> in sequence if missing
  if (!result.match(/<sequence[\s\S]*?<timecode>/)) {
    const tcBlock = `
        <timecode>
            <string>00:00:00:00</string>
            <frame>0</frame>
            <displayformat>NDF</displayformat>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        </timecode>`;
    result = result.replace(
      /(<sequence[\s\S]*?<out>-1<\/out>)/,
      `$1${tcBlock}`
    );
    diffLines.push("+ <timecode> block added to sequence");
  }

  // 3. Replace first empty Fusion Title file ref with full block
  const fullBlock = buildFullFileBlock(fps);
  let firstReplaced = false;

  // Match clipitems with name "Fusion Title" that have an empty file ref
  result = result.replace(
    /(<clipitem\s+id="[^"]*">\s*<name>Fusion Title<\/name>[\s\S]*?)<file\s+id="Fusion Title 2"\s*\/>/g,
    (match, prefix) => {
      if (!firstReplaced) {
        firstReplaced = true;
        diffLines.push("- <file id=\"Fusion Title 2\"/>");
        diffLines.push(`+ <file id="Fusion Title 2"> ... full definition ... </file>`);
        return prefix + fullBlock;
      }
      return match; // keep self-closing for subsequent
    }
  );

  return { fixed: result, diffLines };
}

/* ═══════════════ PYTHON GENERATOR ═══════════════ */

function generatePy(titles: TitleInfo[], fps: number, templateName: string): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const list = titles
    .map((t) => `    {"start": ${t.startFrame}, "text": "${esc(t.text)}"},`)
    .join("\n");

  return `import DaVinciResolveScript as dvr

resolve = dvr.scriptapp("Resolve")
project = resolve.GetProjectManager().GetCurrentProject()
timeline = project.GetCurrentTimeline()

fps = ${fps}

titles = [
${list}
]

items = timeline.GetItemListInTrack("video", 2)
if not items:
    print("Aucun clip trouvé sur la piste V2.")
else:
    for item in items:
        start = item.GetStart()
        for t in titles:
            if t["start"] == start:
                comp = item.GetFusionCompByIndex(1)
                if comp:
                    tool = comp.FindFirstTool("TextPlus")
                    if tool:
                        tool.StyledText = t["text"]
                        print(f"\\u2713 Frame {start}: {t['text'][:50]}")
                    else:
                        print(f"\\u26a0 Pas de TextPlus à la frame {start} — appliquez d'abord le template '${esc(templateName)}'")
    print("Terminé.")
`;
}

/* ═══════════════ COMPONENT ═══════════════ */

const STEPS = [
  'Téléchargez le XML corrigé avec le bouton "Fixer le XML"',
  "Dans DaVinci Resolve, importez ce nouveau fichier XML (File > Import Timeline)",
  "Les Fusion Titles apparaissent sur V2 sans erreurs",
  "Sélectionnez tous les clips de la piste V2 (Cmd+A sur la piste)",
  "Clic droit > Change Clip Color ou Effects > Titles > [votre template] pour appliquer le template à tous les clips sélectionnés",
  "Allez dans Workspace > Console > Py3",
  "Collez ou chargez le script Python généré",
  "Cliquez Run — le texte est injecté dans chaque Fusion Title",
];

export default function TitleFixer() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rawXml, setRawXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [titles, setTitles] = useState<TitleInfo[]>([]);
  const [fps, setFps] = useState(24);
  const [warning, setWarning] = useState<string | null>(null);
  const [fixedXml, setFixedXml] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<string[]>([]);
  const [pyScript, setPyScript] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState("xml");

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".xml")) {
      toast({ title: "Fichier non supporté", description: "Seuls les fichiers .xml sont acceptés.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawXml(text);
      setFileName(file.name);
      const result = parseXml(text);
      setFps(result.fps);
      setTitles(result.titles);
      setWarning(result.warning);
      setFixedXml(null);
      setDiffLines([]);
      setPyScript(null);
      setSuccess(false);
    };
    reader.readAsText(file);
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const doFix = () => {
    if (!rawXml) return;
    const { fixed, diffLines: dl } = fixXml(rawXml, fps);
    setFixedXml(fixed);
    setDiffLines(dl);
    setSuccess(true);
    setActiveTab("xml");

    // trigger download
    const blob = new Blob([fixed], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(".xml", "_fixed.xml");
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "XML corrigé téléchargé !" });
  };

  const doGeneratePy = () => {
    if (!titles.length) return;
    const py = generatePy(titles, fps, templateName || "Fusion Title");
    setPyScript(py);
    setActiveTab("python");
  };

  const copyScript = async () => {
    if (!pyScript) return;
    await navigator.clipboard.writeText(pyScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copié !" });
  };

  const downloadPy = () => {
    if (!pyScript) return;
    const blob = new Blob([pyScript], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resolve_titles.py";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#111827] text-[#e5e7eb] font-sans">
      {/* header */}
      <header className="border-b border-[#374151] px-6 py-4 flex items-center gap-3">
        <FileCode2 className="w-6 h-6 text-[#6366f1]" />
        <h1 className="text-xl font-bold tracking-tight">Resolve Title Fixer</h1>
        <span className="text-xs text-[#9ca3af] ml-2">XMEML → DaVinci Resolve</span>
      </header>

      {/* success banner */}
      {success && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-emerald-900/40 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          XML corrigé avec succès — {diffLines.length} modification(s) appliquée(s).
        </div>
      )}

      <div className="flex flex-col lg:flex-row h-[calc(100vh-65px)]">
        {/* ── LEFT ── */}
        <div className="lg:w-[480px] shrink-0 border-r border-[#374151] p-6 overflow-y-auto space-y-5">
          {/* drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#374151] rounded-xl p-8 text-center cursor-pointer hover:border-[#6366f1]/60 transition-colors"
          >
            <Upload className="mx-auto w-8 h-8 mb-2 text-[#6b7280]" />
            <p className="text-sm text-[#6b7280]">
              {fileName ? <span className="text-[#6366f1] font-medium">{fileName}</span> : "Glisse un fichier .xml ici ou clique pour parcourir"}
            </p>
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>

          {/* warning */}
          {warning && (
            <div className="flex items-start gap-2 bg-amber-900/30 border border-amber-600/30 rounded-lg p-3 text-sm text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          )}

          {/* table */}
          {titles.length > 0 && (
            <div className="rounded-lg border border-[#374151] overflow-hidden">
              <div className="px-3 py-2 bg-[#1f2937] text-xs text-[#9ca3af] font-medium flex items-center justify-between">
                <span>{titles.length} Fusion Title(s) détecté(s)</span>
                <span>{fps} fps</span>
              </div>
              <ScrollArea className="max-h-[300px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#374151] text-[#9ca3af]">
                      <th className="px-3 py-2 text-left w-8">#</th>
                      <th className="px-3 py-2 text-left">Start</th>
                      <th className="px-3 py-2 text-left">End</th>
                      <th className="px-3 py-2 text-right">Dur.</th>
                      <th className="px-3 py-2 text-left">Texte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {titles.map((t) => (
                      <tr key={t.index} className="border-b border-[#1f2937] hover:bg-[#1f2937]/60">
                        <td className="px-3 py-1.5 text-[#9ca3af]">{t.index}</td>
                        <td className="px-3 py-1.5 font-mono text-[#c4b5fd]">{t.startTC}</td>
                        <td className="px-3 py-1.5 font-mono text-[#c4b5fd]">{t.endTC}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{t.durationFrames}f</td>
                        <td className="px-3 py-1.5 max-w-[180px] truncate" title={t.text}>{t.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {/* template input */}
          <div>
            <Label className="text-xs text-[#9ca3af] mb-1 block">Nom du template Resolve</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Lower Third, Slug..."
              className="bg-[#1f2937] border-[#374151] text-[#e5e7eb] placeholder:text-[#4b5563]"
            />
          </div>

          {/* action buttons */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={doFix}
              disabled={!rawXml || titles.length === 0}
              className="w-full gap-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-semibold min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              Fixer le XML
            </Button>
            <Button
              onClick={doGeneratePy}
              disabled={titles.length === 0}
              variant="outline"
              className="w-full gap-2 border-[#374151] text-[#c4b5fd] hover:bg-[#1f2937] min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              Générer script Python
            </Button>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="flex-1 p-6 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-[#1f2937] border border-[#374151]">
              <TabsTrigger value="xml" className="data-[state=active]:bg-[#6366f1] data-[state=active]:text-white text-[#9ca3af]">XML</TabsTrigger>
              <TabsTrigger value="python" className="data-[state=active]:bg-[#6366f1] data-[state=active]:text-white text-[#9ca3af]">Script Python</TabsTrigger>
              <TabsTrigger value="howto" className="data-[state=active]:bg-[#6366f1] data-[state=active]:text-white text-[#9ca3af]">Mode d'emploi</TabsTrigger>
            </TabsList>

            {/* TAB: XML diff */}
            <TabsContent value="xml" className="mt-4">
              {diffLines.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-[#4b5563] text-sm">
                  Le diff XML apparaîtra après correction.
                </div>
              ) : (
                <ScrollArea className="rounded-lg border border-[#374151] bg-[#0d1117] max-h-[calc(100vh-220px)]">
                  <pre className="p-4 text-xs font-mono leading-relaxed">
                    {diffLines.map((line, i) => {
                      const isAdd = line.startsWith("+");
                      const isRemove = line.startsWith("-");
                      return (
                        <div
                          key={i}
                          className={`px-2 py-0.5 rounded-sm ${
                            isAdd ? "bg-emerald-900/30 text-emerald-300" :
                            isRemove ? "bg-red-900/30 text-red-300 line-through" :
                            "text-[#9ca3af]"
                          }`}
                        >
                          {line}
                        </div>
                      );
                    })}
                  </pre>
                </ScrollArea>
              )}
            </TabsContent>

            {/* TAB: Python */}
            <TabsContent value="python" className="mt-4 space-y-3">
              {!pyScript ? (
                <div className="h-64 flex items-center justify-center text-[#4b5563] text-sm">
                  Clique "Générer script Python" pour voir le résultat.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Button onClick={copyScript} variant="outline" size="sm" className="gap-1.5 border-[#374151] text-[#d1d5db] hover:bg-[#1f2937]">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copié" : "Copier"}
                    </Button>
                    <Button onClick={downloadPy} variant="outline" size="sm" className="gap-1.5 border-[#374151] text-[#d1d5db] hover:bg-[#1f2937]">
                      <Download className="w-3.5 h-3.5" />
                      Télécharger .py
                    </Button>
                  </div>
                  <ScrollArea className="rounded-lg border border-[#374151] bg-[#0d1117] max-h-[calc(100vh-260px)]">
                    <pre className="p-4 text-xs font-mono text-[#c4b5fd] whitespace-pre leading-relaxed">{pyScript}</pre>
                  </ScrollArea>
                </>
              )}
            </TabsContent>

            {/* TAB: How-to */}
            <TabsContent value="howto" className="mt-4">
              <div className="rounded-lg border border-[#374151] bg-[#1f2937] p-5 space-y-4">
                <h2 className="text-base font-semibold text-[#e5e7eb]">Mode d'emploi</h2>
                <ol className="space-y-3">
                  {STEPS.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-[#d1d5db]">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-[#6366f1]/20 text-[#6366f1] flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
