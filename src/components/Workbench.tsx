"use client";

import { KeywordChipRow } from "@/components/KeywordChipRow";
import { LatexEditorPanel } from "@/components/LatexEditorPanel";
import { PdfReadyToast } from "@/components/PdfReadyToast";
import { stripResumePrefix } from "@/lib/latex/filenames";
import { guessHighlightTerm } from "@/lib/workbench/changeHighlight";
import Link from "next/link";
import { downloadExportPack } from "@/lib/workbench/exportPack";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  AggressiveCoverageTarget,
  AtsScore,
  CascadeStepResult,
  ChangeSummary,
  JdSuggestions,
  KeywordExtract,
  RoleFamily,
  Seniority,
  TailorMode,
  WorkArrangement,
} from "@/lib/types";
import {
  AGGRESSIVE_COVERAGE_OPTIONS,
  CASCADE_STEP_ORDER,
  MODE_LABELS,
  ROLE_LABELS,
  isSparseKeywordJd,
} from "@/lib/types";
import {
  DEFAULT_RESUME_TYPE,
  resumeTypeFromRoleFamily,
  resumeTypeLabel,
} from "@/lib/resume/resumeTypeShared";

type ResumeTypeInfo = { type: string; label: string; hasMaster: boolean };

const DEFAULT_CONTROLS = {
  mode: "middle_ground" as TailorMode,
  roleFamily: "other" as RoleFamily,
  location: "",
  seniority: "unspecified" as Seniority,
  workArrangement: "unspecified" as WorkArrangement,
  aggressiveCoverageTarget: 0.8 as AggressiveCoverageTarget,
  pinnedKeywords: [] as string[],
  forceInjectKeywords: [] as string[],
  resumeType: DEFAULT_RESUME_TYPE,
};

type ParseResponse = {
  ok: boolean;
  suggestions?: JdSuggestions;
  keywords?: KeywordExtract;
  jdText?: string;
  source?: "paste" | "url" | "paste+url";
  warning?: string | null;
  usedDemo?: boolean;
  error?: string;
};

type MetadataResultRow = {
  type: string;
  ok: boolean;
  usedDemo?: boolean;
  wrote?: boolean;
  summary?: string;
  master?: unknown;
  masterPath?: string | null;
  error?: string;
};

type MetadataResponse = {
  ok: boolean;
  summary?: string;
  demoMode?: boolean;
  results?: MetadataResultRow[];
  error?: string;
};

type StreamEvent =
  | { type: "meta"; demoMode?: boolean }
  | {
      type: "step_start";
      step: { id: CascadeStepResult["id"]; label: string; summary: string };
    }
  | { type: "step_done"; step: CascadeStepResult }
  | {
      type: "done";
      usedDemo?: boolean;
      pdfUrl?: string | null;
      pdfFilename?: string | null;
      texFilename?: string | null;
      texSource?: string | null;
      changeSummary?: ChangeSummary | null;
    }
  | { type: "error"; error: string };

function emptyCascadeSteps(): CascadeStepResult[] {
  return CASCADE_STEP_ORDER.map((s) => ({
    id: s.id,
    label: s.label,
    status: "pending" as const,
    summary: "Waiting…",
    data: null,
  }));
}

