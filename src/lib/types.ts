import { z } from "zod";

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
  mustHaveHigh: z.array(z.string()).default([]),
  niceToHaveLow: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  raw: z.array(KeywordBucketSchema).default([]),
});
export type KeywordExtract = z.infer<typeof KeywordExtractSchema>;

export const GapAnalysisSchema = z.object({
  overlaps: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  stretch: z.array(z.string()).default([]),
  doNotClaim: z.array(z.string()).default([]),
});
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;

export const TailoredResumeSchema = z.object({
  summary: z.string().default(""),
  skillsBlurb: z.string().default(""),
  experienceBullets: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        priority: z.enum(["high", "med", "low"]).default("med"),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  notesForUser: z.array(z.string()).default([]),
});
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

export const AtsScoreSchema = z.object({
  coverageHigh: z.number().min(0).max(1).default(0),
  presentHigh: z.array(z.string()).default([]),
  missingHigh: z.array(z.string()).default([]),
});
export type AtsScore = z.infer<typeof AtsScoreSchema>;

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
});
export type TailorControls = z.infer<typeof TailorControlsSchema>;

export const CascadeStepIdSchema = z.enum([
  "extract_keywords",
  "gap_analysis",
  "tailor",
  "latex_compile",
  "one_page_gate",
  "ats_score",
]);
export type CascadeStepId = z.infer<typeof CascadeStepIdSchema>;

export type CascadeStepResult = {
  id: CascadeStepId;
  label: string;
  status: "ok" | "stub" | "error";
  summary: string;
  data: unknown;
};

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
