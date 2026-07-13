/**
 * Prompt placeholders for the multi-agent cascade.
 * Curate real prompts later — do not put polished instruction text here yet.
 */

export const PROMPT_PLACEHOLDERS = {
  parseJd: {
    id: "parse_jd",
    system: "[PLACEHOLDER: PARSE_JD_SYSTEM] Instruct model to return JSON suggestions for location, roleFamily, seniority, workArrangement, title, company, optional modeHint.",
    userTemplate:
      "[PLACEHOLDER: PARSE_JD_USER]\n--- JD ---\n{{jdText}}\n--- END JD ---",
  },
  extractKeywords: {
    id: "extract_keywords",
    system:
      "[PLACEHOLDER: EXTRACT_KEYWORDS_SYSTEM] Extract must-have (high) vs nice-to-have (low) keywords/tools for ATS.",
    userTemplate:
      "[PLACEHOLDER: EXTRACT_KEYWORDS_USER]\nRole family: {{roleFamily}}\n--- JD ---\n{{jdText}}\n--- END JD ---",
  },
  gapAnalysis: {
    id: "gap_analysis",
    system:
      "[PLACEHOLDER: GAP_ANALYSIS_SYSTEM] Compare keyword pack to master resume JSON; list overlaps, missing, stretch, doNotClaim.",
    userTemplate:
      "[PLACEHOLDER: GAP_ANALYSIS_USER]\nMode: {{mode}}\nKeywords: {{keywordsJson}}\nMaster resume: {{masterResumeJson}}",
  },
  tailor: {
    id: "tailor",
    system:
      "[PLACEHOLDER: TAILOR_SYSTEM] Rewrite resume sections per mode + roleFamily; tag bullet priority; preserve truth policy for non-aggressive modes.",
    userTemplate:
      "[PLACEHOLDER: TAILOR_USER]\nControls: {{controlsJson}}\nGap: {{gapJson}}\nKeywords: {{keywordsJson}}\nMaster: {{masterResumeJson}}\nJD: {{jdText}}",
  },
  atsScore: {
    id: "ats_score",
    system:
      "[PLACEHOLDER: ATS_SCORE_SYSTEM] Check which high-importance keywords appear in tailored text; return coverage.",
    userTemplate:
      "[PLACEHOLDER: ATS_SCORE_USER]\nHigh keywords: {{highKeywordsJson}}\nTailored text: {{tailoredText}}",
  },
  compressForOnePage: {
    id: "compress_one_page",
    system:
      "[PLACEHOLDER: COMPRESS_ONE_PAGE_SYSTEM] Shorten bullets / drop low priority while keeping must-have keywords. Used only after hard PDF page overflow.",
    userTemplate:
      "[PLACEHOLDER: COMPRESS_ONE_PAGE_USER]\nTier: {{tier}}\nMissing page budget (confirmed overflow).\nContent: {{contentJson}}\nMust keep keywords: {{highKeywordsJson}}",
  },
} as const;

export type PromptId = keyof typeof PROMPT_PLACEHOLDERS;

export function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template,
  );
}
