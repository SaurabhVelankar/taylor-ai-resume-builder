import type { RoleFamily } from "@/lib/types";

/** Fallback archetype when nothing is selected/detected/valid. */
export const DEFAULT_RESUME_TYPE = "ml";

/** Type slugs must be filesystem-safe (they map to template_{slug}.tex). */
export const RESUME_TYPE_SLUG_RE = /^[a-z0-9_]+$/;

export function isValidResumeTypeSlug(type: string): boolean {
  return RESUME_TYPE_SLUG_RE.test(type);
}

const LABELS: Record<string, string> = {
  ml: "Machine Learning",
  ds: "Data Science",
  swe: "Software Engineering",
  data: "Data",
  other: "Other",
};

/** Human label for a type slug (falls back to upper-cased slug). */
export function resumeTypeLabel(type: string): string {
  return LABELS[type] ?? type.toUpperCase();
}

/** Deterministic role-family → resume-type mapping (no AI). */
export function resumeTypeFromRoleFamily(roleFamily: RoleFamily): string {
  switch (roleFamily) {
    case "ml":
      return "ml";
    case "data_science":
      return "ds";
    case "swe":
      return "swe";
    default:
      return DEFAULT_RESUME_TYPE;
  }
}
