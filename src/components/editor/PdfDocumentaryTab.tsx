import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Swords, ScrollText, Download, ArrowRight, ChevronDown, Copy, Mic, Plus, Trash2, RotateCcw, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBackgroundTasks } from "@/contexts/BackgroundTasks";
import { NARRATIVE_STYLES, DEFAULT_NARRATIVE_STYLE_ID } from "@/config/narrativeStyles";
import { parseScriptIntoSections, reassembleSections, sanitizeNarrativeSections, type NarrativeSection, type SectionHistoryEntry } from "./SectionCard";
import NarrativeScriptBlock, { type ScriptVersion } from "./NarrativeScriptBlock";
import ChapterCollapse from "./ChapterCollapse";
import type { ChapterListState } from "./chapterTypes";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface NarrativeAnalysis {
  central_mystery: string;
  main_contradiction: string;
  intriguing_discoveries: string[];
  narrative_tensions: { title: string; description: string }[];
}

interface DocSection {
  section_key: string;
  section_label: string;
  video_title: string;
  narrative_description: string;
}

// ScriptVersion is now imported from NarrativeScriptBlock

const extractTextFromStreamPayload = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "";

  const data = payload as {
    error?: string;
    choices?: Array<{
      delta?: { content?: unknown };
      message?: { content?: unknown };
      text?: unknown;
    }>;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  if (typeof data.error === "string") {
    throw new Error(data.error);
  }

  const normalizeContent = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";

    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";

        const typedPart = part as {
          text?: string;
          content?: string;
        };

        return typedPart.text ?? typedPart.content ?? "";
      })
      .join("");
  };

  const choice = data.choices?.[0];
  const deltaText = normalizeContent(choice?.delta?.content);
  if (deltaText) return deltaText;

  const messageText = normalizeContent(choice?.message?.content);
  if (messageText) return messageText;

  if (typeof choice?.text === "string") return choice.text;

  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("");
  }

  return "";
};

const readSseEventData = (rawEvent: string): string | null => {
  const dataLines = rawEvent
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) return null;
  return dataLines.join("\n").trim();
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "it", label: "Italiano" },
];

interface PdfDocumentaryTabProps {
  projectId: string | null;
  scriptLanguage: string;
  onLanguageChange?: (lang: string) => void;
  onSendToNarration?: (text: string) => void;
  onAnalysisReady?: (analysis: NarrativeAnalysis, text: string) => void;
  onScriptReady?: (script: string) => void;
  extractedText: string | null;
  onExtractedTextChange: (text: string | null) => void;
  pageCount: number;
  onPageCountChange: (count: number) => void;
  fileName: string | null;
  onFileNameChange: (name: string | null) => void;
  analysis: NarrativeAnalysis | null;
  onAnalysisChange: (analysis: NarrativeAnalysis | null) => void;
  docStructure: DocSection[] | null;
  onDocStructureChange: (structure: DocSection[] | null) => void;
  script: string | null;
  onScriptChange: (script: string | null) => void;
  scriptVersions: ScriptVersion[];
  onScriptVersionsChange: (versions: ScriptVersion[] | ((prev: ScriptVersion[]) => ScriptVersion[])) => void;
  currentVersionId: number | null;
  onCurrentVersionIdChange: (id: number | null) => void;
  narration: string;
  onNarrationChange: (text: string) => void;
  onRunSegmentation: () => void;
  segmenting: boolean;
  onStopSegmentation: () => void;
  shots?: Array<{ id: string; scene_id: string; shot_order: number; source_sentence: string | null; source_sentence_fr: string | null }>;
  scenesForShotOrder?: Array<{ id: string; scene_order: number }>;
}

