import type { TailoredResume } from "@/lib/types";

/**
 * STUB: Map tailored JSON into the frozen LaTeX template.
 * Real implementation will replace marker regions only.
 */
export function renderLatexStub(tailored: TailoredResume): string {
  return [
    "% generated stub — not compiled yet",
    `\\section*{Summary}`,
    tailored.summary,
    `\\section*{Skills}`,
    tailored.skillsBlurb,
    `\\section*{Experience}`,
    ...tailored.experienceBullets.map((b) => `\\item ${b.text}`),
  ].join("\n");
}
