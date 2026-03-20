import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, Download, Copy, Check, FileCode2,
  AlertTriangle, CheckCircle2, Info, MousePointer,
  FileDown, ClipboardList, Palette, Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

/* ═══════════════ TYPES ═══════════════ */

interface TitleInfo {
  index: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  timecode: string;
  durationTC: string;
  text: string;
}

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

/* ═══════════════ XML PARSER (DOM-based) ═══════════════ */

function parseXml(xmlStr: string): { fps: number; titles: TitleInfo[]; warning: string | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  if (doc.querySelector("parsererror"))
    return { fps: 0, titles: [], warning: "Fichier XML invalide." };

  const rateNodes = doc.getElementsByTagName("rate");
  let fps = 24;
  if (rateNodes.length > 0) {
    const tb = rateNodes[0].getElementsByTagName("timebase")[0]?.textContent?.trim();
    if (tb) fps = parseInt(tb, 10) || 24;
  }

  const videoEls = doc.getElementsByTagName("video");
  if (videoEls.length === 0)
    return { fps, titles: [], warning: "Aucun bloc <video> trouvé dans le XML." };

  const tracks = videoEls[0].getElementsByTagName("track");
  if (tracks.length < 2)
    return { fps, titles: [], warning: "Pas de piste V2 détectée — vérifiez que votre timeline contient deux pistes vidéo." };

  const v1Clips = Array.from(tracks[0].getElementsByTagName("clipitem"));
  const v2Clips = Array.from(tracks[1].getElementsByTagName("clipitem"));

  const fusionClips = v2Clips.filter((c) => {
    const n = c.getElementsByTagName("name")[0]?.textContent?.trim();
    return n === "Fusion Title";
  });

  if (fusionClips.length === 0)
    return { fps, titles: [], warning: "Aucun Fusion Title trouvé sur la piste V2." };

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
      index: idx + 1,
      startFrame: start,
      endFrame: end,
      durationFrames: dur,
      timecode: framesToTC(start, fps),
      durationTC: framesToTC(dur, fps),
      text,
    };
  });

  return { fps, titles, warning: null };
}

/* ═══════════════ XML TRANSFORMER (DOM-based) ═══════════════ */