export default function PdfDocumentaryTab({
  projectId, scriptLanguage, onLanguageChange, onSendToNarration, onAnalysisReady, onScriptReady,
  extractedText, onExtractedTextChange, pageCount, onPageCountChange, fileName, onFileNameChange,
  analysis, onAnalysisChange, docStructure, onDocStructureChange, script, onScriptChange,
  scriptVersions, onScriptVersionsChange, currentVersionId, onCurrentVersionIdChange,
  narration, onNarrationChange, onRunSegmentation, segmenting, onStopSegmentation, shots, scenesForShotOrder,
}: PdfDocumentaryTabProps) {
  const { startScriptGeneration, getTask, subscribe, stopTask } = useBackgroundTasks();
  const [chapterState, setChapterState] = useState<ChapterListState | null>(null);
  const chapterSaveTimeoutRef = useRef<number | null>(null);
  const chapterHydratedRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [targetChars, setTargetChars] = useState(15000);
  const [narrativeStyleId, setNarrativeStyleId] = useState(DEFAULT_NARRATIVE_STYLE_ID);
  const [customStyleLabel, setCustomStyleLabel] = useState("");
  const [parsing, setParsing] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [analyzingScript, setAnalyzingScript] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [findingTension, setFindingTension] = useState(false);
  const [showVersionPreviewId, setShowVersionPreviewId] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  const [sections, setSections] = useState<NarrativeSection[]>(() => parseScriptIntoSections(script || ""));
  const [sectionHistory, setSectionHistory] = useState<Record<string, SectionHistoryEntry[]>>({});
  const [sectionTranslations, setSectionTranslations] = useState<Record<string, string>>({});
  const [translatingSections, setTranslatingSections] = useState<Set<string>>(new Set());
  const translationsHydratedRef = useRef(false);
  const sectionsInitRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  

  // ── Hydrate chapterState from DB on mount ──
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      const saved = (data?.timeline_state as any)?.chapterState as ChapterListState | null;
      if (saved?.chapters?.length) {
        setChapterState(saved);
      }
      chapterHydratedRef.current = true;
    })();
  }, [projectId]);

  // ── Hydrate sectionTranslations from DB on mount ──
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      const saved = (data?.timeline_state as any)?.sectionTranslations as Record<string, string> | null;
      if (saved && Object.keys(saved).length > 0) {
        setSectionTranslations(saved);
      }
      translationsHydratedRef.current = true;
    })();
  }, [projectId]);

  // ── Persist sectionTranslations to DB ──
  const saveTranslations = useCallback(async (translations: Record<string, string>) => {
    if (!projectId || !translationsHydratedRef.current) return;
    try {
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      const currentState = (data?.timeline_state as any) ?? {};
      await supabase
        .from("project_scriptcreator_state")
        .update({ timeline_state: { ...currentState, sectionTranslations: translations } as any })
        .eq("project_id", projectId);
    } catch (e) {
      console.error("Failed to persist sectionTranslations:", e);
    }
  }, [projectId]);

  const saveChapterState = useCallback(async (state: ChapterListState) => {
    if (!projectId) return;
    try {
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      const currentState = (data?.timeline_state as any) ?? {};
      await supabase
        .from("project_scriptcreator_state")
        .update({ timeline_state: { ...currentState, chapterState: state } as any })
        .eq("project_id", projectId);
    } catch (e) {
      console.error("Failed to persist chapterState:", e);
    }
  }, [projectId]);

  const pendingChapterSaveRef = useRef<ChapterListState | null>(null);

  useEffect(() => {
    if (!projectId || !chapterHydratedRef.current || !chapterState) return;

    pendingChapterSaveRef.current = chapterState;
    if (chapterSaveTimeoutRef.current) window.clearTimeout(chapterSaveTimeoutRef.current);
    chapterSaveTimeoutRef.current = window.setTimeout(() => {
      pendingChapterSaveRef.current = null;
      saveChapterState(chapterState);
    }, 600);

    return () => {
      if (chapterSaveTimeoutRef.current) window.clearTimeout(chapterSaveTimeoutRef.current);
    };
  }, [projectId, chapterState, saveChapterState]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (pendingChapterSaveRef.current && projectId) {
        saveChapterState(pendingChapterSaveRef.current);
      }
    };
  }, [projectId, saveChapterState]);


  const bgScriptTask = projectId ? getTask(projectId, "script") : undefined;
  const generatingScript = bgScriptTask?.status === "running";

  useEffect(() => {
    if (!generatingScript && script && script.trim() !== "" && scriptVersions.length === 0) {
      const versionStyle = narrativeStyleId === "custom" ? (customStyleLabel || "custom") : narrativeStyleId;
      onScriptVersionsChange([{ id: 1, content: script, style: versionStyle }]);
      onCurrentVersionIdChange(1);
    }
  }, [script, generatingScript, scriptVersions.length]);

  // When script changes externally (generation, version restore), parse sections
  // If [[TAG]] markers are present, use deterministic parser immediately
  useEffect(() => {
    const scriptStr = script || "";
    if (scriptStr !== sectionsInitRef.current) {
      sectionsInitRef.current = scriptStr;
      if (!scriptStr.trim()) {
        setSections(parseScriptIntoSections(""));
      } else {
        // Auto-parse if tagged script detected (V3 tags like [[HOOK]], [[ACT1]], etc.)
        const hasV3Tags = /\[\[(HOOK|CONTEXT|PROMISE|ACT[123]B?|CLIMAX|INSIGHT|CONCLUSION|TRANSITIONS|STYLE\s*CHECK|RISK\s*CHECK)\]\]/i.test(scriptStr);
        if (hasV3Tags) {
          const parsed = parseScriptIntoSections(scriptStr);
          setSections(parsed);

          // Detect ACT2/ACT2B fusion and warn user
          const act2 = parsed.find((s) => s.key === "act2");
          const act2b = parsed.find((s) => s.key === "act2b");
          if (act2 && act2b && act2.content.trim().length > 200 && (!act2b.content.trim() || act2b.content.startsWith("⚠️"))) {
            toast.warning("ACT2B manquant", {
              description: "L'IA a fusionné ACT2 et ACT2B. Régénérez le script ou séparez manuellement le contenu du bloc ACT2B.",
              duration: 8000,
            });
          }
        }
      }
    }
  }, [script]);

  // AI-powered script analysis — replaces heuristic segmentation
  const handleAnalyzeScript = useCallback(async (scriptText?: string) => {
    const textToAnalyze = scriptText || script;
    if (!textToAnalyze || textToAnalyze.trim().length < 100) return;

    // If the script already has [[TAG]] markers, use the deterministic parser — skip AI analysis
    // This prevents the AI analyzer (which only knows 9 sections) from destroying ACT2B and editorial blocks
    const hasV3Tags = /\[\[(HOOK|CONTEXT|PROMISE|ACT[123]B?|CLIMAX|INSIGHT|CONCLUSION|TRANSITIONS|STYLE\s*CHECK|RISK\s*CHECK)\]\]/i.test(textToAnalyze);
    if (hasV3Tags) {
      const parsed = parseScriptIntoSections(textToAnalyze);
      const { sections: sanitized, warnings } = sanitizeNarrativeSections(parsed);
      setSections(sanitized);
      sectionsInitRef.current = textToAnalyze;
      for (const w of warnings) {
        toast.info(w, { duration: 3000 });
      }
      setScriptOpen(true);
      setOpenSections(new Set(["hook"]));
      toast.success(`Script analysé — ${sanitized.filter(s => s.content.trim()).length} sections identifiées`);
      return;
    }

    // Fallback: AI-powered analysis for untagged scripts
    setAnalyzingScript(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            script: textToAnalyze,
            language: scriptLanguage,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      const data = await response.json();
      if (data.sections && Array.isArray(data.sections)) {
        const SECTION_META: Record<string, { label: string; icon: string }> = {
          hook: { label: "Hook", icon: "🎣" },
          context: { label: "Context", icon: "📖" },
          promise: { label: "Promise", icon: "🎯" },
          act1: { label: "Act 1 — Setup", icon: "🏗️" },
          act2: { label: "Act 2 — Escalade", icon: "⚡" },
          act2b: { label: "Act 2B — Contre-point", icon: "🔀" },
          act3: { label: "Act 3 — Impact", icon: "🔥" },
          climax: { label: "Climax", icon: "💡" },
          insight: { label: "Insight", icon: "🧠" },
          conclusion: { label: "Conclusion", icon: "🎬" },
          transitions: { label: "Transitions", icon: "🔗" },
          style_check: { label: "Style Check", icon: "🎨" },
          risk_check: { label: "Risk Check", icon: "⚠️" },
        };

        const newSections: NarrativeSection[] = data.sections.map((s: { key: string; content: string }) => ({
          key: s.key,
          label: SECTION_META[s.key]?.label || s.key,
          icon: SECTION_META[s.key]?.icon || "📄",
          content: s.content || "",
        }));

        const { sections: sanitized, warnings } = sanitizeNarrativeSections(newSections);
        setSections(sanitized);

        // Rebuild script from AI sections to ensure consistency
        const reassembled = reassembleSections(sanitized);
        sectionsInitRef.current = reassembled;
        onScriptChange(reassembled);

        for (const w of warnings) {
          toast.info(w, { duration: 3000 });
        }

        setScriptOpen(true);
        setOpenSections(new Set(["hook"]));
        toast.success(`Analyse narrative terminée — ${sanitized.filter(s => s.content.trim()).length} sections identifiées`);
      }
    } catch (e: any) {
      console.error("Script analysis error:", e);
      toast.error(e?.message || "Erreur lors de l'analyse du script");
    } finally {
      setAnalyzingScript(false);
    }
  }, [script, scriptLanguage, onScriptChange]);

  // Save current content of a section to its history
  const pushSectionHistory = useCallback((key: string, content: string, label?: string) => {
    if (!content.trim()) return;
    setSectionHistory((prev) => {
      const existing = prev[key] || [];
      // Don't duplicate if same content as last entry
      if (existing.length > 0 && existing[0].content === content) return prev;
      const entry: SectionHistoryEntry = { content, timestamp: new Date().toISOString(), label };
      return { ...prev, [key]: [entry, ...existing].slice(0, 20) }; // Keep max 20
    });
  }, []);

  // Handle section content edit — reassemble and propagate immediately
  const handleSectionContentChange = useCallback((key: string, content: string) => {
    setSections((prev) => {
      const next = prev.map((s) => s.key === key ? { ...s, content } : s);
      const reassembled = reassembleSections(next);
      sectionsInitRef.current = reassembled;
      onScriptChange(reassembled);
      return next;
    });
    // Invalidate translation when content changes
    setSectionTranslations((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        saveTranslations(next);
        return next;
      }
      return prev;
    });
  }, [onScriptChange, saveTranslations]);

  // Restore a section from history
  const handleRestoreSection = useCallback((key: string, content: string) => {
    // Save current before restoring
    const current = sections.find((s) => s.key === key);
    if (current && current.content.trim()) {
      pushSectionHistory(key, current.content, "Avant restauration");
    }
    handleSectionContentChange(key, content);
    toast.success("Version restaurée");
  }, [sections, pushSectionHistory, handleSectionContentChange]);

  const handleRegenerateSection = useCallback(async (sectionKey: string) => {
    // Save current content to history before regeneration
    const currentSection = sections.find((s) => s.key === sectionKey);
    if (currentSection && currentSection.content.trim()) {
      pushSectionHistory(sectionKey, currentSection.content, "Avant régénération");
    }

    setRegeneratingSection(sectionKey);
    try {
      if (!currentSection) return;

      const otherSections = sections
        .filter((s) => s.key !== sectionKey)
        .map((s) => ({ key: s.key, label: s.label, content: s.content }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/regenerate-section`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            sectionKey,
            sectionLabel: currentSection.label,
            currentContent: currentSection.content,
            otherSections,
            language: scriptLanguage,
            narrativeStyle: narrativeStyleId,
            sourceText: extractedText?.slice(0, 10000) || "",
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      const data = await response.json();
      if (data.content) {
        handleSectionContentChange(sectionKey, data.content);
        toast.success(`Section "${currentSection.label}" régénérée`);

        // Apply transition fixes from NarrativeEngine coherence check
        if (data.transitionFixes && Array.isArray(data.transitionFixes) && data.transitionFixes.length > 0) {
          for (const fix of data.transitionFixes) {
            // Save history before applying coherence fix
            const targetSection = sections.find((s) => s.key === fix.key);
            if (targetSection && targetSection.content.trim()) {
              pushSectionHistory(fix.key, targetSection.content, "Avant ajustement cohérence");
            }
            handleSectionContentChange(fix.key, fix.fixedContent);
          }
          toast.info(`${data.transitionFixes.length} transition(s) ajustée(s) pour la cohérence`, { duration: 4000 });
        }
      }
    } catch (e: any) {
      console.error("Section regeneration error:", e);
      toast.error(e?.message || "Erreur de régénération");
    } finally {
      setRegeneratingSection(null);
    }
  }, [sections, scriptLanguage, narrativeStyleId, extractedText, handleSectionContentChange, pushSectionHistory]);

  // Translate a section to French
  const handleTranslateSection = useCallback(async (sectionKey: string) => {
    const section = sections.find((s) => s.key === sectionKey);
    if (!section || !section.content.trim()) return;

    setTranslatingSections((prev) => new Set(prev).add(sectionKey));
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-section`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            sectionKey,
            sectionLabel: section.label,
            content: section.content,
            sourceLanguage: scriptLanguage,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      const data = await response.json();
      if (data.translated) {
        setSectionTranslations((prev) => {
          const next = { ...prev, [sectionKey]: data.translated };
          saveTranslations(next);
          return next;
        });
        toast.success(`Section "${section.label}" traduite en français`);
      }
    } catch (e: any) {
      console.error("Translation error:", e);
      toast.error(e?.message || "Erreur de traduction");
    } finally {
      setTranslatingSections((prev) => {
        const next = new Set(prev);
        next.delete(sectionKey);
        return next;
      });
    }
  }, [sections, scriptLanguage, saveTranslations]);


  const extractAndAnalyze = useCallback(async (pdfFile: File) => {
    setParsing(true);
    onExtractedTextChange(null);
    onAnalysisChange(null);
    onDocStructureChange(null);
    onScriptChange(null);
    let fullText = "";
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      onPageCountChange(pdf.numPages);
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push(text);
      }
      fullText = pages.join("\n\n");
      if (!fullText.trim()) { toast.error("Aucun texte détecté dans ce PDF."); setParsing(false); return; }
      onExtractedTextChange(fullText);
      toast.success(`${pdf.numPages} page(s) extraite(s)`);
    } catch (err) { console.error("PDF parse error:", err); toast.error("Erreur lors de la lecture du PDF"); setParsing(false); return; }
    setParsing(false);

    // Auto-chain: run analysis
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-pdf", { body: { text: fullText } });
      if (error) { toast.error("Erreur d'analyse"); console.error(error); setAnalyzing(false); return; }
      if (data?.error) { toast.error(data.error); setAnalyzing(false); return; }
      onAnalysisChange(data.analysis);
      onAnalysisReady?.(data.analysis, fullText);
      toast.success("Analyse narrative terminée");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setAnalyzing(false);
  }, [onAnalysisReady, onExtractedTextChange, onAnalysisChange, onDocStructureChange, onScriptChange, onPageCountChange]);

  // Analyze text only (no PDF extraction needed, e.g. from RsearchEngine)
  const runAnalyzeTextOnly = useCallback(async (text: string) => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-pdf", { body: { text } });
      if (error) { toast.error("Erreur d'analyse"); console.error(error); setAnalyzing(false); return; }
      if (data?.error) { toast.error(data.error); setAnalyzing(false); return; }
      onAnalysisChange(data.analysis);
      onAnalysisReady?.(data.analysis, text);
      toast.success("Analyse narrative terminée");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setAnalyzing(false);
  }, [onAnalysisReady, onAnalysisChange]);

  // Subscribe to background task progress for live streaming updates
  useEffect(() => {
    if (!projectId) return;
    const unsub = subscribe(projectId, "script", (task) => {
      if (task.streamedText !== undefined) {
        onScriptChange(task.streamedText);
      }
      if (task.status === "done" && task.streamedText) {
        const full = task.streamedText;
        onScriptChange(full);
        onScriptReady?.(full);
        // Add to versions with style info
        const versionStyle = narrativeStyleId === "custom" ? (customStyleLabel || "custom") : narrativeStyleId;
        onScriptVersionsChange((prev) => {
          if (prev.length > 0) {
            const nextId = Math.max(...prev.map((v) => v.id)) + 1;
            onCurrentVersionIdChange(nextId);
            return [...prev, { id: nextId, content: full, style: versionStyle }];
          }
          onCurrentVersionIdChange(1);
          return [{ id: 1, content: full, style: versionStyle }];
        });
        // Auto-trigger AI analysis after generation
        handleAnalyzeScript(full);
      }
    });
    return unsub;
  }, [projectId, subscribe, onScriptChange, onScriptReady, onScriptVersionsChange, onCurrentVersionIdChange, handleAnalyzeScript]);

  // Delegate script generation to background context
  const runFullScriptGeneration = useCallback(async (isRegenerate = false) => {
    if (!analysis || !extractedText || !projectId) return;
    setScriptOpen(true);
    onScriptChange("");

    // Save existing script as version before regeneration
    if (isRegenerate && script && script.trim() !== "") {
      onScriptVersionsChange((prev) => {
        if (prev.length === 0) return [{ id: 1, content: script! }];
        return prev;
      });
    }

    startScriptGeneration({
      projectId,
      analysis,
      extractedText,
      scriptLanguage,
      targetChars,
      narrativeStyle: narrativeStyleId === "custom" ? customStyleLabel || "documentary" : narrativeStyleId,
      existingScript: script,
      isRegenerate,
    });
  }, [analysis, extractedText, scriptLanguage, script, targetChars, narrativeStyleId, customStyleLabel, projectId, startScriptGeneration, onScriptChange, onScriptVersionsChange]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") {
      setFile(dropped);
      onFileNameChange(dropped.name);
      onExtractedTextChange(null);
      onAnalysisChange(null);
      onDocStructureChange(null);
      onScriptChange(null);
      onScriptVersionsChange([]);
      onCurrentVersionIdChange(null);
      setShowVersionPreviewId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") {
      setFile(selected);
      onFileNameChange(selected.name);
      onExtractedTextChange(null);
      onAnalysisChange(null);
      onDocStructureChange(null);
      onScriptChange(null);
      onScriptVersionsChange([]);
      onCurrentVersionIdChange(null);
      setShowVersionPreviewId(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    onFileNameChange(null);
    onExtractedTextChange(null);
    onAnalysisChange(null);
    onDocStructureChange(null);
    onScriptChange(null);
    onPageCountChange(0);
    onScriptVersionsChange([]);
    onCurrentVersionIdChange(null);
    setShowVersionPreviewId(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const cleanScriptForExport = (raw: string): string => {
    const sectionHeadingRegex = /^(HOOK|WELCOME(?:\s+TO\s+.+)?|BIENVENUE(?:\s+SUR\s+.+)?|INTRODUCTION(?:\s+DU\s+MYST[ÈE]RE|\s+OF\s+THE\s+MYSTERY)?|PRESENTATION\s+OF\s+THE\s+MYSTERY|MYST[ÈE]RE|MYSTERY|CONTEXTE|CONTEXT(?:\s+SETTING)?|ACT(?:E)?\s*(?:\d+|[IVXLCDM]+)|CHAP(?:ITRE|TER)\s*\d+|PART(?:IE)?\s*\d+|D[ÉE]COUVERTE|DISCOVERY|INVESTIGATION|ESCALADE|ESCALATION|CLIMAX|R[ÉE]V[ÉE]LATION|REVELATION|CONCLUSION)\b/i;

    return raw
      // Strip all [[TAG]] markers (e.g. [[HOOK]], [[PROMISE]], [[ACT1]], etc.)
      .replace(/\[\[(HOOK|CONTEXT|PROMISE|ACT[123]B?|CLIMAX|INSIGHT|CONCLUSION|TRANSITIONS|STYLE\s*CHECK|RISK\s*CHECK)\]\]\s*/gi, "")
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (t === "") return true; // preserve blank lines (paragraph spacing)
        if (t.startsWith("---") || t.startsWith("#")) return false;
        if (/^\*\*.*\*\*$/.test(t)) return false;

        const normalized = t
          .replace(/^[\s\-–—*#\[\](){}|:]+/, "")
          .replace(/[\s\-–—*#\[\](){}|:]+$/, "")
          .trim();

        if (sectionHeadingRegex.test(normalized)) return false;
        return true;
      })
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n") // collapse multiple blank lines to one
      .trim();
  };

  const splitIntoVoiceOverBlocks = (raw: string): string[] => {
    const clean = cleanScriptForExport(raw);
    const sentences = clean.split(/(?<=\.)\s+/);
    const blocks: string[] = [];
    let currentBlock = "";

    for (const sentence of sentences) {
      const candidate = currentBlock ? currentBlock + " " + sentence : sentence;
      if (candidate.length > 8300 && currentBlock.length > 0) {
        blocks.push(currentBlock.trim());
        currentBlock = sentence;
      } else {
        currentBlock = candidate;
      }
    }
    if (currentBlock.trim()) blocks.push(currentBlock.trim());
    return blocks;
  };

  const exportVoiceOverBlocks = () => {
    if (!script) return;
    const blocks = splitIntoVoiceOverBlocks(script);
    const output = blocks.map((block, i) => `Voice Over Block ${i + 1} (${block.length} chars)\n\n${block}`).join("\n\n---\n\n");
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "voice_over_blocks.md"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${blocks.length} bloc(s) Voice Over exporté(s)`);
  };

  const copyScriptToClipboard = () => {
    if (!script) return;
    const clean = cleanScriptForExport(script);
    navigator.clipboard.writeText(clean).then(() => {
      toast.success("Script copié dans le presse-papiers");
    }).catch(() => {
      toast.error("Impossible de copier");
    });
  };

  const hasResults = !!(analysis || (script !== null && script !== ""));

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        Aide à la génération de script narratif
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Importez un dossier de recherche PDF pour générer un script documentaire complet.
      </p>

      <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileChange} className="hidden" />

      {/* Persistent PDF pill — shown when we have results */}
      {hasResults && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{fileName || "Document PDF"}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {pageCount > 0 && <span>{pageCount} p.</span>}
                  {pageCount > 0 && extractedText && <span>·</span>}
                  {extractedText && <span>{extractedText.length.toLocaleString()} car.</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {analysis && (
                <button
                  onClick={() => setAnalysisOpen(!analysisOpen)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Analyse
                </button>
              )}
              {script !== null && script !== "" && (
                <button
                  onClick={() => setScriptOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <ScrollText className="h-3 w-3" />
                  Script
                  <span className="text-[10px] text-primary/60">{script.length.toLocaleString()} car.</span>
                </button>
              )}
              <button onClick={removeFile} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Retirer le document">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload zone — hidden once text is extracted */}
      {!extractedText && !hasResults && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !file && inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 sm:gap-4 rounded-lg border-2 border-dashed p-6 sm:p-12 transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : file ? "border-border bg-card cursor-default" : "border-border hover:border-primary/50 hover:bg-secondary/30"
          }`}
        >
          {file ? (
            <div className="flex items-center gap-3 w-full">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0"><FileText className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} Mo</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeFile(); }} className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center h-14 w-14 rounded-full bg-secondary"><Upload className="h-6 w-6 text-muted-foreground" /></div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Glissez votre PDF ici ou cliquez pour parcourir</p>
                <p className="text-xs text-muted-foreground mt-1">PDF uniquement — 20 Mo max</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Compact file info — shown during extraction (before pill appears) */}
      {extractedText && !hasResults && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[150px] font-medium text-foreground text-[11px]">{file?.name || fileName}</span>
          <span>·</span>
          <span>{pageCount} p.</span>
          <span>·</span>
          <span>{extractedText.length.toLocaleString()} car.</span>
          <button onClick={removeFile} className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Analysis results — collapsible (shown above script generation controls) */}
      {analysis && (
        <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen} className="mt-6">
          <CollapsibleTrigger className="w-full rounded-lg border border-border bg-card p-4 sm:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Analyse narrative</h3>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${analysisOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 animate-fade-in">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Mystère central</h3></div>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis.central_mystery}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Contradiction principale</h3></div>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis.main_contradiction}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Découvertes intrigantes</h3></div>
              <ul className="space-y-2">
                {analysis.intriguing_discoveries.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed"><span className="text-primary font-medium shrink-0">{i + 1}.</span>{d}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><Swords className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Tensions narratives</h3></div>
              <div className="space-y-3">
                {analysis.narrative_tensions.map((t, i) => (
                  <div key={i} className="group rounded border border-border bg-background p-3 relative">
                    <button
                      onClick={() => {
                        const updated = { ...analysis, narrative_tensions: analysis.narrative_tensions.filter((_, idx) => idx !== i) };
                        onAnalysisChange(updated);
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded hover:bg-destructive/10"
                      title="Retirer cette tension"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <p className="text-sm font-medium text-foreground mb-1 pr-6">{t.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                  </div>
                ))}
              </div>
              <Button
                variant="hero"
                size="sm"
                onClick={async () => {
                  if (!extractedText || findingTension) return;
                  setFindingTension(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("find-tension", {
                      body: {
                        text: extractedText.slice(0, 12000),
                        existing_tensions: analysis.narrative_tensions.slice(0, 20),
                      },
                    });

                    if (error || data?.error) {
                      toast.error(data?.error || "Erreur lors de la recherche");
                      console.error(error || data?.error);
                    } else if (data?.tension) {
                      const updated = { ...analysis, narrative_tensions: [...analysis.narrative_tensions, data.tension] };
                      onAnalysisChange(updated);
                      toast.success("Nouvelle tension ajoutée");
                    }
                  } catch (e) {
                    console.error(e);
                    toast.error("Erreur inattendue");
                  }
                  setFindingTension(false);
                }}
                disabled={findingTension || !extractedText}
                className="mt-3 w-full h-8 text-xs"
              >
                {findingTension ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Recherche dans le document…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Trouver une nouvelle tension</>
                )}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        {!extractedText && !analyzing && !hasResults && (
          <Button variant="hero" disabled={!file || !projectId || parsing} onClick={() => file && extractAndAnalyze(file)} className="min-h-[44px]">
            {parsing ? <><Loader2 className="h-4 w-4 animate-spin" /> Extraction en cours...</> : <><Sparkles className="h-4 w-4" /> Analyser le document</>}
          </Button>
        )}
        {extractedText && !analysis && !analyzing && !hasResults && !file && (
          <Button variant="hero" disabled={!projectId} onClick={() => runAnalyzeTextOnly(extractedText)} className="min-h-[44px]">
            <Sparkles className="h-4 w-4" /> Lancer l'analyse
          </Button>
        )}
        {analysis && !script && !generatingScript && (
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Langue :</label>
              <select
                value={scriptLanguage}
                onChange={(e) => onLanguageChange?.(e.target.value)}
                className="h-9 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Style :</label>
              <select
                value={narrativeStyleId}
                onChange={(e) => { setNarrativeStyleId(e.target.value); if (e.target.value !== "custom") setCustomStyleLabel(""); }}
                className="h-9 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {NARRATIVE_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                <option value="custom">+ Style personnalisé</option>
              </select>
            </div>
            {narrativeStyleId === "custom" && (
              <input
                type="text"
                placeholder="Ex: Poétique, Satirique…"
                value={customStyleLabel}
                onChange={(e) => setCustomStyleLabel(e.target.value)}
                className="h-9 w-44 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Objectif :</label>
              <input
                type="number"
                min={5000}
                max={30000}
                step={1000}
                value={targetChars}
                onChange={(e) => setTargetChars(Number(e.target.value))}
                className="h-9 w-24 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground">car. (±10%)</span>
            </div>
            <Button variant="hero" disabled={generatingScript} onClick={() => runFullScriptGeneration()} className="min-h-[44px]">
              {generatingScript ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération en cours...</> : <><ScrollText className="h-4 w-4" /> Créer le script narratif</>}
            </Button>
          </div>
        )}
      </div>

      {/* Generation loading — shown before script arrives */}
      {generatingScript && !script && (
        <div className="mt-6 flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Génération de la structure et du script…</p>
        </div>
      )}

      {/* Script narratif — modular block */}
      <NarrativeScriptBlock
        script={script}
        generatingScript={generatingScript}
        sections={sections}
        scriptVersions={scriptVersions}
        currentVersionId={currentVersionId}
        sectionHistory={sectionHistory}
        sectionTranslations={sectionTranslations}
        translatingSections={translatingSections}
        regeneratingSection={regeneratingSection}
        openSections={openSections}
        scriptLanguage={scriptLanguage}
        isOpen={scriptOpen}
        onToggleOpen={setScriptOpen}
        onSectionToggle={(key) => {
          setOpenSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          });
        }}
        onSectionContentChange={handleSectionContentChange}
        onRegenerateSection={handleRegenerateSection}
        onRestoreSection={handleRestoreSection}
        onTranslateSection={handleTranslateSection}
        onCopyScript={copyScriptToClipboard}
        onSendToNarration={() => {
          if (script) {
            const clean = cleanScriptForExport(script);
            onSendToNarration?.(clean);
            toast.success("Script envoyé dans ScriptInput");
          }
        }}
        onScriptVersionRestore={(version) => {
          onScriptChange(version.content);
          onCurrentVersionIdChange(version.id);
          setShowVersionPreviewId(null);
          toast.success(`Version V${version.id} restaurée`);
        }}
        onVersionPreviewToggle={setShowVersionPreviewId}
        showVersionPreviewId={showVersionPreviewId}
        onRegenerate={() => runFullScriptGeneration(true)}
        canRegenerate={!generatingScript}
        analyzingScript={analyzingScript}
        onAnalyzeScript={() => handleAnalyzeScript()}
        toolbarSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={scriptLanguage}
              onChange={(e) => onLanguageChange?.(e.target.value)}
              className="h-8 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <select
              value={narrativeStyleId}
              onChange={(e) => { setNarrativeStyleId(e.target.value); if (e.target.value !== "custom") setCustomStyleLabel(""); }}
              className="h-8 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {NARRATIVE_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              <option value="custom">+ Personnalisé</option>
            </select>
            {narrativeStyleId === "custom" && (
              <input
                type="text"
                placeholder="Style personnalisé…"
                value={customStyleLabel}
                onChange={(e) => setCustomStyleLabel(e.target.value)}
                className="h-8 w-36 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <input
              type="number"
              min={5000}
              max={30000}
              step={1000}
              value={targetChars}
              onChange={(e) => setTargetChars(Number(e.target.value))}
              className="h-8 w-20 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground">car. (±10%)</span>
          </div>
        }
      />

      {/* Chapitres de la vidéo */}
      <div className="mt-6">
        <ChapterCollapse
          scriptSections={sections}
          narration={narration}
          chapterState={chapterState}
          onChapterStateChange={setChapterState}
          scriptLanguage={scriptLanguage}
          shots={shots}
          scenesForShotOrder={scenesForShotOrder}
        />
      </div>

      {/* ScriptInput — collapsible */}
      <Collapsible className="mt-6">
        <CollapsibleTrigger className="w-full rounded-lg border border-border bg-card p-4 sm:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">ScriptInput</h3>
            {narration.trim() && (
              <span className="text-xs text-muted-foreground">
                {narration.length.toLocaleString()} car.
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 animate-fade-in">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <p className="text-sm text-muted-foreground mb-4">Collez ou saisissez votre narration ci-dessous, puis lancez la segmentation.</p>
            <div className="mb-4 flex flex-col sm:flex-row gap-3">
              <Button variant="hero" onClick={onRunSegmentation} disabled={!narration.trim() || segmenting} className="min-h-[44px]">
                {segmenting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {segmenting ? "Segmentation..." : "Lancer la segmentation"}
              </Button>
              {segmenting && (
                <Button variant="destructive" onClick={onStopSegmentation} className="min-h-[44px]">
                  <Square className="h-4 w-4" /> Stopper
                </Button>
              )}
            </div>
            <textarea value={narration} onChange={(e) => onNarrationChange(e.target.value)}
              placeholder="Collez votre voix-off ici..."
              className="w-full min-h-[200px] sm:min-h-[300px] rounded border border-border bg-background p-3 sm:p-4 text-foreground text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 font-body" />
            <div className="mt-1.5 text-xs text-muted-foreground text-right">
              {narration.length.toLocaleString()} caractères
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

    </div>
  );
}
