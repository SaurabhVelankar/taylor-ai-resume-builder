import { access, readdir } from "fs/promises";
import path from "path";
import {
  DEFAULT_RESUME_TYPE,
  isValidResumeTypeSlug,
  resumeTypeLabel,
} from "@/lib/resume/resumeTypeShared";

export {
  DEFAULT_RESUME_TYPE,
  isValidResumeTypeSlug,
  resumeTypeLabel,
  resumeTypeFromRoleFamily,
} from "@/lib/resume/resumeTypeShared";

const DATA_DIR = path.join(process.cwd(), "data");
const TEMPLATE_RE = /^template_([a-z0-9_]+)\.tex$/i;

export function templatePathFor(type: string): string {
  return path.join(DATA_DIR, `template_${type}.tex`);
}

export function masterPathFor(type: string): string {
  return path.join(DATA_DIR, `master_resume_${type}.json`);
}

export function masterBackupPathFor(type: string): string {
  return path.join(DATA_DIR, `master_resume_${type}.backup.json`);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export type ResumeTypeInfo = {
  type: string;
  label: string;
  /** Whether a master_resume_{type}.json already exists (Make MetaData ran). */
  hasMaster: boolean;
};

/**
 * Scan data/ for template_{type}.tex files. Each valid file = one archetype.
 * Default type (ml) is sorted first, then alphabetical.
 */
export async function discoverResumeTypes(): Promise<ResumeTypeInfo[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return [];
  }

  const slugs = [
    ...new Set(
      entries
        .map((f) => f.match(TEMPLATE_RE)?.[1]?.toLowerCase())
        .filter(
          (t): t is string => Boolean(t) && isValidResumeTypeSlug(t as string),
        ),
    ),
  ];

  const infos = await Promise.all(
    slugs.map(async (type) => ({
      type,
      label: resumeTypeLabel(type),
      hasMaster: await fileExists(masterPathFor(type)),
    })),
  );

  infos.sort((a, b) => {
    if (a.type === DEFAULT_RESUME_TYPE) return -1;
    if (b.type === DEFAULT_RESUME_TYPE) return 1;
    return a.type.localeCompare(b.type);
  });

  return infos;
}

/**
 * Validate a requested type slug and confirm its template exists on disk.
 * Falls back to DEFAULT_RESUME_TYPE when missing/invalid (path-traversal safe).
 */
export async function resolveResumeType(
  type: string | undefined | null,
): Promise<string> {
  const candidate = (type ?? "").toLowerCase().trim();
  if (
    candidate &&
    isValidResumeTypeSlug(candidate) &&
    (await fileExists(templatePathFor(candidate)))
  ) {
    return candidate;
  }
  return DEFAULT_RESUME_TYPE;
}
