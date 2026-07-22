import { z } from "zod";
import { filterConcreteStackKeywords } from "@/lib/resume/keywordQuality";

export const TailorModeSchema = z.enum([
  "aggressive_fabrication",
  "middle_ground",
  "mild_nudging",
  "use_original",
]);
export type TailorMode = z.infer<typeof TailorModeSchema>;

export const RoleFamilySchema = z.enum([
  "ml",
  "swe",
  "data_science",
  "other",
]);
export type RoleFamily = z.infer<typeof RoleFamilySchema>;

export const WorkArrangementSchema = z.enum([
  "remote",
  "hybrid",
  "onsite",
  "unspecified",
]);
export type WorkArrangement = z.infer<typeof WorkArrangementSchema>;

export const SenioritySchema = z.enum([
  "intern",
  "new_grad",
  "mid",
  "senior",
  "staff_plus",
  "unspecified",
]);
export type Seniority = z.infer<typeof SenioritySchema>;

export const KeywordBucketSchema = z.object({
  term: z.string(),
  importance: z.enum(["high", "low"]),
  rationale: z.string().optional(),
});
export type KeywordBucket = z.infer<typeof KeywordBucketSchema>;

/** Suggestions produced by JD parse — used to prefill UI controls. */
export const JdSuggestionsSchema = z.object({
  title: z.string().default(""),
  company: z.string().nullable().default(null),
  location: z.string().default(""),
  roleFamily: RoleFamilySchema.default("other"),
  seniority: SenioritySchema.default("unspecified"),
  workArrangement: WorkArrangementSchema.default("unspecified"),
  modeHint: TailorModeSchema.nullable().default(null),
  modeHintReason: z.string().nullable().default(null),
  notes: z.array(z.string()).default([]),
});
export type JdSuggestions = z.infer<typeof JdSuggestionsSchema>;

export const KeywordExtractSchema = z.object({
  /** Concrete named stack (languages, frameworks, tools) — skills-line eligible. */
  mustHaveHigh: z.array(z.string()).default([]),
  niceToHaveLow: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  /**
   * Broad JD work themes (full-stack, testing, deployment, …).
   * Bullet direction only — never injected as skill-line items.
   */
  themes: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  raw: z.array(KeywordBucketSchema).default([]),
});
export type KeywordExtract = z.infer<typeof KeywordExtractSchema>;

/** Concrete stack terms used for ATS coverage & must-keep during compress. */
export function stackKeywordsForAts(keywords: KeywordExtract): string[] {
  return filterConcreteStackKeywords([
    ...keywords.mustHaveHigh,
    ...keywords.tools,
  ]);
}

/** Sparse JD: few concrete stack terms — tailor should lean on themes + master. */
export function isSparseKeywordJd(keywords: KeywordExtract): boolean {
  return stackKeywordsForAts(keywords).length < 3;
}

export const GapAnalysisSchema = z.object({
  overlaps: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  stretch: z.array(z.string()).default([]),
  doNotClaim: z.array(z.string()).default([]),
  /** Themes satisfied by master evidence (not literal phrase matches). */
  themesCovered: z.array(z.string()).default([]),
});
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;

export const TailoredBulletSchema = z.object({
  id: z.string(),
  text: z.string(),
  priority: z.enum(["high", "med", "low"]).default("med"),
  keywords: z.array(z.string()).default([]),
});

export const TailoredExperiencePatchSchema = z.object({
  id: z.string(),
  bullets: z.array(TailoredBulletSchema),
});

export const TailoredSkillGroupSchema = z.object({
  groupId: z.string(),
  label: z.string(),
  items: z.array(z.string()),
});

export const TailoredResumeSchema = z.object({
  skillGroups: z.array(TailoredSkillGroupSchema).default([]),
  experience: z.array(TailoredExperiencePatchSchema).default([]),
  notesForUser: z.array(z.string()).default([]),
});
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

