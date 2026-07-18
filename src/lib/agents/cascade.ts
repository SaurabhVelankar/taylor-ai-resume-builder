import { analyzeGap } from "@/lib/agents/gapAnalysis";
import { summarizeChanges } from "@/lib/agents/changeSummary";
import { extractKeywords, filterExtract } from "@/lib/agents/extractKeywords";
import {
  coverageConcrete,
  hardInjectAggressiveKeywords,
} from "@/lib/agents/hardInject";
import { scoreAts } from "@/lib/agents/scoreAts";
import { tailorResume } from "@/lib/agents/tailor";
import { resumePdfBasename } from "@/lib/latex/filenames";
import { enforceOnePage } from "@/lib/pdf/onePageGate";
import type {
  CascadeStepId,
  CascadeStepResult,
  ChangeSummary,
  KeywordExtract,
  TailorControls,
  TailoredResume,
} from "@/lib/types";
import { isSparseKeywordJd, stackKeywordsForAts } from "@/lib/types";
import { readFile } from "fs/promises";
import path from "path";

async function loadMasterResumeJson(): Promise<string> {
  const filePath = path.join(process.cwd(), "data", "master_resume.json");
  return readFile(filePath, "utf8");
}

const LABELS: Record<CascadeStepId, string> = {
  extract_keywords: "Extract keywords",
  gap_analysis: "Gap analysis",
  tailor: "Tailor resume",
  latex_compile: "LaTeX compile",
  one_page_gate: "One-page hard gate",
  ats_score: "ATS keyword coverage",
  change_summary: "What changed",
};

export type CascadeProgressEvent =
  | {
      type: "step_start";
      step: { id: CascadeStepId; label: string; summary: string };
    }
  | { type: "step_done"; step: CascadeStepResult }
  | {
      type: "done";
      usedDemo: boolean;
      pdfUrl: string | null;
      pdfFilename: string | null;
      texFilename: string | null;
      texSource: string | null;
      changeSummary: ChangeSummary | null;
    }
  | { type: "error"; error: string };

