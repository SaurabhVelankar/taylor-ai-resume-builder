import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  GapAnalysis,
  KeywordExtract,
  TailorControls,
  TailoredResume,
  TailoredResumeSchema,
} from "@/lib/types";

function mockTailor(
  controls: TailorControls,
  keywords: KeywordExtract,
  gap: GapAnalysis,
): TailoredResume {
  const high = keywords.mustHaveHigh.slice(0, 5);
  return TailoredResumeSchema.parse({
    summary: `[STUB ${controls.mode}] Targeted ${controls.roleFamily} summary mentioning: ${high.join(", ") || "n/a"}. Location framing: ${controls.location || "n/a"}.`,
    skillsBlurb: high.join(", ") || "Skills TBD",
    experienceBullets: [
      {
        id: "exp-1",
        text: `[STUB] Highlight overlap skills (${gap.overlaps.slice(0, 3).join(", ") || "none"}).`,
        priority: "high",
        keywords: gap.overlaps.slice(0, 3),
      },
      {
        id: "exp-2",
        text: `[STUB] Address stretch items carefully (${gap.stretch.slice(0, 2).join(", ") || "none"}).`,
        priority: "med",
        keywords: gap.stretch.slice(0, 2),
      },
      {
        id: "exp-3",
        text: `[STUB] Low-priority color; first to drop on 1-page overflow.`,
        priority: "low",
        keywords: [],
      },
    ],
    notesForUser: [
      "Tailor step used placeholder prompt / demo output.",
      ...(gap.doNotClaim.length
        ? [`Do not claim: ${gap.doNotClaim.join("; ")}`]
        : []),
    ],
  });
}

export async function tailorResume(args: {
  jdText: string;
  controls: TailorControls;
  keywords: KeywordExtract;
  gap: GapAnalysis;
  masterResumeJson: string;
}): Promise<{ data: TailoredResume; usedDemo: boolean }> {
  if (isDemoMode()) {
    return {
      data: mockTailor(args.controls, args.keywords, args.gap),
      usedDemo: true,
    };
  }

  const prompt = PROMPT_PLACEHOLDERS.tailor;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, {
      controlsJson: JSON.stringify(args.controls),
      gapJson: JSON.stringify(args.gap),
      keywordsJson: JSON.stringify(args.keywords),
      masterResumeJson: args.masterResumeJson,
      jdText: args.jdText,
    }),
    kind: "pro",
  });

  return { data: TailoredResumeSchema.parse(parsed), usedDemo: false };
}