export const AtsScoreSchema = z.object({
  coverageHigh: z.number().min(0).max(1).default(0),
  presentHigh: z.array(z.string()).default([]),
  missingHigh: z.array(z.string()).default([]),
});
export type AtsScore = z.infer<typeof AtsScoreSchema>;

export const ChangeSummarySchema = z.object({
  headline: z.string().default(""),
  bullets: z.array(z.string()).default([]),
  keywordsAdded: z.array(z.string()).default([]),
  sectionsTouched: z.array(z.string()).default([]),
});
export type ChangeSummary = z.infer<typeof ChangeSummarySchema>;

export const OnePageGateSchema = z.object({
  accepted: z.boolean(),
  pageCount: z.number().int().nonnegative(),
  tierReached: z.number().int().nonnegative(),
  message: z.string(),
});
export type OnePageGate = z.infer<typeof OnePageGateSchema>;

export const TailorControlsSchema = z.object({
  mode: TailorModeSchema,
  roleFamily: RoleFamilySchema,
  location: z.string(),
  seniority: SenioritySchema,
  workArrangement: WorkArrangementSchema,
  /**
   * Aggressive only: minimum concrete stack coverage before accepting
   * (triggers one hard-inject + recompile retry if below).
   */
  aggressiveCoverageTarget: z
    .union([
      z.literal(0.7),
      z.literal(0.8),
      z.literal(0.9),
      z.literal(1),
    ])
    .optional()
    .default(0.8),
  /** Stack terms to preserve during compress / prioritize for ATS. */
  pinnedKeywords: z.array(z.string()).optional().default([]),
  /** Aggressive: force into skills on next cascade (UI chip action). */
  forceInjectKeywords: z.array(z.string()).optional().default([]),
  /**
   * Which master archetype to tailor (template_{type}.tex + master_resume_{type}.json).
   * Server re-validates against files on disk; falls back to "ml" when missing.
   */
  resumeType: z.string().optional().default("ml"),
});
export type TailorControls = z.infer<typeof TailorControlsSchema>;

export type AggressiveCoverageTarget =
  TailorControls["aggressiveCoverageTarget"];

export const AGGRESSIVE_COVERAGE_OPTIONS: {
  value: AggressiveCoverageTarget;
  label: string;
}[] = [
  { value: 0.7, label: "70% — light fabrication" },
  { value: 0.8, label: "80% — standard (default)" },
  { value: 0.9, label: "90% — heavy fabrication" },
  { value: 1, label: "100% — full stack match" },
];

export const CascadeStepIdSchema = z.enum([
  "extract_keywords",
  "gap_analysis",
  "tailor",
  "latex_compile",
  "one_page_gate",
  "ats_score",
  "change_summary",
]);
export type CascadeStepId = z.infer<typeof CascadeStepIdSchema>;

export type CascadeStepResult = {
  id: CascadeStepId;
  label: string;
  status: "ok" | "stub" | "error" | "running" | "pending";
  summary: string;
  data: unknown;
};

export const CASCADE_STEP_ORDER: {
  id: CascadeStepId;
  label: string;
}[] = [
  { id: "extract_keywords", label: "Extract keywords" },
  { id: "gap_analysis", label: "Gap analysis" },
  { id: "tailor", label: "Tailor resume" },
  { id: "latex_compile", label: "LaTeX compile" },
  { id: "one_page_gate", label: "One-page hard gate" },
  { id: "ats_score", label: "ATS keyword coverage" },
  { id: "change_summary", label: "What changed" },
];

export const MODE_LABELS: Record<TailorMode, string> = {
  aggressive_fabrication: "Aggressive Fabrication",
  middle_ground: "Middle Ground",
  mild_nudging: "Mild Nudging",
  use_original: "Use Original",
};

export const ROLE_LABELS: Record<RoleFamily, string> = {
  ml: "Machine Learning",
  swe: "Software Engineering",
  data_science: "Data Science",
  other: "Other",
};
