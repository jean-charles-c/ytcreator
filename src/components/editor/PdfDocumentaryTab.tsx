import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Swords, ScrollText, Download, ArrowRight, ChevronDown, Copy, Mic, Plus, Trash2, RotateCcw, Play, Square, Pencil, MoreVertical, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBackgroundTasks } from "@/contexts/BackgroundTasks";
import { NARRATIVE_STYLES, DEFAULT_NARRATIVE_STYLE_ID, getNarrativeStyleById } from "@/config/narrativeStyles";
import { NARRATIVE_FORMS, DEFAULT_NARRATIVE_FORM_ID } from "@/config/narrativeForms";
import { useCustomNarrativeForms, type CustomNarrativeForm } from "@/hooks/useCustomNarrativeForms";
import CustomFormCard from "./narrativeWorkflow/CustomFormCard";
import { parseScriptIntoSections, reassembleSections, sanitizeNarrativeSections, type NarrativeSection, type SectionHistoryEntry } from "./SectionCard";
import NarrativeScriptBlock, { type ScriptVersion, getPersistedScriptAiModel, persistScriptAiModel, type ScriptAiModelId } from "./NarrativeScriptBlock";
import ChapterCollapse from "./ChapterCollapse";
import type { ChapterListState } from "./chapterTypes";
import * as pdfjsLib from "pdfjs-dist";
import { applyFrenchTypography } from "./frenchTypography";

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
  const { startScriptGeneration, startScriptGenerationV2, triggerRevision, getTask, subscribe, stopTask } = useBackgroundTasks();
  const [chapterState, setChapterState] = useState<ChapterListState | null>(null);
  const chapterSaveTimeoutRef = useRef<number | null>(null);
  const chapterHydratedRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [charMin, setCharMin] = useState(8000);
  const [charMax, setCharMax] = useState(18000);
  const [narrativeStyleId, setNarrativeStyleId] = useState(DEFAULT_NARRATIVE_STYLE_ID);
  const [customStyleLabel, setCustomStyleLabel] = useState("");
  const [parsing, setParsing] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [analyzingScript, setAnalyzingScript] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [findingTension, setFindingTension] = useState(false);
  const [humanizing, setHumanizing] = useState(false);
  const [voOptimizing, setVoOptimizing] = useState(false);
  const [shortSentencePct, setShortSentencePct] = useState<number>(() => {
    try { const v = localStorage.getItem("script-short-sentence-pct"); return v ? Number(v) : 0; } catch { return 0; }
  });
  const [scriptAiModel, setScriptAiModel] = useState<ScriptAiModelId>(getPersistedScriptAiModel);
  const [showVersionPreviewId, setShowVersionPreviewId] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  const [sections, setSections] = useState<NarrativeSection[]>(() => parseScriptIntoSections(script || ""));
  const [sectionHistory, setSectionHistory] = useState<Record<string, SectionHistoryEntry[]>>({});
  const [sectionTranslations, setSectionTranslations] = useState<Record<string, string>>({});
  const [translatingSections, setTranslatingSections] = useState<Set<string>>(new Set());
  const translationsHydratedRef = useRef(false);
  const sectionsInitRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── ScriptCreator v2 ──────────────────────────────────────────────
  const [v2Enabled, setV2Enabled] = useState(() => {
    try { return localStorage.getItem("sc-v2-enabled") === "true"; } catch { return false; }
  });
  const [selectedForm, setSelectedForm] = useState(DEFAULT_NARRATIVE_FORM_ID);
  const [detectedForm, setDetectedForm] = useState<string | null>(null);
  const [alternativeForm, setAlternativeForm] = useState<string | null>(null);
  const [formReasoning, setFormReasoning] = useState("");
  const [detectingForm, setDetectingForm] = useState(false);
  const [v2IntentionNote, setV2IntentionNote] = useState("");
  const [scriptV2, setScriptV2] = useState<string | null>(null);
  const [scriptV2Revised, setScriptV2Revised] = useState<string | null>(null);
  const [showV2Revised, setShowV2Revised] = useState(false);

  // Étape 9 — formes narratives personnalisées
  const {
    forms: customForms,
    loading: loadingCustomForms,
    updateForm: updateCustomForm,
    deleteForm: deleteCustomForm,
  } = useCustomNarrativeForms();

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

  // ── Hydrate v2 states from DB on mount ──
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("project_scriptcreator_state")
        .select("script_v2_raw, script_v2_revised, intention_note, narrative_form")
        .eq("project_id", projectId)
        .maybeSingle();
      if (!data) return;
      if (data.script_v2_raw)     setScriptV2(data.script_v2_raw);
      if (data.script_v2_revised) setScriptV2Revised(data.script_v2_revised);
      if (data.intention_note)    setV2IntentionNote(data.intention_note);
      if (data.narrative_form)    setSelectedForm(data.narrative_form);
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

  // ── Active v2 script (revised takes priority) ──
  const activeV2Script = scriptV2Revised || scriptV2 || null;


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
          setSections(parseScriptIntoSections(scriptStr));
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
          outro: { label: "Outro — Engagement", icon: "💬" },
          end_screen: { label: "End Screen — CTAs", icon: "📺" },
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

  // Humanize the full script via GPT-5
  const handleHumanize = useCallback(async (scriptToHumanize?: string) => {
    const inputScript = scriptToHumanize || script;
    if (!inputScript || inputScript.trim().length < 100) {
      toast.error("Script trop court pour être humanisé");
      return;
    }
    setHumanizing(true);
    toast.info("Humanisation du script en cours…");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/humanize-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ script: inputScript, language: scriptLanguage, model: scriptAiModel }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) result += content;
          } catch { /* partial chunk */ }
        }
      }

      if (!result.trim()) throw new Error("Empty humanized result");

      // Apply French typography
      const humanized = applyFrenchTypography(result.trim());

      // Update script
      onScriptChange(humanized);

      // Save as new version
      const versionStyle = narrativeStyleId === "custom" ? (customStyleLabel || "custom") : narrativeStyleId;
      onScriptVersionsChange((prev) => {
        const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
        onCurrentVersionIdChange(nextId);
        return [...prev, { id: nextId, content: humanized, style: `${versionStyle} · Humanisée` }];
      });

      toast.success("Script humanisé et sauvegardé comme nouvelle version");
    } catch (e: any) {
      console.error("Humanize error:", e);
      toast.error(e?.message || "Erreur lors de l'humanisation");
    } finally {
      setHumanizing(false);
    }
  }, [script, scriptLanguage, scriptAiModel, narrativeStyleId, customStyleLabel, onScriptChange, onScriptVersionsChange, onCurrentVersionIdChange]);

  // VO Optimize — rewrite the FULL script globally for deep coherent rewriting, then reconstitute sections
  const handleVoOptimize = useCallback(async () => {
    // Build tagged script from core sections
    const SECTION_TAG_MAP: Record<string, string> = {
      hook: "[[HOOK]]", context: "[[CONTEXT]]", promise: "[[PROMISE]]",
      act1: "[[ACT1]]", act2: "[[ACT2]]", act2b: "[[ACT2B]]",
      act3: "[[ACT3]]", climax: "[[CLIMAX]]", insight: "[[INSIGHT]]",
      conclusion: "[[CONCLUSION]]", outro: "[[OUTRO]]", end_screen: "[[END_SCREEN]]",
    };
    const coreSections = sections.filter(
      (s) => !["transitions", "style_check", "risk_check"].includes(s.key) && s.content.trim().length > 10
    );
    if (coreSections.length === 0) {
      toast.error("Aucune section narrative à optimiser");
      return;
    }

    // Assemble full tagged script
    const taggedScript = coreSections
      .map((s) => `${SECTION_TAG_MAP[s.key] || `[[${s.key.toUpperCase()}]]`}\n${s.content}`)
      .join("\n\n");

    setVoOptimizing(true);
    toast.info("Optimisation voix-off globale en cours…");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vo-optimize-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ script: taggedScript, language: scriptLanguage, model: scriptAiModel, shortSentencePct }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      // Read SSE stream and accumulate full text
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = sseBuffer.indexOf("\n")) !== -1) {
          let line = sseBuffer.slice(0, newlineIdx);
          sseBuffer = sseBuffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") fullText += delta;
          } catch { /* partial chunk */ }
        }
      }

      if (!fullText.trim()) throw new Error("Réponse vide de l'IA");

      // Apply French typography
      fullText = applyFrenchTypography(fullText.trim());

      // Parse the tagged response back into sections
      const tagKeys = Object.entries(SECTION_TAG_MAP);
      const updatedSections = new Map<string, string>();

      for (let i = 0; i < tagKeys.length; i++) {
        const [key, tag] = tagKeys[i];
        const tagIdx = fullText.indexOf(tag);
        if (tagIdx === -1) continue;
        const contentStart = tagIdx + tag.length;
        // Find the next tag
        let contentEnd = fullText.length;
        for (let j = i + 1; j < tagKeys.length; j++) {
          const nextIdx = fullText.indexOf(tagKeys[j][1], contentStart);
          if (nextIdx !== -1) { contentEnd = nextIdx; break; }
        }
        const sectionContent = fullText.slice(contentStart, contentEnd).trim();
        if (sectionContent) {
          updatedSections.set(key, sectionContent);
          handleSectionContentChange(key, sectionContent);
        }
      }

      if (updatedSections.size === 0) {
        // Fallback: if no tags found, treat as single block update
        console.warn("No section tags found in VO response, applying as full script");
        onScriptChange(fullText);
      } else {
        // Rebuild full script from updated sections
        const finalSections = sections.map((s) => ({
          ...s,
          content: updatedSections.get(s.key) || s.content,
        }));
        const optimized = reassembleSections(finalSections);
        onScriptChange(optimized);
      }

      const versionStyle = narrativeStyleId === "custom" ? (customStyleLabel || "custom") : narrativeStyleId;
      onScriptVersionsChange((prev) => {
        const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
        onCurrentVersionIdChange(nextId);
        const finalScript = updatedSections.size > 0
          ? reassembleSections(sections.map((s) => ({ ...s, content: updatedSections.get(s.key) || s.content })))
          : fullText;
        return [...prev, { id: nextId, content: finalScript, style: `${versionStyle} · VO optimisée` }];
      });

      toast.success(`Script VO optimisé (${updatedSections.size || 1} sections réécrites)`);
    } catch (e: any) {
      console.error("VO optimize error:", e);
      toast.error(e?.message || "Erreur lors de l'optimisation VO");
    } finally {
      setVoOptimizing(false);
    }
  }, [sections, scriptLanguage, scriptAiModel, narrativeStyleId, customStyleLabel, onScriptChange, onScriptVersionsChange, onCurrentVersionIdChange, handleSectionContentChange]);

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
        // Humanization is manual only — triggered via the "Humaniser" button
      }
    });
    return unsub;
  }, [projectId, subscribe, onScriptChange, onScriptReady, onScriptVersionsChange, onCurrentVersionIdChange, handleAnalyzeScript]);

  // ── v2 derived state ──────────────────────────────────────────────
  const bgScriptV2Task = projectId ? getTask(projectId, "script-v2") : undefined;
  const generatingScriptV2 = bgScriptV2Task?.status === "running";
  const bgRevisionTask = projectId ? getTask(projectId, "revision") : undefined;
  const revising = bgRevisionTask?.status === "running";

  // ── v2 subscriptions ─────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    const unsub = subscribe(projectId, "script-v2", (task) => {
      if (task.streamedText !== undefined) setScriptV2(task.streamedText);
      if (task.intentionNote !== undefined) setV2IntentionNote(task.intentionNote || "");
    });
    return unsub;
  }, [projectId, subscribe]);

  useEffect(() => {
    if (!projectId) return;
    const unsub = subscribe(projectId, "revision", (task) => {
      if (task.streamedText !== undefined) setScriptV2Revised(task.streamedText);
      if (task.status === "done") setShowV2Revised(true);
    });
    return unsub;
  }, [projectId, subscribe]);

  // ── Auto-detect narrative form when analysis arrives ─────────────
  useEffect(() => {
    if (!analysis || !v2Enabled || detectedForm || detectingForm) return;
    setDetectingForm(true);
    const session_promise = supabase.auth.getSession();
    session_promise.then(({ data: { session } }) => {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-narrative-form`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ analysis }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.form) {
            setDetectedForm(data.form);
            setAlternativeForm(data.alternative ?? null);
            setFormReasoning(data.reasoning ?? "");
            setSelectedForm(data.form);
          }
        })
        .catch(console.warn)
        .finally(() => setDetectingForm(false));
    });
  }, [analysis, v2Enabled, detectedForm, detectingForm]);

  // ── v2 generation function ────────────────────────────────────────
  const runFullScriptGenerationV2 = useCallback(() => {
    if (!analysis || !extractedText || !projectId) return;
    const styleVoice = getNarrativeStyleById(narrativeStyleId)?.voice ?? "";
    setV2IntentionNote("");
    setScriptV2("");
    setScriptV2Revised(null);
    setShowV2Revised(false);
    const customForm = customForms.find((f) => f.id === selectedForm);
    startScriptGenerationV2({
      projectId,
      analysis,
      extractedText,
      scriptLanguage,
      charMin,
      charMax,
      narrativeForm: customForm ? "custom" : selectedForm,
      narrativeFormPrompt: customForm?.system_prompt,
      narrativeFormId: selectedForm,
      narrativeStyleVoice: narrativeStyleId === "custom" ? customStyleLabel : styleVoice,
      onIntentionNote: (note) => setV2IntentionNote(note),
    });
  }, [analysis, extractedText, projectId, scriptLanguage, charMin, charMax, selectedForm, narrativeStyleId, customStyleLabel, startScriptGenerationV2, customForms]);

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
      charMin,
      charMax,
      narrativeStyle: narrativeStyleId === "custom" ? customStyleLabel || "documentary" : narrativeStyleId,
      existingScript: script,
      isRegenerate,
      shortSentencePct,
    });
  }, [analysis, extractedText, scriptLanguage, script, charMin, charMax, narrativeStyleId, customStyleLabel, projectId, startScriptGeneration, onScriptChange, onScriptVersionsChange, shortSentencePct]);

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

    // First: strip everything from [[TRANSITIONS]] onward (editorial blocks)
    const withoutEditorial = raw.replace(/\[\[\s*(TRANSITIONS|STYLE\s*CHECK|RISK\s*CHECK)\s*\]\][\s\S]*/i, "").trim();

    const cleaned = withoutEditorial
      // Strip remaining [[TAG]] markers (core blocks)
      .replace(/\[\[(HOOK|CONTEXT|PROMISE|ACT[123]B?|CLIMAX|INSIGHT|CONCLUSION)\]\]\s*/gi, "")
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
    return applyFrenchTypography(cleaned);
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
              <label className="text-xs text-muted-foreground whitespace-nowrap">Min :</label>
              <input
                type="number"
                min={3000}
                max={25000}
                step={1000}
                value={charMin}
                onChange={(e) => setCharMin(Number(e.target.value))}
                className="h-9 w-20 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <label className="text-xs text-muted-foreground whitespace-nowrap">Max :</label>
              <input
                type="number"
                min={5000}
                max={30000}
                step={1000}
                value={charMax}
                onChange={(e) => setCharMax(Number(e.target.value))}
                className="h-9 w-20 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground">car.</span>
            </div>
            <Button variant="hero" disabled={generatingScript} onClick={() => runFullScriptGeneration()} className="min-h-[44px]">
              {generatingScript ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération en cours...</> : <><ScrollText className="h-4 w-4" /> Créer le script narratif</>}
            </Button>
          </div>
        )}

        {/* v2 toggle */}
        {analysis && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={v2Enabled}
              onClick={() => {
                const next = !v2Enabled;
                setV2Enabled(next);
                try { localStorage.setItem("sc-v2-enabled", String(next)); } catch {}
              }}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${v2Enabled ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${v2Enabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <span className="text-xs text-muted-foreground">
              ScriptCreator v2{" "}
              <span className="inline-block text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">beta</span>
            </span>
            {v2Enabled && <span className="text-[10px] text-muted-foreground">— prose continue, sans blocs structurés</span>}
          </div>
        )}

        {/* v2 form selector + generate button */}
        {analysis && v2Enabled && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Forme narrative</span>
              {detectingForm && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {NARRATIVE_FORMS.map((form) => {
                const isDetected = form.id === detectedForm;
                const isAlt = form.id === alternativeForm;
                const isSelected = form.id === selectedForm;
                return (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => setSelectedForm(form.id)}
                    title={isDetected && formReasoning ? formReasoning : form.description}
                    className={`relative rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/50 hover:bg-secondary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs font-semibold text-foreground">{form.label}</span>
                      {isDetected && (
                        <span className="text-[9px] bg-primary text-primary-foreground px-1 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Suggéré</span>
                      )}
                      {!isDetected && isAlt && (
                        <span className="text-[9px] bg-secondary text-muted-foreground px-1 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Alt.</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{form.description}</p>
                  </button>
                );
              })}
              {customForms.map((form) => (
                <CustomFormCard
                  key={form.id}
                  form={form}
                  isSelected={form.id === selectedForm}
                  onSelect={() => setSelectedForm(form.id)}
                  onUpdate={updateCustomForm}
                  onDelete={async (id) => {
                    await deleteCustomForm(id);
                    if (selectedForm === id) setSelectedForm(DEFAULT_NARRATIVE_FORM_ID);
                  }}
                />
              ))}
            </div>
            {customForms.length === 0 && !loadingCustomForms && (
              <p className="text-[10px] text-muted-foreground -mt-2 mb-3">
                Astuce : crée une forme personnalisée depuis le Narrative Form Generator pour
                la retrouver ici aux côtés d'Enquête, Essai…
              </p>
            )}
            <Button
              variant="hero"
              disabled={generatingScriptV2}
              onClick={runFullScriptGenerationV2}
              className="min-h-[44px] w-full"
            >
              {generatingScriptV2
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération v2 en cours…</>
                : <><Sparkles className="h-4 w-4" /> Créer le script v2</>
              }
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
          // Use sections (source of truth for edited text) instead of script prop which may be stale
          const reassembled = reassembleSections(sections);
          if (reassembled.trim()) {
            const clean = cleanScriptForExport(reassembled);
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
        canRegenerate={!generatingScript && !humanizing && !voOptimizing}
        onHumanize={() => handleHumanize()}
        humanizing={humanizing}
        onVoOptimize={handleVoOptimize}
        voOptimizing={voOptimizing}
        analyzingScript={analyzingScript}
        onAnalyzeScript={() => handleAnalyzeScript()}
        scriptAiModel={scriptAiModel}
        onScriptAiModelChange={(m) => { setScriptAiModel(m); persistScriptAiModel(m); }}
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
              min={3000}
              max={25000}
              step={1000}
              value={charMin}
              onChange={(e) => setCharMin(Number(e.target.value))}
              className="h-8 w-20 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Min caractères"
            />
            <span className="text-[10px] text-muted-foreground">/</span>
            <input
              type="number"
              min={5000}
              max={30000}
              step={1000}
              value={charMax}
              onChange={(e) => setCharMax(Number(e.target.value))}
              className="h-8 w-20 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Max caractères"
            />
            <span className="text-[10px] text-muted-foreground">car.</span>
            <div className="flex items-center gap-1.5 ml-2">
              <label className="text-[10px] text-muted-foreground whitespace-nowrap" title="Pourcentage de phrases courtes (2-6 mots). 0% = rédaction libre.">
                Phrases courtes
              </label>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={shortSentencePct}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setShortSentencePct(v);
                  try { localStorage.setItem("script-short-sentence-pct", String(v)); } catch {}
                }}
                className="w-20 h-4 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground tabular-nums w-8">
                {shortSentencePct === 0 ? "libre" : `${shortSentencePct}%`}
              </span>
            </div>
          </div>
        }
      />

      {/* ScriptCreator v2 — intention note + script + revision */}
      {v2Enabled && (generatingScriptV2 || scriptV2) && (
        <div className="mt-6 space-y-4">
          {/* Intention note */}
          {v2IntentionNote && (
            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Note d'intention</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{v2IntentionNote}</p>
            </div>
          )}

          {/* v2 script or generating indicator */}
          {(generatingScriptV2 || scriptV2) && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="w-full rounded-t-lg border border-border bg-card p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Script v2 — Premier jet</span>
                  {scriptV2 && <span className="text-xs text-muted-foreground">{scriptV2.length.toLocaleString()} car.</span>}
                  {generatingScriptV2 && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-b-lg border border-t-0 border-border bg-card p-4">
                  {scriptV2 && (
                    <>
                      <pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-body mb-4">{showV2Revised && scriptV2Revised ? scriptV2Revised : scriptV2}</pre>
                      <div className="flex items-center gap-3 flex-wrap">
                        {!revising && !scriptV2Revised && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (!projectId) return;
                              triggerRevision({ projectId, script: scriptV2, scriptLanguage });
                            }}
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Révision critique
                          </Button>
                        )}
                        {revising && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Révision en cours…
                          </div>
                        )}
                        {scriptV2Revised && (
                          <Button
                            variant={showV2Revised ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowV2Revised((v) => !v)}
                          >
                            {showV2Revised ? "Voir premier jet" : "Voir version révisée"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const text = showV2Revised && scriptV2Revised ? scriptV2Revised : scriptV2;
                            if (text) {
                              navigator.clipboard.writeText(text);
                              toast.success("Script v2 copié");
                            }
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copier
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const text = showV2Revised && scriptV2Revised ? scriptV2Revised : scriptV2;
                            if (text) onSendToNarration?.(text);
                          }}
                        >
                          <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                          Envoyer dans ScriptInput
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {/* Chapitres de la vidéo */}
      <div className="mt-6">
        <ChapterCollapse
          scriptSections={v2Enabled && activeV2Script ? undefined : sections}
          proseScript={v2Enabled && activeV2Script ? activeV2Script : undefined}
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