function transformXml(xmlStr: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");

  // 1. Get FPS
  const rateNodes = doc.getElementsByTagName("rate");
  let fps = 24;
  if (rateNodes.length > 0) {
    const tb = rateNodes[0].getElementsByTagName("timebase")[0]?.textContent?.trim();
    if (tb) fps = parseInt(tb, 10) || 24;
  }

  // 2. Replace sequence name
  const seqName = doc.querySelector("sequence > name");
  if (seqName) seqName.textContent = "Main Sequence (Resolve)";

  // 3. Add timecode block to sequence if missing
  const sequence = doc.querySelector("sequence");
  if (sequence && !sequence.querySelector(":scope > timecode")) {
    const outEl = sequence.querySelector(":scope > out");
    if (outEl) {
      const tc = doc.createElement("timecode");
      const addEl = (parent: Element, tag: string, val: string) => {
        const el = doc.createElement(tag);
        el.textContent = val;
        parent.appendChild(el);
      };
      addEl(tc, "string", "00:00:00:00");
      addEl(tc, "frame", "0");
      addEl(tc, "displayformat", "NDF");
      const rate = doc.createElement("rate");
      addEl(rate, "timebase", String(fps));
      addEl(rate, "ntsc", "FALSE");
      tc.appendChild(rate);
      outEl.after(tc);
    }
  }

  // 4. Fix Fusion Title file references
  const videoEls = doc.getElementsByTagName("video");
  if (videoEls.length > 0) {
    const tracks = videoEls[0].getElementsByTagName("track");
    if (tracks.length >= 2) {
      const v2Clips = Array.from(tracks[1].getElementsByTagName("clipitem"));
      let firstDone = false;

      for (const clip of v2Clips) {
        const clipName = clip.getElementsByTagName("name")[0]?.textContent?.trim();
        if (clipName !== "Fusion Title") continue;

        const fileEl = clip.querySelector('file[id="Fusion Title 2"]');
        if (!fileEl) continue;

        // Only expand the first one
        if (!firstDone && fileEl.childNodes.length === 0) {
          firstDone = true;

          const addEl = (parent: Element, tag: string, val: string) => {
            const el = doc.createElement(tag);
            el.textContent = val;
            parent.appendChild(el);
          };

          addEl(fileEl, "duration", "120");

          const rate1 = doc.createElement("rate");
          addEl(rate1, "timebase", String(fps));
          addEl(rate1, "ntsc", "FALSE");
          fileEl.appendChild(rate1);

          addEl(fileEl, "name", "Slug");

          const tc = doc.createElement("timecode");
          addEl(tc, "string", "00:00:00:00");
          addEl(tc, "displayformat", "NDF");
          const rate2 = doc.createElement("rate");
          addEl(rate2, "timebase", String(fps));
          addEl(rate2, "ntsc", "FALSE");
          tc.appendChild(rate2);
          fileEl.appendChild(tc);

          const media = doc.createElement("media");
          const video = doc.createElement("video");
          const sc = doc.createElement("samplecharacteristics");
          addEl(sc, "width", "1920");
          addEl(sc, "height", "1080");
          video.appendChild(sc);
          media.appendChild(video);
          fileEl.appendChild(media);

          addEl(fileEl, "mediaSource", "Slug");
        }
      }
    }
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

/* ═══════════════ STEPS DATA ═══════════════ */

const STEPS = [
  { icon: FileDown, text: "Importez le XML corrigé : File > Import Timeline > timeline_resolve_ready.xml" },
  { icon: CheckCircle2, text: "Vos Fusion Titles apparaissent sur V2 sans avertissements jaunes" },
  { icon: Palette, text: "Sélectionnez TOUS les clips V2 (clic sur la piste + Cmd/Ctrl+A)" },
  { icon: MousePointer, text: "Clic droit > Change clip to Fusion Title > [votre template]\nOU : Effects Library > Titles > glissez votre template sur la sélection" },
  { icon: Type, text: "Pour chaque Fusion Title, double-cliquez > modifiez le texte.\nUtilisez le tableau ci-dessus pour copier-coller chaque texte rapidement." },
];

/* ═══════════════ COMPONENT ═══════════════ */

export default function TitleFixer() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rawXml, setRawXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [titles, setTitles] = useState<TitleInfo[]>([]);
  const [fps, setFps] = useState(24);
  const [warning, setWarning] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (titles.length > 0) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [titles]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".xml")) {
      toast({ title: "Format non supporté", description: "Seuls les fichiers .xml sont acceptés.", variant: "destructive" });
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
      setDownloaded(false);
      setCopiedAll(false);
      if (result.titles.length > 0 && !result.warning) {
        toast({ title: `✓ ${result.titles.length} Fusion Title(s) détecté(s)`, description: `${result.fps} fps — prêt pour correction` });
      }
    };
    reader.readAsText(file);
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const doDownload = () => {
    if (!rawXml) return;
    const fixed = transformXml(rawXml);
    const blob = new Blob([fixed], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timeline_resolve_ready.xml";
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    toast({ title: "✓ XML corrigé téléchargé !" });
  };

  const copyOne = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const copyAll = async () => {
    const lines = titles.map((t) => `${t.index}. [${t.timecode}] ${t.text}`).join("\n");
    await navigator.clipboard.writeText(lines);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast({ title: "Tous les textes copiés !" });
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#e2e4e9]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── HEADER ── */}
      <header className="border-b border-[#2a2d3a] px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
          <FileCode2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Resolve Title Fixer</h1>
          <p className="text-[11px] text-[#6b6f80] leading-none">DaVinci Resolve — version gratuite</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-8 space-y-6">
        {/* ── STEP 1: UPLOAD ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[#7c3aed]/20 text-[#7c3aed] flex items-center justify-center text-xs font-bold">1</span>
            <span className="text-sm font-medium text-[#9ca0b0]">Charger le fichier XML</span>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#2a2d3a] rounded-xl p-10 text-center cursor-pointer hover:border-[#7c3aed]/50 transition-colors bg-[#1a1d27]/50"
          >
            <Upload className="mx-auto w-8 h-8 mb-3 text-[#4a4e5e]" />
            {fileName ? (
              <p className="text-sm">
                <span className="text-[#7c3aed] font-medium">{fileName}</span>
                <span className="text-[#6b6f80] ml-2">— {titles.length} titre(s), {fps} fps</span>
              </p>
            ) : (
              <p className="text-sm text-[#6b6f80]">Glissez un fichier .xml ici ou cliquez pour parcourir</p>
            )}
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        </section>

        {/* ── WARNING ── */}
        {warning && (
          <div className="flex items-start gap-2.5 bg-amber-950/30 border border-amber-700/30 rounded-lg px-4 py-3 text-sm text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        {/* ── STEP 2: PREVIEW TABLE ── */}
        {titles.length > 0 && (
          <section
            className="transition-all duration-500"
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-[#7c3aed]/20 text-[#7c3aed] flex items-center justify-center text-xs font-bold">2</span>
              <span className="text-sm font-medium text-[#9ca0b0]">Titres extraits</span>
              <span className="ml-auto text-xs text-[#6b6f80] tabular-nums">{titles.length} titre(s)</span>
            </div>

            <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] overflow-hidden">
              <ScrollArea className="max-h-[340px]">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#2a2d3a] text-[#6b6f80] text-xs">
                      <th className="px-4 py-2.5 text-left w-10">#</th>
                      <th className="px-4 py-2.5 text-left w-[110px]">Timecode</th>
                      <th className="px-4 py-2.5 text-left w-[90px]">Durée</th>
                      <th className="px-4 py-2.5 text-left">Texte du titre</th>
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {titles.map((t) => (
                      <tr key={t.index} className="border-b border-[#1f2230] hover:bg-[#1f2230]/60 transition-colors">
                        <td className="px-4 py-2 text-[#6b6f80] tabular-nums">{t.index}</td>
                        <td className="px-4 py-2 font-mono text-[#a78bfa] text-xs tabular-nums">{t.timecode}</td>
                        <td className="px-4 py-2 font-mono text-[#6b6f80] text-xs tabular-nums">{t.durationFrames}f</td>
                        <td className="px-4 py-2 max-w-[320px] truncate" title={t.text}>{t.text}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyOne(t.text, t.index); }}
                            className="p-1 rounded hover:bg-[#2a2d3a] transition-colors"
                            title="Copier ce texte"
                          >
                            {copiedIdx === t.index
                              ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                              : <Copy className="w-3.5 h-3.5 text-[#6b6f80]" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>

            {/* Info box */}
            <div className="mt-3 flex items-start gap-2.5 bg-[#7c3aed]/8 border border-[#7c3aed]/20 rounded-lg px-4 py-3 text-[13px] text-[#c4b5fd]">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-[#7c3aed]" />
              <span>
                <strong>Version gratuite de Resolve</strong> : le texte doit être saisi manuellement.
                Ce tableau vous permet de copier-coller chaque texte rapidement.
              </span>
            </div>
          </section>
        )}

        {/* ── STEP 3: ACTIONS ── */}
        {titles.length > 0 && (
          <section
            className="transition-all duration-500 delay-100"
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-[#7c3aed]/20 text-[#7c3aed] flex items-center justify-center text-xs font-bold">3</span>
              <span className="text-sm font-medium text-[#9ca0b0]">Actions</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={doDownload}
                disabled={!rawXml}
                className="flex-1 gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold min-h-[48px] text-sm rounded-xl active:scale-[0.97] transition-all"
              >
                {downloaded ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                {downloaded ? "Téléchargé !" : "Télécharger le XML corrigé"}
              </Button>
              <Button
                onClick={copyAll}
                variant="outline"
                className="flex-1 gap-2 border-[#2a2d3a] text-[#c4b5fd] hover:bg-[#1a1d27] min-h-[48px] text-sm rounded-xl active:scale-[0.97] transition-all"
              >
                {copiedAll ? <Check className="w-4 h-4 text-emerald-400" /> : <ClipboardList className="w-4 h-4" />}
                {copiedAll ? "Copié !" : "Copier tous les textes"}
              </Button>
            </div>
          </section>
        )}

        {/* ── STEP 4: INSTRUCTIONS ── */}
        <section
          className="transition-all duration-500 delay-200"
          style={{ opacity: visible || titles.length === 0 ? 1 : 0 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[#7c3aed]/20 text-[#7c3aed] flex items-center justify-center text-xs font-bold">
              {titles.length > 0 ? "4" : "?"}
            </span>
            <span className="text-sm font-medium text-[#9ca0b0]">Comment utiliser dans DaVinci Resolve (version gratuite)</span>
          </div>

          <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-5 space-y-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex items-start gap-3 text-[13px] text-[#b0b4c4]">
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-[#7c3aed]/10 text-[#7c3aed] flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="pt-1 whitespace-pre-line leading-relaxed">{step.text}</span>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
