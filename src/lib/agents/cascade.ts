import { analyzeGap } from "@/lib/agents/gapAnalysis";
import { extractKeywords } from "@/lib/agents/extractKeywords";
import { scoreAts } from "@/lib/agents/scoreAts";
import { tailorResume } from "@/lib/agents/tailor";
import { enforceOnePage } from "@/lib/pdf/onePageGate";
import type { CascadeStepResult, TailorControls } from "@/lib/types";
import { readFile } from "fs/promises";
import path from "path";

async function loadMasterResumeJson(): Promise<string> {
  const filePath = path.join(process.cwd(), "data", "master_resume.json");
  return readFile(filePath, "utf8");
}

export async function runTailorCascade(args: {
  jdText: string;
  controls: TailorControls;
}): Promise<{
  steps: CascadeStepResult[];
  usedDemo: boolean;
}> {
  const steps: CascadeStepResult[] = [];
  let usedDemo = false;
  const masterResumeJson = await loadMasterResumeJson();

  const extracted = await extractKeywords({
    jdText: args.jdText,
    roleFamily: args.controls.roleFamily,
  });
  usedDemo = usedDemo || extracted.usedDemo;
  steps.push({
    id: "extract_keywords",
    label: "Extract keywords",
    status: "ok",
    summary: `${extracted.data.mustHaveHigh.length} high / ${extracted.data.niceToHaveLow.length} low`,
    data: extracted.data,
  });

  const gap = await analyzeGap({
    mode: args.controls.mode,
    keywords: extracted.data,
    masterResumeJson,
  });
  usedDemo = usedDemo || gap.usedDemo;
  steps.push({
    id: "gap_analysis",
    label: "Gap analysis",
    status: "ok",
    summary: `${gap.data.overlaps.length} overlaps, ${gap.data.missing.length} missing`,
    data: gap.data,
  });

  const tailored = await tailorResume({
    jdText: args.jdText,
    controls: args.controls,
    keywords: extracted.data,
    gap: gap.data,
    masterResumeJson,
  });
  usedDemo = usedDemo || tailored.usedDemo;
  steps.push({
    id: "tailor",
    label: "Tailor resume",
    status: "ok",
    summary: `${tailored.data.experienceBullets.length} bullets · mode ${args.controls.mode}`,
    data: tailored.data,
  });

  const onePage = await enforceOnePage(tailored.data);
  steps.push({
    id: "latex_compile",
    label: "LaTeX compile",
    status: "stub",
    summary: onePage.compileMessage,
    data: { texPreview: onePage.texSource.slice(0, 500) },
  });
  steps.push({
    id: "one_page_gate",
    label: "One-page hard gate",
    status: onePage.gate.accepted ? "ok" : "stub",
    summary: onePage.gate.message,
    data: onePage.gate,
  });

  const scored = await scoreAts({
    highKeywords: extracted.data.mustHaveHigh,
    tailored: tailored.data,
  });
  usedDemo = usedDemo || scored.usedDemo;
  steps.push({
    id: "ats_score",
    label: "ATS keyword coverage",
    status: "ok",
    summary: `${Math.round(scored.data.coverageHigh * 100)}% high-keyword coverage`,
    data: scored.data,
  });

  return { steps, usedDemo };
}
