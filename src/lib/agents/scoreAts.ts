import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import { tailoredTextBlob } from "@/lib/resume/master";
import { filterConcreteStackKeywords } from "@/lib/resume/keywordQuality";
import { AtsScore, AtsScoreSchema, TailoredResume } from "@/lib/types";

/** Deterministic substring coverage — no AI, no tokens. */
export function localAtsScore(
  high: string[],
  tailored: TailoredResume,
): AtsScore {
  const concrete = filterConcreteStackKeywords(high);
  const blob = tailoredTextBlob(tailored).toLowerCase();
  const presentHigh = concrete.filter((k) => blob.includes(k.toLowerCase()));
  const missingHigh = concrete.filter(
    (k) => !blob.includes(k.toLowerCase()),
  );
  const coverageHigh = concrete.length
    ? presentHigh.length / concrete.length
    : 0;
  return AtsScoreSchema.parse({
    coverageHigh,
    presentHigh,
    missingHigh,
  });
}

function mockScore(high: string[], tailored: TailoredResume): AtsScore {
  return localAtsScore(high, tailored);
}

export async function scoreAts(args: {
  highKeywords: string[];
  tailored: TailoredResume;
}): Promise<{ data: AtsScore; usedDemo: boolean }> {
  const concrete = filterConcreteStackKeywords(args.highKeywords);

  // Prefer deterministic substring score so vague phrases never inflate the denominator.
  if (isDemoMode() || concrete.length === 0) {
    return {
      data: mockScore(concrete, args.tailored),
      usedDemo: isDemoMode(),
    };
  }

  const prompt = PROMPT_PLACEHOLDERS.atsScore;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, {
      highKeywordsJson: JSON.stringify(concrete),
      tailoredText: tailoredTextBlob(args.tailored),
    }),
    kind: "flash",
  });

  // Reconcile with local substring truth (LLM sometimes drifts).
  const local = mockScore(concrete, args.tailored);
  try {
    const llm = AtsScoreSchema.parse(parsed);
    if (
      llm.presentHigh.length + llm.missingHigh.length !== concrete.length ||
      Math.abs(llm.coverageHigh - local.coverageHigh) > 0.05
    ) {
      return { data: local, usedDemo: false };
    }
    return { data: llm, usedDemo: false };
  } catch {
    return { data: local, usedDemo: false };
  }
}
