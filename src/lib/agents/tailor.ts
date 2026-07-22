import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  ensureSingleCompleteSentence,
  loadMasterResume,
  sanitizePlainText,
} from "@/lib/resume/master";
import {
  GapAnalysis,
  KeywordExtract,
  TailorControls,
  TailoredResume,
  TailoredResumeSchema,
} from "@/lib/types";

function stripTailored(resume: TailoredResume): TailoredResume {
  return TailoredResumeSchema.parse({
    skillGroups: resume.skillGroups.map((g) => ({
      ...g,
      label: sanitizePlainText(g.label),
      items: g.items.map(sanitizePlainText).filter(Boolean),
    })),
    experience: resume.experience.map((e) => ({
      ...e,
      bullets: e.bullets.map((b) => ({
        ...b,
        text: ensureSingleCompleteSentence(b.text),
      })),
    })),
    notesForUser: resume.notesForUser.map(sanitizePlainText),
  });
}

async function mockTailor(
  controls: TailorControls,
  keywords: KeywordExtract,
  gap: GapAnalysis,
  resumeType: string,
): Promise<TailoredResume> {
  const master = await loadMasterResume(resumeType);
  const high = keywords.mustHaveHigh.slice(0, 5);
  const sparse = high.length + keywords.tools.length < 3;

  const skillGroups = master.skills.groups
    .filter((g) => g.id !== "soft_collaboration")
    .slice(0, 4)
    .map((g) => ({
      groupId: g.id,
      label: g.label,
      items: sparse
        ? g.items.slice(0, 8)
        : [...g.items.slice(0, 4), ...high.slice(0, 2)].slice(0, 8),
    }));

  const themeHint = keywords.themes.slice(0, 2).join(", ");
  const experience = master.experience.map((job) => ({
    id: job.id,
    bullets: job.bullets.map((b, i) => ({
      id: b.id,
      text:
        i === 0 && (gap.overlaps[0] || themeHint)
          ? `${b.text} (${(gap.overlaps.slice(0, 2).join(", ") || themeHint)})`
          : b.text,
      priority: b.priority ?? ("med" as const),
      keywords: b.keywords ?? [],
    })),
  }));

  return stripTailored(
    TailoredResumeSchema.parse({
      skillGroups,
      experience,
      notesForUser: [
        "DEMO_MODE tailor stub.",
        ...(sparse
          ? [
              `Sparse JD — reframed bullets toward themes (${keywords.themes.slice(0, 4).join(", ") || "n/a"}); did not inject vague skill labels.`,
            ]
          : []),
        ...(gap.doNotClaim.length
          ? [`Do not claim: ${gap.doNotClaim.join("; ")}`]
          : []),
      ],
    }),
  );
}

export async function tailorResume(args: {
  jdText: string;
  controls: TailorControls;
  keywords: KeywordExtract;
  gap: GapAnalysis;
  masterResumeJson: string;
  resumeType: string;
}): Promise<{ data: TailoredResume; usedDemo: boolean }> {
  if (isDemoMode()) {
    return {
      data: await mockTailor(
        args.controls,
        args.keywords,
        args.gap,
        args.resumeType,
      ),
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

  return {
    data: stripTailored(TailoredResumeSchema.parse(parsed)),
    usedDemo: false,
  };
}
