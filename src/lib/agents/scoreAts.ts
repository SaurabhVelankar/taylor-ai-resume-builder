import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import { AtsScore, AtsScoreSchema, TailoredResume } from "@/lib/types";

function textBlob(tailored: TailoredResume): string {
  return [
    tailored.summary,
    tailored.skillsBlurb,
    ...tailored.experienceBullets.map((b) => b.text),
  ].join("\n");
}

function mockScore(high: string[], tailored: TailoredResume): AtsScore {
  const blob = textBlob(tailored).toLowerCase();
  const presentHigh = high.filter((k) => blob.includes(k.toLowerCase()));
  const missingHigh = high.filter(
    (k) => !blob.includes(k.toLowerCase()),
  );
  const coverageHigh = high.length ? presentHigh.length / high.length : 0;
  return AtsScoreSchema.parse({
    coverageHigh,
    presentHigh,
    missingHigh,
  });
}

export async function scoreAts(args: {
  highKeywords: string[];
  tailored: TailoredResume;
}): Promise<{ data: AtsScore; usedDemo: boolean }> {
  if (isDemoMode()) {
    return {
      data: mockScore(args.highKeywords, args.tailored),
      usedDemo: true,
    };
  }

  const prompt = PROMPT_PLACEHOLDERS.atsScore;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, {
      highKeywordsJson: JSON.stringify(args.highKeywords),
      tailoredText: textBlob(args.tailored),
    }),
    kind: "flash",
  });

  return { data: AtsScoreSchema.parse(parsed), usedDemo: false };
}
