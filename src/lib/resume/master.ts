import { readFile } from "fs/promises";
import path from "path";
import type { RoleFamily, TailoredResume } from "@/lib/types";

export type MasterBullet = {
  id: string;
  text: string;
  priority?: string;
  keywords?: string[];
};

export type MasterExperience = {
  id: string;
  title: string;
  organization: string;
  location: string;
  start: string;
  end: string;
  link?: string | null;
  bullets: MasterBullet[];
};

export type MasterSkillGroup = {
  id: string;
  label: string;
  altLabels?: Record<string, string>;
  items: string[];
  includeByDefault?: boolean;
};

export type MasterResume = {
  experience: MasterExperience[];
  skills: { groups: MasterSkillGroup[] };
  roleFamilyPresets: Record<
    RoleFamily,
    { skillsGroupIds: string[]; notes?: string }
  >;
};

export async function loadMasterResume(): Promise<MasterResume> {
  const raw = await readFile(
    path.join(process.cwd(), "data", "master_resume.json"),
    "utf8",
  );
  return JSON.parse(raw) as MasterResume;
}

/** Strip markdown / rich-text junk before LaTeX. */
export function sanitizePlainText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DANGLING_TAIL =
  /\b(to|that|and|or|with|for|of|our|a|an|the|these|this|as|into|from|by|on|in|at|which|who|whose|than|then|also|including|via|using|such)$/i;

/** Trailing gerund clause with no object — e.g. ", contributing" / ", leveraging". */
const INCOMPLETE_GERUND_CLAUSE = /,\s+[A-Za-z]+ing\.?$/;

function finalizeSentence(raw: string): string {
  let t = raw.trim();
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(INCOMPLETE_GERUND_CLAUSE, "")
      .replace(DANGLING_TAIL, "")
      .replace(/[,:;–—-]+$/g, "")
      .trim();
    if (next === t) break;
    t = next;
  }
  if (t && !/[.!?]$/.test(t)) t = `${t}.`;
  return t;
}

/**
 * One complete English sentence per bullet — no ellipsis mid-thought dumps.
 * If multiple sentences exist, keep the first. Optionally enforce max length
 * by cutting at a clause boundary and ending with a period (never "…").
 */
export function ensureSingleCompleteSentence(
  text: string,
  maxChars?: number,
): string {
  let t = sanitizePlainText(text)
    .replace(/…+/g, "")
    .replace(/\.{3,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return t;

  // Prefer the first complete sentence when the model wrote two+.
  const first = t.match(/^(.+?[.!?])(?:\s+|$)/);
  if (first) {
    const rest = t.slice(first[1].length).trim();
    if (rest.length > 0) t = first[1].trim();
  }

  if (maxChars != null && t.length > maxChars) {
    let cut = t.slice(0, maxChars);
    const boundary = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("! "),
      cut.lastIndexOf("? "),
      cut.lastIndexOf("; "),
      cut.lastIndexOf(", "),
      cut.lastIndexOf(" "),
    );
    cut = (boundary > 40 ? cut.slice(0, boundary) : cut).trim();
    t = cut;
  }

  return finalizeSentence(t);
}

export function escapeLatex(text: string): string {
  const plain = sanitizePlainText(text);
  return plain
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/</g, "\\textless{}")
    .replace(/>/g, "\\textgreater{}");
}

export function resolveSkillLabel(
  group: MasterSkillGroup,
  roleFamily: RoleFamily,
): string {
  return group.altLabels?.[roleFamily] ?? group.label;
}

export function mergeTailoredResume(
  master: MasterResume,
  tailored: TailoredResume,
  roleFamily: RoleFamily,
): {
  skillGroups: { label: string; items: string[] }[];
  experience: MasterExperience[];
} {
  const patchByExp = new Map(tailored.experience.map((e) => [e.id, e.bullets]));

  const experience = master.experience.map((job) => {
    const patched = patchByExp.get(job.id);
    if (!patched?.length) return job;
    return {
      ...job,
      bullets: patched.map((b) => ({
        id: b.id,
        text: ensureSingleCompleteSentence(b.text),
        priority: b.priority,
        keywords: b.keywords,
      })),
    };
  });

  let skillGroups: { label: string; items: string[] }[];
  if (tailored.skillGroups.length > 0) {
    skillGroups = tailored.skillGroups.map((g) => ({
      label: sanitizePlainText(g.label),
      items: g.items.map(sanitizePlainText).filter(Boolean),
    }));
  } else {
    const presetIds =
      master.roleFamilyPresets[roleFamily]?.skillsGroupIds ??
      master.roleFamilyPresets.other.skillsGroupIds;
    skillGroups = presetIds
      .map((id) => master.skills.groups.find((g) => g.id === id))
      .filter((g): g is MasterSkillGroup => Boolean(g))
      .filter((g) => g.id !== "soft_collaboration")
      .map((g) => ({
        label: resolveSkillLabel(g, roleFamily),
        items: g.items.map(sanitizePlainText),
      }));
  }

  return { skillGroups, experience };
}

export function tailoredTextBlob(tailored: TailoredResume): string {
  const parts: string[] = [];
  for (const g of tailored.skillGroups) {
    parts.push(g.label, g.items.join(", "));
  }
  for (const exp of tailored.experience) {
    for (const b of exp.bullets) {
      parts.push(sanitizePlainText(b.text));
    }
  }
  return parts.join("\n");
}
