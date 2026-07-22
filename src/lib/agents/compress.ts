import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  ensureSingleCompleteSentence,
  sanitizePlainText,
} from "@/lib/resume/master";
import {
  TailoredResume,
  TailoredResumeSchema,
} from "@/lib/types";

/** Shrink wording without leaving mid-sentence "…" dumps. */
function shortenText(text: string, maxChars: number): string {
  return ensureSingleCompleteSentence(text, maxChars);
}

/** Deterministic content shrink by compression tier. */
export function compressDeterministic(
  tailored: TailoredResume,
  tier: number,
  mustKeepKeywords: string[] = [],
): TailoredResume {
  let experience = tailored.experience.map((exp) => ({
    ...exp,
    bullets: exp.bullets.map((b) => ({ ...b })),
  }));
  let skillGroups = tailored.skillGroups.map((g) => ({
    ...g,
    items: [...g.items],
  }));
  const notes = [...tailored.notesForUser];
  const keepLower = mustKeepKeywords.map((k) => k.toLowerCase());

  const trimSkills = (items: string[], max: number) => {
    if (items.length <= max) return items;
    const pinned = items.filter((i) =>
      keepLower.some(
        (k) => i.toLowerCase().includes(k) || k.includes(i.toLowerCase()),
      ),
    );
    const rest = items.filter((i) => !pinned.includes(i));
    return [...pinned, ...rest].slice(0, max);
  };

  if (tier >= 1) {
    experience = experience.map((exp) => ({
      ...exp,
      bullets: exp.bullets.map((b) => ({
        ...b,
        text: shortenText(b.text, tier >= 3 ? 160 : 220),
      })),
    }));
    notes.push(`Tier ${tier}: shortened bullet wording.`);
  }

  if (tier >= 2) {
    experience = experience.map((exp) => {
      const kept = exp.bullets.filter((b) => b.priority !== "low");
      return {
        ...exp,
        bullets: kept.length ? kept : exp.bullets.slice(0, 1),
      };
    });
    notes.push(`Tier ${tier}: dropped low-priority bullets.`);
  }

  if (tier >= 3) {
    experience = experience.map((exp) => {
      const highs = exp.bullets.filter((b) => b.priority === "high");
      const meds = exp.bullets
        .filter((b) => b.priority === "med")
        .sort((a, b) => a.text.length - b.text.length);
      // Keep all high + shortest half of med (favor concise)
      const keepMed = meds.slice(0, Math.max(1, Math.ceil(meds.length / 2)));
      const merged = [...highs, ...keepMed];
      return {
        ...exp,
        bullets: merged.length ? merged : exp.bullets.slice(0, 1),
      };
    });
    skillGroups = skillGroups.map((g) => ({
      ...g,
      items: trimSkills(g.items, 6),
    }));
    notes.push(`Tier ${tier}: trimmed med bullets + skill items.`);
  }

  if (tier >= 4) {
    // Extra hard cut before/alongside AI tier fallback
    experience = experience.map((exp) => ({
      ...exp,
      bullets: exp.bullets
        .filter((b) => b.priority === "high")
        .slice(0, 2)
        .map((b) => ({ ...b, text: shortenText(b.text, 140) })),
    }));
    // Ensure every job still has ≥1 bullet
    experience = experience.map((exp, i) => {
      if (exp.bullets.length) return exp;
      const fallback = tailored.experience[i]?.bullets[0];
      return {
        ...exp,
        bullets: fallback
          ? [{ ...fallback, text: shortenText(fallback.text, 140) }]
          : [],
      };
    });
    skillGroups = skillGroups.map((g) => ({
      ...g,
      items: trimSkills(g.items, 4),
    }));
    notes.push(`Tier ${tier}: kept high-priority bullets only.`);
  }

  return TailoredResumeSchema.parse({
    skillGroups,
    experience,
    notesForUser: notes,
  });
}

export type LayoutCompressOpts = {
  /** Max bullets kept per project (Infinity = unchanged). */
  projectMaxBullets: number;
  /** Keep only the first N projects (Infinity = all). */
  projectMaxCount: number;
  /**
   * NEVER drop Academic Research — whole sections stay.
   * Kept on the type for API stability; always false.
   */
  dropResearch: false;
};

export function layoutOptsForTier(tier: number): LayoutCompressOpts {
  // Compress by shortening project bullets / count only.
  // Do NOT remove Academic Research (or other whole sections).
  if (tier >= 6) {
    return {
      projectMaxBullets: 1,
      projectMaxCount: 1,
      dropResearch: false,
    };
  }
  if (tier >= 5) {
    return {
      projectMaxBullets: 1,
      projectMaxCount: 2,
      dropResearch: false,
    };
  }
  if (tier >= 4) {
    return {
      projectMaxBullets: 2,
      projectMaxCount: Infinity,
      dropResearch: false,
    };
  }
  return {
    projectMaxBullets: Infinity,
    projectMaxCount: Infinity,
    dropResearch: false,
  };
}

export async function compressWithAi(args: {
  tailored: TailoredResume;
  tier: number;
  highKeywords: string[];
}): Promise<{ data: TailoredResume; usedDemo: boolean }> {
  if (isDemoMode()) {
    return {
      data: compressDeterministic(
        args.tailored,
        Math.max(args.tier, 3),
        args.highKeywords,
      ),
      usedDemo: true,
    };
  }

  const prompt = PROMPT_PLACEHOLDERS.compressForOnePage;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, {
      tier: String(args.tier),
      highKeywordsJson: JSON.stringify(args.highKeywords),
      contentJson: JSON.stringify(args.tailored),
    }),
    kind: "flash",
  });

  const data = TailoredResumeSchema.parse(parsed);
  // Always sanitize + ensure structure survived
  return {
    data: TailoredResumeSchema.parse({
      skillGroups: data.skillGroups.map((g) => ({
        ...g,
        label: sanitizePlainText(g.label),
        items: g.items.map(sanitizePlainText).filter(Boolean),
      })),
      experience: data.experience.map((e) => ({
        ...e,
        bullets: e.bullets.map((b) => ({
          ...b,
          text: ensureSingleCompleteSentence(b.text),
        })),
      })),
      notesForUser: [
        ...data.notesForUser.map(sanitizePlainText),
        `AI compress tier ${args.tier}.`,
      ],
    }),
    usedDemo: false,
  };
}

/**
 * Apply the right shrink strategy for a tier.
 * Tiers 1–3 / 5–6: deterministic. Tier 4: AI (falls back to deterministic).
 */
export async function applyCompressionTier(args: {
  tailored: TailoredResume;
  tier: number;
  highKeywords: string[];
}): Promise<{ data: TailoredResume; layout: LayoutCompressOpts; note: string }> {
  const layout = layoutOptsForTier(args.tier);
  let data = args.tailored;
  let note = `tier ${args.tier}`;

  if (args.tier <= 0) {
    return { data, layout, note: "tier 0 (no compress)" };
  }

  if (args.tier === 4) {
    try {
      const ai = await compressWithAi(args);
      data = ai.data;
      note = ai.usedDemo
        ? "tier 4 demo compress"
        : "tier 4 AI compress";
    } catch {
      data = compressDeterministic(args.tailored, 4, args.highKeywords);
      note = "tier 4 AI failed → deterministic fallback";
    }
  } else {
    data = compressDeterministic(args.tailored, args.tier, args.highKeywords);
    note = `tier ${args.tier} deterministic`;
  }

  return { data, layout, note };
}