export async function runTailorCascade(args: {
  jdText: string;
  controls: TailorControls;
  companyName?: string;
  /** Reuse keywords from Parse JD (skip duplicate extract). */
  keywords?: KeywordExtract;
  onEvent?: (event: CascadeProgressEvent) => void | Promise<void>;
}): Promise<{
  steps: CascadeStepResult[];
  usedDemo: boolean;
  pdfUrl: string | null;
  pdfFilename: string | null;
  texFilename: string | null;
  texSource: string | null;
  changeSummary: ChangeSummary | null;
}> {
  const emit = async (event: CascadeProgressEvent) => {
    await args.onEvent?.(event);
  };

  const steps: CascadeStepResult[] = [];
  let usedDemo = false;
  let pdfUrl: string | null = null;
  let pdfFilename: string | null = null;
  let texFilename: string | null = null;
  let texSource: string | null = null;
  let changeSummary: ChangeSummary | null = null;
  const companyName = args.companyName?.trim() || "Company";
  const masterResumeJson = await loadMasterResumeJson();

  const start = async (id: CascadeStepId, summary: string) => {
    await emit({
      type: "step_start",
      step: { id, label: LABELS[id], summary },
    });
  };

  const finish = async (step: CascadeStepResult) => {
    steps.push(step);
    await emit({ type: "step_done", step });
  };

  try {
    let keywords = args.keywords;
    await start(
      "extract_keywords",
      keywords ? "Reusing keywords from Parse JD…" : "Calling extract agent…",
    );
    if (!keywords) {
      const extracted = await extractKeywords({
        jdText: args.jdText,
        roleFamily: args.controls.roleFamily,
      });
      usedDemo = usedDemo || extracted.usedDemo;
      keywords = extracted.data;
      await finish({
        id: "extract_keywords",
        label: LABELS.extract_keywords,
        status: "ok",
        summary: `${keywords.mustHaveHigh.length} stack high / ${keywords.niceToHaveLow.length} low / ${keywords.themes.length} themes${isSparseKeywordJd(keywords) ? " · sparse JD" : ""}`,
        data: keywords,
      });
    } else {
      keywords = filterExtract(keywords);
      await finish({
        id: "extract_keywords",
        label: LABELS.extract_keywords,
        status: "ok",
        summary: `Reused from parse · ${keywords.mustHaveHigh.length} stack high / ${keywords.themes.length} themes${isSparseKeywordJd(keywords) ? " · sparse JD" : ""}`,
        data: keywords,
      });
    }

    await start("gap_analysis", "Comparing stack keywords + themes to master…");
    const gap = await analyzeGap({
      mode: args.controls.mode,
      keywords,
      masterResumeJson,
    });
    usedDemo = usedDemo || gap.usedDemo;
    await finish({
      id: "gap_analysis",
      label: LABELS.gap_analysis,
      status: "ok",
      summary: `${gap.data.overlaps.length} overlaps, ${gap.data.missing.length} missing · ${gap.data.themesCovered.length} themes covered`,
      data: gap.data,
    });

    await start(
      "tailor",
      isSparseKeywordJd(keywords)
        ? `Rewriting resume · sparse JD · mode ${args.controls.mode}…`
        : `Rewriting resume · mode ${args.controls.mode}…`,
    );
    const tailored = await tailorResume({
      jdText: args.jdText,
      controls: args.controls,
      keywords,
      gap: gap.data,
      masterResumeJson,
    });
    usedDemo = usedDemo || tailored.usedDemo;

    let working: TailoredResume = tailored.data;
    let injectNote = "";
    const pinnedStack = [
      ...new Set([
        ...stackKeywordsForAts(keywords),
        ...(args.controls.pinnedKeywords ?? []),
      ]),
    ];
    if (args.controls.mode === "aggressive_fabrication") {
      const injected = await hardInjectAggressiveKeywords({
        tailored: working,
        keywords,
        roleFamily: args.controls.roleFamily,
        forceTerms: args.controls.forceInjectKeywords ?? [],
      });
      working = injected.tailored;
      injectNote = injected.injected.length
        ? ` · hard-inject ${injected.injected.length}: ${injected.injected.join(", ")}`
        : " · hard-inject (nothing missing)";
    }

    await finish({
      id: "tailor",
      label: LABELS.tailor,
      status: "ok",
      summary: `${working.experience.reduce((n, e) => n + e.bullets.length, 0)} bullets · mode ${args.controls.mode}${injectNote}`,
      data: working,
    });

    await start(
      "latex_compile",
      `Rendering + Tectonic → ${resumePdfBasename(companyName)}…`,
    );
    const atsStack = pinnedStack;
    let onePage = await enforceOnePage(
      working,
      companyName,
      args.controls.roleFamily,
      atsStack,
      async (msg) => {
        await emit({
          type: "step_start",
          step: {
            id: "latex_compile",
            label: LABELS.latex_compile,
            summary: msg,
          },
        });
      },
      args.controls.location,
    );
    // Prefer final compressed content for downstream ATS / summary
    let finalTailored = onePage.tailored;
    pdfUrl = onePage.pdfUrl;
    pdfFilename = onePage.pdfFilename;
    texFilename = onePage.texFilename;
    texSource = onePage.texSource;
    await finish({
      id: "latex_compile",
      label: LABELS.latex_compile,
      status: onePage.pdfPath ? "ok" : "error",
      summary: onePage.compileMessage,
      data: {
        texPreview: onePage.texSource.slice(0, 500),
        pdfUrl: onePage.pdfUrl,
        pdfFilename: onePage.pdfFilename,
        texFilename: onePage.texFilename,
        headerDecision: onePage.headerDecision,
        attempts: onePage.attempts,
      },
    });

    await start("one_page_gate", "Final page-count check…");
    await finish({
      id: "one_page_gate",
      label: LABELS.one_page_gate,
      status: onePage.gate.accepted ? "ok" : "error",
      summary: onePage.gate.message,
      data: { ...onePage.gate, attempts: onePage.attempts },
    });

    await start(
      "ats_score",
      atsStack.length
        ? "Checking concrete stack keyword coverage…"
        : "Sparse JD — ATS stack list empty; scoring skipped list…",
    );
    let scored = await scoreAts({
      highKeywords: atsStack,
      tailored: finalTailored,
    });
    usedDemo = usedDemo || scored.usedDemo;

    // Aggressive: if coverage < user target, hard-inject still-missing + recompile once
    let retryNote = "";
    const coverageTarget =
      args.controls.aggressiveCoverageTarget ?? 0.8;
    if (
      args.controls.mode === "aggressive_fabrication" &&
      atsStack.length > 0 &&
      scored.data.coverageHigh < coverageTarget
    ) {
      const local = coverageConcrete(finalTailored, atsStack);
      const missing = local.missing.length
        ? local.missing
        : scored.data.missingHigh;
      const targetPct = Math.round(coverageTarget * 100);
      await emit({
        type: "step_start",
        step: {
          id: "ats_score",
          label: LABELS.ats_score,
          summary: `Coverage ${Math.round(scored.data.coverageHigh * 100)}% < ${targetPct}% — aggressive retry (inject ${missing.join(", ") || "none"})…`,
        },
      });

      const reinjected = await hardInjectAggressiveKeywords({
        tailored: finalTailored,
        keywords,
        roleFamily: args.controls.roleFamily,
        forceTerms: [
          ...(args.controls.forceInjectKeywords ?? []),
          ...missing,
        ],
      });
      finalTailored = reinjected.tailored;

      onePage = await enforceOnePage(
        finalTailored,
        companyName,
        args.controls.roleFamily,
        atsStack,
        async (msg) => {
          await emit({
            type: "step_start",
            step: {
              id: "latex_compile",
              label: LABELS.latex_compile,
              summary: `Aggressive retry · ${msg}`,
            },
          });
        },
        args.controls.location,
      );
      finalTailored = onePage.tailored;
      pdfUrl = onePage.pdfUrl;
      pdfFilename = onePage.pdfFilename;
      texFilename = onePage.texFilename;
      texSource = onePage.texSource;

      scored = await scoreAts({
        highKeywords: atsStack,
        tailored: finalTailored,
      });
      retryNote = ` · retry → ${Math.round(scored.data.coverageHigh * 100)}%`;
    }

    await finish({
      id: "ats_score",
      label: LABELS.ats_score,
      status: "ok",
      summary: atsStack.length
        ? `${Math.round(scored.data.coverageHigh * 100)}% concrete stack coverage${retryNote}`
        : "No concrete stack keywords to score (themes-only JD)",
      data: scored.data,
    });

    await start("change_summary", "Summarizing edits for you…");
    const summary = await summarizeChanges({
      controls: args.controls,
      keywords,
      gap: gap.data,
      tailored: finalTailored,
      masterResumeJson,
    });
    usedDemo = usedDemo || summary.usedDemo;
    changeSummary = summary.data;
    await finish({
      id: "change_summary",
      label: LABELS.change_summary,
      status: "ok",
      summary: summary.data.headline,
      data: summary.data,
    });

    await emit({
      type: "done",
      usedDemo,
      pdfUrl,
      pdfFilename,
      texFilename,
      texSource,
      changeSummary,
    });
    return {
      steps,
      usedDemo,
      pdfUrl,
      pdfFilename,
      texFilename,
      texSource,
      changeSummary,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cascade failed";
    await emit({ type: "error", error: message });
    throw error;
  }
}
