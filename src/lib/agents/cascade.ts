import { analyzeGap } from "@/lib/agents/gapAnalysis";
import { summarizeChanges } from "@/lib/agents/changeSummary";
import { extractKeywords, filterExtract } from "@/lib/agents/extractKeywords";
import {
  coverageConcrete,
  hardInjectAggressiveKeywords,
} from "@/lib/agents/hardInject";
import { localAtsScore, scoreAts } from "@/lib/agents/scoreAts";
import { tailorResume } from "@/lib/agents/tailor";
import { resumePdfBasename } from "@/lib/latex/filenames";
import { enforceOnePage } from "@/lib/pdf/onePageGate";
import { loadMasterResume, originalTailoredResume } from "@/lib/resume/master";
import {
  ChangeSummarySchema,
  type CascadeStepId,
  type CascadeStepResult,
  type ChangeSummary,
  type KeywordExtract,
  type TailorControls,
  type TailoredResume,
} from "@/lib/types";
import { isSparseKeywordJd, stackKeywordsForAts } from "@/lib/types";
import {
  masterPathFor,
  resolveResumeType,
  templatePathFor,
} from "@/lib/resume/resumeTypes";
import { access, readFile } from "fs/promises";

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadMasterResumeJson(resumeType: string): Promise<string> {
  try {
    return await readFile(masterPathFor(resumeType), "utf8");
  } catch {
    throw new Error(
      `No master_resume_${resumeType}.json found for archetype "${resumeType}". ` +
        `Run Make MetaData first (it builds one JSON per template_*.tex), ` +
        `or pick a Resume type that already has metadata.`,
    );
  }
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
  const resumeType = await resolveResumeType(args.controls.resumeType);
  if (!(await fileExists(templatePathFor(resumeType)))) {
    throw new Error(
      `No template_${resumeType}.tex found in data/. Add that archetype template, or pick another Resume type.`,
    );
  }
  const masterResumeJson = await loadMasterResumeJson(resumeType);

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
    // "Use Original" = zero AI. Compile the master resume as-is through the
    // deterministic pipeline (render → Tectonic → one-page gate → local ATS).
    if (args.controls.mode === "use_original") {
      const result = await runUseOriginal({
        controls: args.controls,
        companyName,
        keywords: args.keywords,
        resumeType,
        start,
        finish,
        emit,
      });
      await emit({
        type: "done",
        usedDemo: false,
        pdfUrl: result.pdfUrl,
        pdfFilename: result.pdfFilename,
        texFilename: result.texFilename,
        texSource: result.texSource,
        changeSummary: result.changeSummary,
      });
      return {
        steps,
        usedDemo: false,
        pdfUrl: result.pdfUrl,
        pdfFilename: result.pdfFilename,
        texFilename: result.texFilename,
        texSource: result.texSource,
        changeSummary: result.changeSummary,
      };
    }

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
      resumeType,
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
        resumeType,
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
      resumeType,
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
        resumeType,
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
        resumeType,
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

/**
 * "Use Original" mode — no AI, no tokens. Emits the same step trace as the full
 * cascade (so the UI is consistent) but only runs deterministic work: identity
 * render of the master resume → Tectonic compile → one-page gate → local ATS
 * substring coverage → a fixed "no changes" summary.
 */
async function runUseOriginal(args: {
  controls: TailorControls;
  companyName: string;
  keywords?: KeywordExtract;
  resumeType: string;
  start: (id: CascadeStepId, summary: string) => Promise<void>;
  finish: (step: CascadeStepResult) => Promise<void>;
  emit: (event: CascadeProgressEvent) => Promise<void>;
}): Promise<{
  pdfUrl: string | null;
  pdfFilename: string | null;
  texFilename: string | null;
  texSource: string | null;
  changeSummary: ChangeSummary | null;
}> {
  const { controls, companyName, resumeType, start, finish, emit } = args;
  const master = await loadMasterResume(resumeType);
  const working = originalTailoredResume(master);
  const keywords = args.keywords ? filterExtract(args.keywords) : null;

  await start("extract_keywords", "Use Original — skipping AI keyword extract…");
  await finish({
    id: "extract_keywords",
    label: LABELS.extract_keywords,
    status: "ok",
    summary: keywords
      ? `Reused ${keywords.mustHaveHigh.length} parsed stack terms — no new AI call.`
      : "Skipped — Use Original uses no AI.",
    data: keywords,
  });

  await start("gap_analysis", "Use Original — skipping AI gap analysis…");
  await finish({
    id: "gap_analysis",
    label: LABELS.gap_analysis,
    status: "ok",
    summary: "Skipped — Use Original uses no AI.",
    data: null,
  });

  const bulletCount = working.experience.reduce(
    (n, e) => n + e.bullets.length,
    0,
  );
  await start(
    "tailor",
    "Use Original — compiling your master resume as-is (no AI)…",
  );
  await finish({
    id: "tailor",
    label: LABELS.tailor,
    status: "ok",
    summary: `${bulletCount} bullets · original master, no AI edits`,
    data: working,
  });

  const atsStack = [
    ...new Set([
      ...(keywords ? stackKeywordsForAts(keywords) : []),
      ...(controls.pinnedKeywords ?? []),
    ]),
  ];

  await start(
    "latex_compile",
    `Rendering + Tectonic → ${resumePdfBasename(companyName)}…`,
  );
  const onePage = await enforceOnePage(
    working,
    companyName,
    controls.roleFamily,
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
    controls.location,
    resumeType,
  );
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
    atsStack.length ? "Local stack coverage (no AI)…" : "No stack keywords…",
  );
  const scored = localAtsScore(atsStack, onePage.tailored);
  await finish({
    id: "ats_score",
    label: LABELS.ats_score,
    status: "ok",
    summary: atsStack.length
      ? `${Math.round(scored.coverageHigh * 100)}% concrete stack coverage (original, no injection)`
      : "No concrete stack keywords to score",
    data: scored,
  });

  const headerLoc = onePage.headerDecision?.headerLocation;
  await start("change_summary", "Recording original (no changes)…");
  const changeSummary = ChangeSummarySchema.parse({
    headline: "Used your original resume — no AI tailoring.",
    bullets: [
      "Compiled your master resume as-is; no bullets rewritten and no keywords injected.",
      ...(headerLoc ? [`Header location: ${headerLoc}.`] : []),
      "Zero AI calls / tokens used for this run.",
    ],
    keywordsAdded: [],
    sectionsTouched: [],
  });
  await finish({
    id: "change_summary",
    label: LABELS.change_summary,
    status: "ok",
    summary: changeSummary.headline,
    data: changeSummary,
  });

  return {
    pdfUrl: onePage.pdfUrl,
    pdfFilename: onePage.pdfFilename,
    texFilename: onePage.texFilename,
    texSource: onePage.texSource,
    changeSummary,
  };
}
