import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  GapAnalysis,
  GapAnalysisSchema,
  KeywordExtract,
  TailorMode,
} from "@/lib/types";

function mockGap(keywords: KeywordExtract): GapAnalysis {
  const high = keywords.mustHaveHigh;
  const mid = Math.ceil(high.length / 2);
  return GapAnalysisSchema.parse({
    overlaps: high.slice(0, mid),
    missing: high.slice(mid),
    stretch: keywords.niceToHaveLow.slice(0, 3),
    doNotClaim: ["Staff-level architecture ownership (unless true in master)"],
  });
}

export async function analyzeGap(args: {
  mode: TailorMode;
  keywords: KeywordExtract;
  masterResumeJson: string;
}): Promise<{ data: GapAnalysis; usedDemo: boolean }> {
  if (isDemoMode()) {
    return { data: mockGap(args.keywords), usedDemo: true };
  }

  const prompt = PROMPT_PLACEHOLDERS.gapAnalysis;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, {
      mode: args.mode,
      keywordsJson: JSON.stringify(args.keywords),
      masterResumeJson: args.masterResumeJson,
    }),
    kind: "pro",
  });

  return { data: GapAnalysisSchema.parse(parsed), usedDemo: false };
}