export function Workbench() {
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [controls, setControls] = useState(DEFAULT_CONTROLS);
  const [companyName, setCompanyName] = useState("");
  const [suggestions, setSuggestions] = useState<JdSuggestions | null>(null);
  const [keywords, setKeywords] = useState<KeywordExtract | null>(null);
  const [steps, setSteps] = useState<CascadeStepResult[] | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [texFilename, setTexFilename] = useState<string | null>(null);
  const [texSource, setTexSource] = useState("");
  const [cascadeDone, setCascadeDone] = useState(false);
  const [latexOpen, setLatexOpen] = useState(false);
  const [recompiling, setRecompiling] = useState(false);
  const [manualPageCount, setManualPageCount] = useState<number | null>(null);
  const [latexStatus, setLatexStatus] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState<ChangeSummary | null>(
    null,
  );
  const [metadataPreview, setMetadataPreview] = useState<unknown | null>(null);
  const [metadataResults, setMetadataResults] = useState<MetadataResultRow[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<
    "parse" | "tailor" | "metadata" | "revert" | "applying" | null
  >(null);
  const [applied, setApplied] = useState(false);
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] =
    useState<JdSuggestions | null>(null);
  const [parseBannerDismissed, setParseBannerDismissed] = useState(false);
  const [latexHighlightTerm, setLatexHighlightTerm] = useState<string | null>(
    null,
  );
  const [pdfToastOpen, setPdfToastOpen] = useState(false);
  const [pdfToastMessage, setPdfToastMessage] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [availableTypes, setAvailableTypes] = useState<ResumeTypeInfo[]>([]);

  const refreshResumeTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/resume-types");
      const data = (await res.json()) as {
        ok?: boolean;
        types?: ResumeTypeInfo[];
      };
      if (data.ok && Array.isArray(data.types)) {
        setAvailableTypes(data.types);
      }
    } catch {
      // Non-fatal: dropdown falls back to the default type.
    }
  }, []);

  useEffect(() => {
    void refreshResumeTypes();
  }, [refreshResumeTypes]);

  function applyControlsFromSuggestions(s: JdSuggestions) {
    setSuggestions(s);
    setCompanyName(s.company ?? "");
    // Deterministic roleFamily → resumeType, but only if that archetype exists.
    const detectedType = resumeTypeFromRoleFamily(s.roleFamily);
    const typeExists = availableTypes.some((t) => t.type === detectedType);
    setControls((prev) => ({
      ...prev,
      roleFamily: s.roleFamily,
      location: s.location || prev.location,
      seniority: s.seniority,
      workArrangement: s.workArrangement,
      resumeType: typeExists ? detectedType : prev.resumeType,
    }));
    setPendingSuggestions(null);
    setParseBannerDismissed(true);
  }

  function togglePinnedKeyword(term: string) {
    setControls((c) => {
      const lower = term.toLowerCase();
      const has = c.pinnedKeywords.some((t) => t.toLowerCase() === lower);
      return {
        ...c,
        pinnedKeywords: has
          ? c.pinnedKeywords.filter((t) => t.toLowerCase() !== lower)
          : [...c.pinnedKeywords, term],
      };
    });
  }

  function toggleForceInjectKeyword(term: string) {
    setControls((c) => {
      const lower = term.toLowerCase();
      const has = c.forceInjectKeywords.some((t) => t.toLowerCase() === lower);
      return {
        ...c,
        forceInjectKeywords: has
          ? c.forceInjectKeywords.filter((t) => t.toLowerCase() !== lower)
          : [...c.forceInjectKeywords, term],
      };
    });
  }

  async function runParse(textOverride?: string, urlOverride?: string) {
    const paste = (textOverride ?? jdText).trim();
    const url = (urlOverride ?? jdUrl).trim();
    setError(null);
    setSteps(null);
    setKeywords(null);
    setPdfUrl(null);
    setPdfFilename(null);
    setTexFilename(null);
    setTexSource("");
    setCascadeDone(false);
    setLatexOpen(false);
    setManualPageCount(null);
    setLatexStatus(null);
    setChangeSummary(null);
    setActiveStepId(null);
    setPendingSuggestions(null);
    setParseBannerDismissed(false);
    setPdfToastOpen(false);
    setApplied(false);
    setBusy("parse");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText: paste || undefined,
          jdUrl: url || undefined,
        }),
      });
      const data = (await res.json()) as ParseResponse;
      if (!data.ok || !data.suggestions) {
        throw new Error(data.error || "Parse failed");
      }
      startTransition(() => {
        if (data.jdText) setJdText(data.jdText);
        setSuggestions(data.suggestions!);
        setPendingSuggestions(data.suggestions!);
        if (data.keywords) setKeywords(data.keywords);
        const sourceNote =
          data.source === "url"
            ? "Fetched JD from URL, then parsed."
            : data.source === "paste+url"
              ? "Used your pasted JD (URL kept as reference)."
              : "Parsed pasted JD.";
        const demoNote = data.usedDemo
          ? " DEMO_MODE heuristics in use."
          : " Review suggestions below, apply controls, then run cascade.";
        const warn = data.warning ? ` ${data.warning}` : "";
        setStatusNote(`${sourceNote}${demoNote}${warn}`);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(null);
    }
  }

  async function onParse() {
    await runParse();
  }

  async function onPasteAndParse() {
    setError(null);
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        throw new Error("Clipboard is empty — copy a JD first.");
      }
      setJdText(clip);
      await runParse(clip, jdUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read clipboard",
      );
    }
  }

  function onClearJd() {
    setJdUrl("");
    setJdText("");
  }

  function onApplyParseSuggestions() {
    if (!pendingSuggestions) return;
    applyControlsFromSuggestions(pendingSuggestions);
    setStatusNote("Controls updated from parse — review & run cascade.");
  }

  function onDismissParseBanner() {
    setParseBannerDismissed(true);
    setPendingSuggestions(null);
  }

  async function onExportPack() {
    setExportBusy(true);
    setError(null);
    try {
      await downloadExportPack({
        pdfUrl,
        pdfFilename,
        texSource,
        texFilename,
      });
      setStatusNote("Downloaded PDF, then TeX.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function onIApplied() {
    setError(null);
    setBusy("applying");
    try {
      const ats = steps?.find((s) => s.id === "ats_score")?.data as
        | AtsScore
        | undefined;
      const compileData = steps?.find((s) => s.id === "latex_compile")?.data as
        | { headerDecision?: { headerLocation?: string } }
        | undefined;

      const payload = {
        company: companyName.trim() || "Company",
        roleTitle: suggestions?.title ?? "",
        jdUrl: jdUrl.trim(),
        roleFamily: controls.roleFamily,
        seniority: controls.seniority,
        workArrangement: controls.workArrangement,
        mode: controls.mode,
        aggressiveTarget:
          controls.mode === "aggressive_fabrication"
            ? controls.aggressiveCoverageTarget
            : null,
        resumeType: controls.resumeType,
        resumeTypeLabel: resumeTypeLabel(controls.resumeType),
        detectedLocation: suggestions?.location ?? "",
        overrideLocation: controls.location,
        headerLocation: compileData?.headerDecision?.headerLocation ?? "",
        mustHaveHigh: keywords?.mustHaveHigh ?? [],
        niceToHaveLow: keywords?.niceToHaveLow ?? [],
        tools: keywords?.tools ?? [],
        themes: keywords?.themes ?? [],
        pinnedKeywords: controls.pinnedKeywords,
        forceInjectKeywords: controls.forceInjectKeywords,
        coverageHigh: ats?.coverageHigh ?? null,
        presentHigh: ats?.presentHigh ?? [],
        missingHigh: ats?.missingHigh ?? [],
        changeSummary: changeSummary,
        texSource,
        texFilename,
      };

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        throw new Error(data.error || "Could not save application");
      }
      setApplied(true);
      setStatusNote(`Saved to tracker · ${payload.company}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save application");
    } finally {
      setBusy(null);
    }
  }

  async function onHighlightChange(bullet: string) {
    const term = guessHighlightTerm(
      bullet,
      changeSummary?.keywordsAdded ?? [],
    );
    setLatexHighlightTerm(term);
    await onOpenLatexEditor();
  }

  const dismissPdfToast = useCallback(() => setPdfToastOpen(false), []);

  useEffect(() => {
    if (!cascadeDone || !pdfUrl || !steps) return;
    const ats = steps?.find((s) => s.id === "ats_score")?.data as
      | AtsScore
      | undefined;
    const compileData = steps?.find((s) => s.id === "latex_compile")?.data as
      | { headerDecision?: { headerLocation?: string } }
      | undefined;
    const pct =
      ats?.coverageHigh != null
        ? Math.round(ats.coverageHigh * 100)
        : null;
    const header = compileData?.headerDecision?.headerLocation;
    const parts = ["1 page"];
    if (header) parts.push(`Header: ${header}`);
    if (pct != null) parts.push(`${pct}% stack`);
    setPdfToastMessage(`Taylor stitched it · ${parts.join(" · ")}`);
    setPdfToastOpen(true);
  }, [cascadeDone, pdfUrl, steps]);

  async function onTailor() {
    setError(null);
    const selected = availableTypes.find((t) => t.type === controls.resumeType);
    if (selected && !selected.hasMaster) {
      setError(
        `Resume type "${selected.label}" (${selected.type}) has no master_resume_${selected.type}.json yet. Click Make MetaData first (builds metadata for every template_*.tex), then run the cascade.`,
      );
      return;
    }

    setPdfUrl(null);
    setPdfFilename(null);
    setTexFilename(null);
    setTexSource("");
    setCascadeDone(false);
    setLatexOpen(false);
    setManualPageCount(null);
    setLatexStatus(null);
    setChangeSummary(null);
    setApplied(false);
    setBusy("tailor");
    setCascadeOpen(true);
    setSteps(emptyCascadeSteps());
    setActiveStepId(CASCADE_STEP_ORDER[0]?.id ?? null);
    setStatusNote("Cascade started…");

    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText,
          controls,
          companyName: companyName.trim() || "Company",
          keywords: keywords ?? undefined,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const fail = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(fail?.error || "Cascade failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }

          if (event.type === "step_start") {
            setActiveStepId(event.step.id);
            setStatusNote(`Working: ${event.step.label} — ${event.step.summary}`);
            setSteps((prev) => {
              const base = prev ?? emptyCascadeSteps();
              return base.map((s) =>
                s.id === event.step.id
                  ? {
                      ...s,
                      status: "running",
                      summary: event.step.summary,
                    }
                  : s,
              );
            });
          } else if (event.type === "step_done") {
            setSteps((prev) => {
              const base = prev ?? emptyCascadeSteps();
              return base.map((s) =>
                s.id === event.step.id ? event.step : s,
              );
            });
          } else if (event.type === "done") {
            setActiveStepId(null);
            if (event.pdfUrl) setPdfUrl(event.pdfUrl);
            if (event.pdfFilename) setPdfFilename(event.pdfFilename);
            if (event.texFilename) setTexFilename(event.texFilename);
            if (event.texSource) setTexSource(event.texSource);
            if (event.changeSummary) setChangeSummary(event.changeSummary);
            setCascadeDone(true);
            setControls((c) => ({ ...c, forceInjectKeywords: [] }));
            setStatusNote(
              event.usedDemo
                ? "Cascade finished (demo/mocks mixed in)."
                : "Cascade finished.",
            );
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cascade failed");
      setActiveStepId(null);
    } finally {
      setBusy(null);
    }
  }

  async function onOpenLatexEditor() {
    setError(null);
    // Prefer in-memory source; refresh from disk if we have a filename.
    if (texFilename && !texSource.trim()) {
      try {
        const res = await fetch(
          `/api/resume/tex?file=${encodeURIComponent(texFilename)}`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          texSource?: string;
          error?: string;
        };
        if (!data.ok || !data.texSource) {
          throw new Error(data.error || "Could not load TeX");
        }
        setTexSource(data.texSource);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load TeX");
        return;
      }
    }
    setLatexOpen(true);
  }

  function onCloseLatex() {
    setLatexOpen(false);
    setLatexHighlightTerm(null);
  }

  async function onRecompile() {
    setError(null);
    setRecompiling(true);
    setLatexStatus("Compiling with Tectonic…");
    try {
      const res = await fetch("/api/resume/recompile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim() || "Company",
          texSource,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        pdfUrl?: string;
        pdfFilename?: string;
        texFilename?: string;
        pageCount?: number | null;
      };
      if (!data.ok) {
        throw new Error(data.error || "Recompile failed");
      }
      if (data.pdfUrl) setPdfUrl(data.pdfUrl);
      if (data.pdfFilename) setPdfFilename(data.pdfFilename);
      if (data.texFilename) setTexFilename(data.texFilename);
      setManualPageCount(
        typeof data.pageCount === "number" ? data.pageCount : null,
      );
      setLatexStatus(data.message || "Recompiled.");
      setStatusNote(
        data.pageCount === 1
          ? "Manual recompile OK — single page."
          : `Manual recompile OK — ${data.pageCount ?? "?"} page(s).`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Recompile failed";
      setLatexStatus(msg);
      setError(msg);
    } finally {
      setRecompiling(false);
    }
  }

  async function onMakeMetadata() {
    setError(null);
    setBusy("metadata");
    try {
      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as MetadataResponse;
      const results = data.results ?? [];
      if (!data.ok && results.length === 0) {
        throw new Error(data.error || "Make MetaData failed");
      }
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      const shortLine = results.length
        ? results
            .map((r) =>
              r.ok
                ? `${r.type} ✓${r.wrote ? " wrote" : r.usedDemo ? " demo" : ""}`
                : `${r.type} ✗`,
            )
            .join(" · ")
        : "no types found";
      startTransition(() => {
        setMetadataResults(results);
        setMetadataPreview(
          results.length
            ? Object.fromEntries(
                results.map((r) => [r.type, r.ok ? r.master : { error: r.error }]),
              )
            : null,
        );
        setStatusNote(
          `Make MetaData: ${okCount} ok${failCount ? `, ${failCount} failed` : ""} — ${shortLine}`,
        );
        if (!data.ok || failCount > 0) {
          setError(
            data.error ||
              results
                .filter((r) => !r.ok)
                .map((r) => `[${r.type}] ${r.error || "failed"}`)
                .join(" · ") ||
              "Make MetaData failed",
          );
        }
      });
      void refreshResumeTypes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Make MetaData failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRevertTex() {
    const ok = window.confirm(
      "Revert the working TeX to the baseline masters?\n\nThis rebuilds MetaData for ALL resume types, deletes current Resume_* artifacts, and clears the tailored editor state. The editor reloads the selected type's baseline. Your data/template_*.tex files are never touched.",
    );
    if (!ok) return;

    setError(null);
    setBusy("revert");
    try {
      const res = await fetch("/api/resume/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeType: controls.resumeType }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        texSource?: string;
        texFilename?: string;
        pdfFilename?: string;
        pdfUrl?: string;
        pageCount?: number | null;
        resumeType?: string;
        metadataSummary?: string;
      };
      if (!data.ok) {
        throw new Error(data.error || "Revert failed");
      }

      // Reset tailored session state back to a clean baseline slate.
      setSteps(null);
      setActiveStepId(null);
      setChangeSummary(null);
      setKeywords(null);
      setSuggestions(null);
      setPendingSuggestions(null);
      setParseBannerDismissed(false);
      setMetadataPreview(null);
      setMetadataResults([]);
      setCompanyName("");
      setControls((c) => ({
        ...c,
        pinnedKeywords: [],
        forceInjectKeywords: [],
      }));
      setLatexOpen(false);
      setLatexHighlightTerm(null);
      setLatexStatus(null);
      setPdfToastOpen(false);

      setTexSource(data.texSource ?? "");
      setTexFilename(data.texFilename ?? null);
      setPdfFilename(data.pdfFilename ?? null);
      setPdfUrl(data.pdfUrl ?? null);
      setManualPageCount(
        typeof data.pageCount === "number" ? data.pageCount : null,
      );
      setCascadeDone(true);
      setStatusNote(
        data.message || "Reverted working TeX to the baseline master.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setBusy(null);
    }
  }

  const hasPaste = jdText.trim().length >= 40;
  const hasUrl = /^https?:\/\/\S+/i.test(jdUrl.trim());
  const canParse = (hasPaste || hasUrl) && busy === null && !pending;
  const isUseOriginal = controls.mode === "use_original";
  const canTailor =
    busy === null &&
    !pending &&
    (isUseOriginal || (hasPaste && suggestions !== null));
  const canMakeMetadata = busy === null && !pending;
  const canRevert = busy === null && !pending;

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="section-label">ATS resume studio</p>
          <h1 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
            Taylor
          </h1>
          <p className="text-[1.05rem] leading-relaxed text-[var(--muted)]">
            Hey — I&apos;m Taylor (yes, like{" "}
            <span className="font-semibold text-[var(--accent-ink)]">tailor</span>
            ). Paste a JD and I&apos;ll help you stitch a one-page,
            keyword-aligned resume.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/applications" className="btn-ghost" prefetch={false}>
            My Applications
          </Link>
          <button
            type="button"
            onClick={onRevertTex}
            disabled={!canRevert}
            title="Reset the working TeX to the baseline masters, rebuild MetaData for ALL resume types, and clear tailored artifacts. Your data/template_*.tex files stay untouched."
            className="btn-ghost"
          >
            {busy === "revert" ? "Reverting…" : "Revert TeX"}
          </button>
          <button
            type="button"
            onClick={onMakeMetadata}
            disabled={!canMakeMetadata}
            title="Rebuild master_resume_{type}.json from every data/template_{type}.tex (runs per type)"
            className="btn-ghost"
          >
            {busy === "metadata" ? "Making MetaData…" : "Make MetaData"}
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        {/* Left: JD intake */}
        <section className="panel flex flex-col gap-4 p-5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl text-[var(--ink)]">Job input</h2>
            <span className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">
              Step 1
            </span>
          </div>

          <div className="space-y-2">
            <label htmlFor="jd-url" className="section-label">
              Job URL
            </label>
            <input
              id="jd-url"
              type="url"
              value={jdUrl}
              onChange={(e) => setJdUrl(e.target.value)}
              placeholder="https://… public posting"
              className="field"
            />
          </div>

          <div className="relative flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-[var(--line)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--faint)]">
              or
            </span>
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <label htmlFor="jd" className="section-label">
              Paste JD
            </label>
            <textarea
              id="jd"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Full JD text — use this for login-gated boards"
              rows={14}
              className="field min-h-[220px] flex-1 resize-y leading-relaxed"
            />
            <p className="text-xs text-[var(--faint)]">
              Public pages fetch fine. Gated boards → paste. If both filled,
              paste wins.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onParse}
              disabled={!canParse}
              className="btn-primary"
            >
              {busy === "parse"
                ? hasUrl && !hasPaste
                  ? "Fetching & parsing…"
                  : "Parsing…"
                : "Parse JD"}
            </button>
            <button
              type="button"
              onClick={onPasteAndParse}
              disabled={busy !== null || pending}
              title="Read clipboard, paste into JD box, and parse"
              className="btn-accent"
            >
              Paste &amp; Parse
            </button>
            <button
              type="button"
              onClick={onClearJd}
              disabled={busy !== null}
              title="Clear URL and pasted JD"
              className="btn-ghost"
            >
              Clear
            </button>
          </div>
        </section>

        {/* Right: Controls + keywords */}
        <section
          className={`panel flex flex-col gap-4 p-5 transition lg:col-span-7 ${
            suggestions ? "opacity-100" : "opacity-70"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl text-[var(--ink)]">
                Controls
              </h2>
              <span className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">
                Step 2
              </span>
            </div>
            {suggestions?.modeHint ? (
              <p className="max-w-sm text-xs text-[var(--muted)]">
                Hint: {MODE_LABELS[suggestions.modeHint]}
                {suggestions.modeHintReason
                  ? ` — ${suggestions.modeHintReason}`
                  : ""}
              </p>
            ) : null}
          </div>

          {pendingSuggestions && !parseBannerDismissed ? (
            <div className="parse-banner flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-[var(--ink-soft)]">
                Detected:{" "}
                <span className="font-medium text-[var(--ink)]">
                  {ROLE_LABELS[pendingSuggestions.roleFamily]}
                </span>
                {pendingSuggestions.location
                  ? ` · ${pendingSuggestions.location}`
                  : ""}
                {pendingSuggestions.modeHint
                  ? ` · hint ${MODE_LABELS[pendingSuggestions.modeHint]}`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onApplyParseSuggestions}
                  className="btn-primary !py-1.5 !px-3 !text-xs"
                >
                  Apply suggestions
                </button>
                <button
                  type="button"
                  onClick={onDismissParseBanner}
                  className="btn-ghost !py-1.5 !px-3 !text-xs"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Mode">
              <select
                value={controls.mode}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    mode: e.target.value as TailorMode,
                  }))
                }
                className="field"
              >
                {(Object.keys(MODE_LABELS) as TailorMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>

            {controls.mode === "aggressive_fabrication" ? (
              <Field label="Keyword match target">
                <select
                  value={String(controls.aggressiveCoverageTarget)}
                  onChange={(e) =>
                    setControls((c) => ({
                      ...c,
                      aggressiveCoverageTarget: Number(
                        e.target.value,
                      ) as AggressiveCoverageTarget,
                    }))
                  }
                  className="field"
                >
                  {AGGRESSIVE_COVERAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] leading-snug text-[var(--faint)]">
                  Retry hard-inject if concrete stack coverage is below this.
                </p>
              </Field>
            ) : null}

            <Field label="Role family">
              <select
                value={controls.roleFamily}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    roleFamily: e.target.value as RoleFamily,
                  }))
                }
                className="field"
              >
                {(Object.keys(ROLE_LABELS) as RoleFamily[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Resume type">
              <select
                value={controls.resumeType}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    resumeType: e.target.value,
                  }))
                }
                className="field"
              >
                {(availableTypes.length
                  ? availableTypes
                  : [
                      {
                        type: DEFAULT_RESUME_TYPE,
                        label: resumeTypeLabel(DEFAULT_RESUME_TYPE),
                        hasMaster: true,
                      },
                    ]
                ).map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label} ({t.type})
                    {t.hasMaster ? "" : " · no metadata yet"}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-snug text-[var(--faint)]">
                Which master archetype the cascade tailors (template_{"{type}"}
                .tex). Auto-set from role family after Parse; fallback ml.
              </p>
            </Field>

            <Field label="Location">
              <input
                value={controls.location}
                onChange={(e) =>
                  setControls((c) => ({ ...c, location: e.target.value }))
                }
                placeholder="Detected or override"
                className="field"
              />
              <p className="text-[11px] leading-snug text-[var(--faint)]">
                At cascade: West Coast → San Jose, CA · East Coast → New York, NY
                · Remote / other → New York, NY
              </p>
            </Field>

            <Field label="Seniority">
              <select
                value={controls.seniority}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    seniority: e.target.value as Seniority,
                  }))
                }
                className="field"
              >
                <option value="unspecified">Unspecified</option>
                <option value="intern">Intern</option>
                <option value="new_grad">New grad</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="staff_plus">Staff+</option>
              </select>
            </Field>

            <Field label="Work arrangement">
              <select
                value={controls.workArrangement}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    workArrangement: e.target.value as WorkArrangement,
                  }))
                }
                className="field"
              >
                <option value="unspecified">Unspecified</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </Field>

            <Field label="Company name">
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Amazon"
                className="field"
              />
            </Field>

            <Field label="Detected title">
              <input
                value={suggestions?.title ?? ""}
                readOnly
                className="field opacity-80"
                placeholder="After parse"
              />
            </Field>
          </div>

          {keywords ? (
            <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-solid)]/70 p-4">
              <h3 className="section-label">Detected keywords</h3>
              {isSparseKeywordJd(keywords) ? (
                <p className="rounded-lg border border-[var(--stub-bg)] bg-[var(--stub-bg)]/60 px-3 py-2 text-xs text-[var(--stub-fg)]">
                  Sparse JD — few named tools. Cascade will reframe bullets
                  toward themes using your existing stack; vague labels like
                  &quot;CS fundamentals&quot; are ignored.
                </p>
              ) : null}
              <KeywordChipRow
                label="Stack · high"
                terms={keywords.mustHaveHigh}
                tone="high"
                interactive
                mode={controls.mode}
                pinnedTerms={controls.pinnedKeywords}
                forceInjectTerms={controls.forceInjectKeywords}
                onPin={togglePinnedKeyword}
                onForceInject={toggleForceInjectKeyword}
              />
              <KeywordChipRow
                label="Stack · low"
                terms={keywords.niceToHaveLow}
                tone="low"
                interactive
                mode={controls.mode}
                pinnedTerms={controls.pinnedKeywords}
                forceInjectTerms={controls.forceInjectKeywords}
                onPin={togglePinnedKeyword}
                onForceInject={toggleForceInjectKeyword}
              />
              {keywords.tools.length > 0 ? (
                <KeywordChipRow
                  label="Tools"
                  terms={keywords.tools}
                  tone="tool"
                  interactive
                  mode={controls.mode}
                  pinnedTerms={controls.pinnedKeywords}
                  forceInjectTerms={controls.forceInjectKeywords}
                  onPin={togglePinnedKeyword}
                  onForceInject={toggleForceInjectKeyword}
                />
              ) : null}
              {keywords.themes.length > 0 ? (
                <KeywordChipRow
                  label="Themes (bullets only)"
                  terms={keywords.themes}
                  tone="theme"
                />
              ) : null}
              {!keywords.mustHaveHigh.length &&
              !keywords.niceToHaveLow.length &&
              !keywords.tools.length &&
              !keywords.themes.length ? (
                <p className="text-xs text-[var(--faint)]">
                  No usable stack or themes extracted from this JD.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--faint)]">
              Keywords appear here after Parse JD
            </div>
          )}

          <button
            type="button"
            onClick={onTailor}
            disabled={!canTailor}
            className="btn-accent w-full sm:w-auto"
          >
            {busy === "tailor"
              ? activeStepId
                ? `Running: ${CASCADE_STEP_ORDER.find((s) => s.id === activeStepId)?.label ?? "…"}`
                : "Running cascade…"
              : isUseOriginal
                ? "Compile original (no AI)"
                : "Run tailor cascade"}
          </button>
          {isUseOriginal ? (
            <p className="text-[11px] leading-snug text-[var(--faint)]">
              Use Original makes no AI calls — it compiles your master resume
              as-is (no JD parse needed, zero tokens).
            </p>
          ) : null}
        </section>
      </div>

      {(error || statusNote || cascadeDone) && (
        <div className="mt-6 panel space-y-4 p-5">
          {error ? (
            <p
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--danger-bd)",
                background: "var(--danger-bg)",
                color: "var(--danger-fg)",
              }}
            >
              {error}
            </p>
          ) : null}

          {statusNote ? (
            <p className="text-sm text-[var(--muted)]">{statusNote}</p>
          ) : null}

          {cascadeDone && (pdfUrl || texSource) ? (
            <div className="flex flex-wrap gap-2">
              {pdfUrl ? (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary inline-flex"
                >
                  Open PDF
                  {pdfFilename ? ` · ${stripResumePrefix(pdfFilename)}` : ""}
                </a>
              ) : null}
              <button
                type="button"
                onClick={onOpenLatexEditor}
                className="btn-accent"
              >
                {latexOpen ? "LaTeX editor open" : "View Raw LaTeX"}
              </button>
              {pdfUrl && texSource ? (
                <button
                  type="button"
                  onClick={onExportPack}
                  disabled={exportBusy}
                  className="btn-ghost"
                >
                  {exportBusy ? "Downloading…" : "Download PDF + TeX"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onIApplied}
                disabled={busy !== null || applied}
                title="Save this application (metadata + what-changed + TeX) to your tracker"
                className={`btn-applied${applied ? " is-saved" : ""}`}
              >
                {applied
                  ? "Applied ✓ (saved)"
                  : busy === "applying"
                    ? "Saving…"
                    : "I Applied ✓"}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {changeSummary ? (
        <section className="panel mt-5 space-y-3 p-5">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl text-[var(--ink)]">
              What changed
            </h2>
          </div>
          <p className="text-sm font-medium text-[var(--ink)]">
            {changeSummary.headline}
          </p>
          {changeSummary.bullets.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--muted)]">
              {changeSummary.bullets.map((b, i) => (
                <li key={`chg-${i}`}>
                  <button
                    type="button"
                    className="change-bullet-btn w-full"
                    title="Find in LaTeX editor"
                    onClick={() => onHighlightChange(b)}
                  >
                    {b}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {changeSummary.keywordsAdded.length > 0 ? (
            <p className="text-xs text-[var(--faint)]">
              Keywords emphasized: {changeSummary.keywordsAdded.join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {metadataResults.length > 0 || metadataPreview ? (
        <section className="panel mt-5 space-y-3 p-5">
          <div>
            <h2 className="font-display text-lg text-[var(--ink)]">
              Make MetaData results
            </h2>
            <p className="text-xs text-[var(--faint)]">
              One pass per <code className="text-[var(--muted)]">template_*.tex</code>{" "}
              archetype. Failures for one type do not block the others.
            </p>
          </div>
          {metadataResults.length > 0 ? (
            <ul className="space-y-2">
              {metadataResults.map((r) => (
                <li
                  key={r.type}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={
                    r.ok
                      ? {
                          borderColor: "var(--line)",
                          background: "var(--surface-solid)",
                        }
                      : {
                          borderColor: "var(--danger-bd)",
                          background: "var(--danger-bg)",
                          color: "var(--danger-fg)",
                        }
                  }
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-[var(--ink)]">
                      {r.ok ? "✓" : "✗"} {r.type}
                    </span>
                    <span className="text-xs text-[var(--faint)]">
                      {r.ok
                        ? r.wrote
                          ? "wrote master JSON"
                          : r.usedDemo
                            ? "demo stub (not written)"
                            : "ok"
                        : "failed"}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 text-xs ${r.ok ? "text-[var(--muted)]" : ""}`}
                  >
                    {r.ok ? r.summary : r.error}
                    {r.ok && r.masterPath ? ` · ${r.masterPath}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {metadataPreview ? (
            <details>
              <summary className="cursor-pointer text-xs text-[var(--faint)]">
                View JSON preview
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-[var(--code-bg)] p-3 text-[11px] leading-relaxed text-[var(--code-fg)]">
                {JSON.stringify(metadataPreview, null, 2)}
              </pre>
            </details>
          ) : null}
        </section>
      ) : null}

      {steps ? (
        <section className="panel mt-5 overflow-hidden">
          <button
            type="button"
            onClick={() => setCascadeOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[var(--accent-soft)]/40"
          >
            <div>
              <h2 className="font-display text-lg text-[var(--ink)]">
                Cascade trace
              </h2>
              <p className="text-xs text-[var(--faint)]">
                {busy === "tailor"
                  ? `Live · ${CASCADE_STEP_ORDER.find((s) => s.id === activeStepId)?.label ?? "…"}`
                  : `${steps.filter((s) => s.status === "ok").length}/${steps.length} steps ok`}
              </p>
            </div>
            <span className="text-sm font-semibold text-[var(--muted)]">
              {cascadeOpen ? "Hide" : "Show"}
            </span>
          </button>

          {cascadeOpen ? (
            <ol className="space-y-2 border-t border-[var(--line)] px-5 py-4">
              {steps.map((step, i) => (
                <li
                  key={step.id}
                  className={`rounded-xl border px-3 py-3 ${
                    step.status === "running"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]/50"
                      : "border-[var(--line)] bg-[var(--surface-solid)]/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--faint)]">{i + 1}.</span>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      {step.label}
                    </span>
                    <StatusPill status={step.status} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {step.summary}
                  </p>
                  {step.data != null && step.status !== "running" ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-[var(--faint)]">
                        View JSON
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-[var(--code-bg)] p-2 text-[11px] leading-relaxed text-[var(--code-fg)]">
                        {JSON.stringify(step.data, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <LatexEditorPanel
        open={latexOpen}
        onClose={onCloseLatex}
        texSource={texSource}
        onTexChange={setTexSource}
        texFilename={texFilename}
        recompiling={recompiling}
        onRecompile={onRecompile}
        statusNote={latexStatus}
        pageCount={manualPageCount}
        highlightTerm={latexHighlightTerm}
      />

      <PdfReadyToast
        open={pdfToastOpen && cascadeDone}
        message={pdfToastMessage}
        pdfUrl={pdfUrl}
        onDismiss={dismissPdfToast}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: CascadeStepResult["status"] }) {
  const styles =
    status === "ok"
      ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
      : status === "running"
        ? "bg-[var(--run-bg)] text-[var(--run-fg)]"
        : status === "pending"
          ? "bg-[var(--pend-bg)] text-[var(--pend-fg)]"
          : status === "stub"
            ? "bg-[var(--stub-bg)] text-[var(--stub-fg)]"
            : "bg-[var(--danger-bg)] text-[var(--danger-fg)]";
  const label =
    status === "running"
      ? "running…"
      : status === "pending"
        ? "pending"
        : status;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${styles}`}
    >
      {label}
    </span>
  );
}
