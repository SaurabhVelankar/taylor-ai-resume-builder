import { readFile } from "fs/promises";
import { TailoredResumeSchema, type RoleFamily, type TailoredResume } from "@/lib/types";
import { DEFAULT_RESUME_TYPE, masterPathFor } from "@/lib/resume/resumeTypes";

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

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function slugifyId(parts: string[], fallback: string): string {
  const base = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

/** Accept both the internal bullet shape and JSON-Resume `highlights`. */
function normalizeBullets(raw: Record<string, unknown>): MasterBullet[] {
  const src = Array.isArray(raw.bullets)
    ? raw.bullets
    : Array.isArray(raw.highlights)
      ? raw.highlights
      : [];
  return src
    .map((b, i): MasterBullet => {
      if (typeof b === "string") return { id: `b${i}`, text: b, keywords: [] };
      const o = (b ?? {}) as Record<string, unknown>;
      return {
        id: asStr(o.id) || `b${i}`,
        text: asStr(o.text) || asStr(o.summary),
        priority: typeof o.priority === "string" ? o.priority : undefined,
        keywords: Array.isArray(o.keywords)
          ? o.keywords.filter((k): k is string => typeof k === "string")
          : [],
      };
    })
    .filter((b) => b.text.trim());
}

/** Map an experience entry from either the internal shape or JSON-Resume. */
function normalizeExperience(
  raw: unknown,
  i: number,
): MasterExperience {
  const o = (raw ?? {}) as Record<string, unknown>;
  const title = asStr(o.title) || asStr(o.position) || asStr(o.role);
  const organization = asStr(o.organization) || asStr(o.company);
  return {
    id: asStr(o.id) || slugifyId([organization, title], `exp-${i}`),
    title,
    organization,
    location: asStr(o.location),
    start: asStr(o.start) || asStr(o.startDate),
    end: asStr(o.end) || asStr(o.endDate),
    link:
      typeof o.link === "string"
        ? o.link
        : typeof o.url === "string"
          ? o.url
          : null,
    bullets: normalizeBullets(o),
  };
}

function normalizeSkillGroup(raw: unknown, i: number): MasterSkillGroup {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: asStr(o.id) || `group_${i}`,
    label: asStr(o.label) || asStr(o.name) || "Skills",
    altLabels:
      o.altLabels && typeof o.altLabels === "object"
        ? (o.altLabels as Record<string, string>)
        : undefined,
    items: Array.isArray(o.items)
      ? o.items.filter((x): x is string => typeof x === "string")
      : [],
    includeByDefault:
      typeof o.includeByDefault === "boolean" ? o.includeByDefault : undefined,
  };
}

/** Accept `skillsGroupIds` or JSON-Resume-ish `sections.skills.groups`. */
function normalizePresets(
  raw: unknown,
): MasterResume["roleFamilyPresets"] {
  const out = {} as MasterResume["roleFamilyPresets"];
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const v = (value ?? {}) as Record<string, unknown>;
      const nested = (v.sections as Record<string, unknown> | undefined)?.skills;
      const groups = (nested as Record<string, unknown> | undefined)?.groups;
      const ids = Array.isArray(v.skillsGroupIds)
        ? v.skillsGroupIds
        : Array.isArray(groups)
          ? groups
          : [];
      (out as Record<string, unknown>)[key] = {
        skillsGroupIds: ids.filter((x): x is string => typeof x === "string"),
        notes: typeof v.notes === "string" ? v.notes : undefined,
      };
    }
  }
  // Guarantee a fallback bucket so preset lookups never dereference undefined.
  if (!(out as Record<string, unknown>).other) {
    (out as Record<string, unknown>).other = { skillsGroupIds: [] };
  }
  return out;
}

/**
 * Coerce a parsed master JSON into the internal MasterResume shape.
 * Tolerates common LLM output variance (JSON-Resume field names) so a
 * model-generated master still renders instead of crashing on undefined.
 */
export function normalizeMasterResume(raw: unknown): MasterResume {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const experience = Array.isArray(r.experience)
    ? r.experience.map(normalizeExperience)
    : [];
  const skillsSrc = (r.skills as Record<string, unknown> | undefined)?.groups;
  const groups = Array.isArray(skillsSrc)
    ? skillsSrc.map(normalizeSkillGroup)
    : [];
  return {
    experience,
    skills: { groups },
    roleFamilyPresets: normalizePresets(r.roleFamilyPresets),
  };
}

export async function loadMasterResume(
  resumeType: string = DEFAULT_RESUME_TYPE,
): Promise<MasterResume> {
  const filePath = masterPathFor(resumeType);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new Error(
      `Master resume for type "${resumeType}" not found. Run Make MetaData to build master_resume_${resumeType}.json.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`master_resume_${resumeType}.json is not valid JSON.`);
  }

  const master = normalizeMasterResume(parsed);
  if (master.experience.length === 0 || master.skills.groups.length === 0) {
    throw new Error(
      `master_resume_${resumeType}.json is malformed: expected experience[].{title,organization,bullets|highlights} and skills.groups[]. Re-run Make MetaData for "${resumeType}".`,
    );
  }
  return master;
}

const BULLET_PRIORITIES = new Set(["high", "med", "low"]);

/**
 * Identity transform: master resume → TailoredResume, verbatim (no AI).
 * Used by "Use Original" mode so the master compiles as-is with zero tokens.
 */
export function originalTailoredResume(master: MasterResume): TailoredResume {
  return TailoredResumeSchema.parse({
    skillGroups: master.skills.groups
      .filter((g) => g.id !== "soft_collaboration")
      .map((g) => ({
        groupId: g.id,
        label: g.label,
        items: g.items,
      })),
    experience: master.experience.map((job) => ({
      id: job.id,
      bullets: job.bullets.map((b) => ({
        id: b.id,
        text: b.text,
        priority: BULLET_PRIORITIES.has(b.priority ?? "")
          ? (b.priority as "high" | "med" | "low")
          : "med",
        keywords: b.keywords ?? [],
      })),
    })),
    notesForUser: [
      "Use Original — no AI tailoring; compiled your master resume as-is.",
    ],
  });
}

/** Strip markdown / rich-text junk before LaTeX. */
export function sanitizePlainText(text: string): string {
  if (typeof text !== "string") return "";
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
      master.roleFamilyPresets.other?.skillsGroupIds ??
      [];
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
