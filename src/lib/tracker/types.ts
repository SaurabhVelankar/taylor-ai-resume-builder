import { z } from "zod";
import {
  RoleFamilySchema,
  SenioritySchema,
  TailorModeSchema,
  WorkArrangementSchema,
} from "@/lib/types";

/** Job-application lifecycle. */
export const APPLICATION_STATUSES = [
  "applied",
  "screen",
  "interview",
  "offer",
  "rejected",
  "ghosted",
] as const;

export const ApplicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
};

/** Concise "what changed" trace — the fabrication memory. */
export const ChangeSummaryTraceSchema = z
  .object({
    headline: z.string().default(""),
    bullets: z.array(z.string()).default([]),
    keywordsAdded: z.array(z.string()).default([]),
    sectionsTouched: z.array(z.string()).default([]),
  })
  .nullable();

/** One saved application (trace + tailored .tex source, no PDF). */
export const ApplicationRecordSchema = z.object({
  id: z.string(),
  // v1: pre multi-master. v2: adds resumeType/resumeTypeLabel. Both still parse.
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(2),
  appliedAt: z.string(), // ISO timestamp
  status: ApplicationStatusSchema.default("applied"),
  notes: z.string().default(""),

  // Job identity
  company: z.string().default(""),
  roleTitle: z.string().default(""),
  jdUrl: z.string().default(""),

  // Targeting
  roleFamily: RoleFamilySchema,
  seniority: SenioritySchema,
  workArrangement: WorkArrangementSchema,
  mode: TailorModeSchema,
  aggressiveTarget: z.number().nullable().default(null),

  // Multi-master: which archetype was tailored (template_{type}.tex).
  resumeType: z.string().default("ml"),
  resumeTypeLabel: z.string().default(""),

  // Location (all three can differ)
  detectedLocation: z.string().default(""),
  overrideLocation: z.string().default(""),
  headerLocation: z.string().default(""),

  // Keywords
  mustHaveHigh: z.array(z.string()).default([]),
  niceToHaveLow: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  pinnedKeywords: z.array(z.string()).default([]),
  forceInjectKeywords: z.array(z.string()).default([]),

  // ATS truth
  coverageHigh: z.number().nullable().default(null),
  presentHigh: z.array(z.string()).default([]),
  missingHigh: z.array(z.string()).default([]),

  // Fabrication memory
  changeSummary: ChangeSummaryTraceSchema.default(null),

  // Applied resume source — TeX ONLY (no PDF), stored inline (~7KB).
  texSource: z.string().default(""),
  texFilename: z.string().nullable().default(null),
});
export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>;

/** POST body: record minus server-assigned fields; status/notes optional. */
export const NewApplicationInputSchema = ApplicationRecordSchema.omit({
  id: true,
  appliedAt: true,
  schemaVersion: true,
}).extend({
  status: ApplicationStatusSchema.optional(),
  notes: z.string().optional(),
});
export type NewApplicationInput = z.infer<typeof NewApplicationInputSchema>;

/** PATCH body: currently editable fields (Phase 2 wiring). */
export const ApplicationPatchSchema = z.object({
  status: ApplicationStatusSchema.optional(),
  notes: z.string().optional(),
});
export type ApplicationPatch = z.infer<typeof ApplicationPatchSchema>;
