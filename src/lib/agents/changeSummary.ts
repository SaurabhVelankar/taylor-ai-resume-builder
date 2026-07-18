import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  ChangeSummary,
  ChangeSummarySchema,
  GapAnalysis,
  KeywordExtract,
  TailorControls,
  TailoredResume,
} from "@/lib/types";

function mockSummary(
  keywords: KeywordExtract,
  tailored: TailoredResume,
  gap: GapAnalysis,
): ChangeSummary {
  const high = keywords.mustHaveHigh.slice(0, 6);
  const themes = keywords.themes.slice(0, 4);
  const bulletCount = tailored.experience.reduce(
    (n, e) => n + e.bullets.length,
    0,
  );
  return ChangeSummarySchema.parse({
    headline: high.length
      ? `Tailored ${bulletCount} bullets across ${tailored.experience.length} roles toward ${high.slice(0, 3).join(", ")}.`
      : `Sparse JD — reframed ${bulletCount} bullets toward themes (${themes.join(", ") || "role fit"}) using existing stack.`,
    bullets: [
      high.length
        ? `Emphasized named stack in skills/experience: ${high.join(", ")}.`
        : "No concrete stack keywords to inject into the skills line.",
      themes.length
        ? `Aligned bullets to JD themes (not as skills): ${themes.join(", ")}.`
        : "No JD themes detected.",
      tailored.skillGroups.length
        ? `Updated ${tailored.skillGroups.length} skill groups (${tailored.skillGroups.map((g) => g.label).join("; ")}).`
        : "Skills groups unchanged.",
      gap.overlaps.length
        ? `Leaned on true overlaps: ${gap.overlaps.slice(0, 5).join(", ")}.`
        : "Few clear stack overlaps with master resume.",
      gap.themesCovered.length
        ? `Themes covered by evidence: ${gap.themesCovered.slice(0, 3).join("; ")}.`
        : gap.missing.length
          ? `Still missing / stretch: ${gap.missing.slice(0, 5).join(", ")}.`
          : "Coverage looks strong vs JD stack keywords.",
      ...(tailored.notesForUser.slice(0, 2) || []),
    ],
    keywordsAdded: high,
    sectionsTouched: ["skills", "experience"],
  });
}

export async function summarizeChanges(args: {
  controls: TailorControls;
  keywords: KeywordExtract;
  gap: GapAnalysis;
  tailored: TailoredResume;
  masterResumeJson: string;
}): Promise<{ data: ChangeSummary; usedDemo: boolean }> {
  if (isDemoMode()) {
    return {
      data: mockSummary(args.keywords, args.tailored, args.gap),
      usedDemo: true,
    };
  }

  const prompt = PROMPT_PLACEHOLDERS.changeSummary;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, {
      controlsJson: JSON.stringify(args.controls),
      keywordsJson: JSON.stringify(args.keywords),
      gapJson: JSON.stringify(args.gap),
      tailoredJson: JSON.stringify(args.tailored),
      masterResumeJson: args.masterResumeJson,
    }),
    kind: "flash",
  });

  return { data: ChangeSummarySchema.parse(parsed), usedDemo: false };
}
