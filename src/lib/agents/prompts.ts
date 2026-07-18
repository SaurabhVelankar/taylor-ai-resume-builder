/**
 * Multi-agent cascade prompts.
 * Keep succinct; each agent returns JSON only (caller sets responseMimeType).
 */

export const PROMPT_PLACEHOLDERS = {
  parseJd: {
    id: "parse_jd",
    system: `Extract job-posting metadata for UI prefills. Reply with JSON only (no markdown).

Schema:
{
  "title": string,
  "company": string|null,
  "location": string,
  "roleFamily": "ml"|"swe"|"data_science"|"other",
  "seniority": "intern"|"new_grad"|"mid"|"senior"|"staff_plus"|"unspecified",
  "workArrangement": "remote"|"hybrid"|"onsite"|"unspecified",
  "modeHint": "aggressive_fabrication"|"middle_ground"|"mild_nudging"|"use_original"|null,
  "modeHintReason": string|null,
  "notes": string[]
}

Rules:
- Prefer evidence in the JD; use "unspecified"/""/null when unclear.
- roleFamily: ml (ML/LLM/CV/research training), data_science (stats/analytics/experimentation), swe (software/backend/frontend/platform), else other.
- location: city/region string as written (or "Remote" if clearly remote-only).
- company: employer/hiring company name only (e.g. "Amazon", "Google", "Acme Corp"). null if not stated. Strip suffixes like "Inc." only if redundant; keep recognizable brand. Not the job board (LinkedIn, Greenhouse). Look for "at Company", "Company Name:", header/footer, or title patterns like "Role — Company".
- modeHint is optional advice only — never required. Prefer null unless JD is extremely keyword-dense (middle_ground) or explicitly researchy/vague (mild_nudging). Do NOT suggest aggressive_fabrication.
- notes: short caveats only (gated posting, sparse JD, etc.).`,
    userTemplate: `Parse this job description into the schema.

--- JD ---
{{jdText}}
--- END JD ---`,
  },

  extractKeywords: {
    id: "extract_keywords",
    system: `Extract ATS-oriented TECHNICAL keywords from a JD. JSON only.

Schema:
{
  "mustHaveHigh": string[],
  "niceToHaveLow": string[],
  "tools": string[],
  "themes": string[],
  "softSkills": [],
  "raw": [{"term": string, "importance": "high"|"low", "rationale"?: string}]
}

Rules:
- Split CONCRETE STACK vs THEMES:
  - mustHaveHigh / niceToHaveLow / tools: NAMED technologies only — languages, frameworks, libraries, cloud products, databases, concrete tools (e.g. Python, Kubernetes, React, PostgreSQL, Docker, PyTorch).
  - themes: broad work areas from the JD used for bullet reframing only (e.g. full-stack, testing, deployment, automation, user interfaces, AI tooling). NEVER put themes into mustHaveHigh/niceToHaveLow/tools.
- NEVER extract soft skills (communication, teamwork, leadership, collaboration, problem-solving, ownership, etc.). Always return softSkills: [].
- NEVER extract vague baseline phrases as stack OR themes: computer science fundamentals, CS fundamentals, algorithms (alone), data structures (alone), "software", "systems", "data", "programming", "technical skills", etc. Omit them entirely.
- Use exact JD phrases when possible (ATS match), normalize lightly (e.g. "Node JS" → "Node.js").
- mustHaveHigh: required named stack. niceToHaveLow: preferred/bonus named stack.
- tools: concrete tech subset of high+low.
- themes: short JD theme phrases (dedupe). Cap ≤12.
- If the JD names almost no real tools, leave mustHaveHigh/tools sparse and fill themes instead — do NOT invent Kubernetes/etc. or fill with category words.
- Bias toward the given roleFamily.
- Cap roughly: ≤20 high, ≤20 low. raw covers stack lists (and can note theme terms with rationale "theme").`,
    userTemplate: `Role family: {{roleFamily}}

--- JD ---
{{jdText}}
--- END JD ---`,
  },

  gapAnalysis: {
    id: "gap_analysis",
    system: `Compare JD keywords to the candidate master resume. JSON only.

Schema:
{
  "overlaps": string[],
  "missing": string[],
  "stretch": string[],
  "doNotClaim": string[],
  "themesCovered": string[]
}

Rules:
- Focus overlaps/missing/stretch on CONCRETE STACK from keywords.mustHaveHigh + keywords.tools (and niceToHaveLow as stretch candidates). Ignore soft skills and vague baseline phrases.
- overlaps: named stack clearly supported by master experience/skills/projects.
- missing: JD high stack with no support in master.
- stretch: plausible adjacent/weaker support (same family of work, not inventing careers).
- doNotClaim: items the resume must not invent (seniority leaps, employer fake tools, credentials not present).
- themesCovered: for each keywords.themes item that master evidence can support, write a short note like "deployment → Docker/Kubernetes in exp-…". Do NOT require the literal theme phrase to appear on the resume.
- If stack lists are sparse, lean on themesCovered + overlaps from master stack relevant to roleFamily.
- Respect mode: use_original/mild_nudging → stricter doNotClaim; middle_ground → allow stretch; aggressive_fabrication → still list doNotClaim for illegal/unsafe claims (fake employers, fake degrees).
- Be concise; lists of short strings only.`,
    userTemplate: `Mode: {{mode}}

Keywords:
{{keywordsJson}}

Master resume:
{{masterResumeJson}}`,
  },

  tailor: {
    id: "tailor",
    system: `Tailor resume content for one JD. JSON only — structured patches, NOT LaTeX, NOT markdown.

Schema:
{
  "skillGroups": [{"groupId": string, "label": string, "items": string[]}],
  "experience": [{"id": string, "bullets": [{"id": string, "text": string, "priority": "high"|"med"|"low", "keywords": string[]}]}],
  "notesForUser": string[]
}

CRITICAL RULES:
- Plain text ONLY. No markdown: no **bold**, no *italic*, no backticks, no # headers.
- NO personal summary / objective / "I am a… passionate about…" — do not output any summary field.
- Preserve master resume STRUCTURE: every experience entry uses the SAME id as master (e.g. exp-nyu-frl). Keep job titles/orgs/dates unchanged — only rewrite bullet text inside each job.
- Do NOT invent fake section labels like "Tailored emphasis" or "Tailored skills".
- BULLETS: each bullet text MUST be exactly ONE complete English sentence. End with a period. No ellipsis (…), no mid-thought cutoffs, no second sentence tacked on. Prefer dense metrics + tools in that single sentence.
- skillGroups: use master skills.groups ids + labels (or altLabels for roleFamily). Reorder/add ONLY concrete named stack (mustHaveHigh/tools/niceToHaveLow). Never add soft skills, themes, or vague baselines (CS fundamentals, algorithms alone, "software", "full-stack", "testing", "deployment", etc.) as skill-line items.
- themes (keywords.themes): steer which experience bullets to emphasize/reframe. Prove themes with real evidence and named tools already in master — do not paste theme phrases into skills.
- Sparse JD (few concrete stack terms): prioritize theme-aligned bullet rewrites using master stack; leave skill groups close to master (reorder only); notesForUser may say "sparse JD — emphasized themes via existing stack".
- Each experience[].bullets must map to real bullet ids from master where possible; same bullet count per job unless mode allows dropping low-priority bullets.
- Never add employers, degrees, or dates not in master.

Modes:
- use_original: minimal bullet edits; reorder keywords only.
- mild_nudging: synonym/reorder/light emphasis of true overlaps.
- middle_ground: reframe true experience toward JD; weave high keywords where truthful.
- aggressive_fabrication: MUST place every concrete named stack term from mustHaveHigh + tools into skillGroups (or a truthful-ish bullet). Fabricate named tools the master lacks (Redis, Neo4j, etc.). List every fabrication in notesForUser. Never put vague category phrases on the skills line ("Databases", "data storage solutions", "graph databases" as a category, themes). A post-process will also hard-inject any concrete leftovers.

notesForUser: warnings only (fabrications, skipped keywords, sparse JD).`,
    userTemplate: `Controls:
{{controlsJson}}

Gap:
{{gapJson}}

Keywords:
{{keywordsJson}}

Master:
{{masterResumeJson}}

JD:
{{jdText}}`,
  },

  atsScore: {
    id: "ats_score",
    system: `Score CONCRETE stack keyword presence in tailored resume text. JSON only.

Schema:
{
  "coverageHigh": number,
  "presentHigh": string[],
  "missingHigh": string[]
}

Rules:
- Input list is named stack only (not themes, not soft skills, not "CS fundamentals").
- Case-insensitive substring/match on tailored text.
- coverageHigh = presentHigh.length / highKeywords.length (0 if no high keywords).
- presentHigh + missingHigh partition the input list (no extras).
- Do not invent extra keywords to score.`,
    userTemplate: `High keywords:
{{highKeywordsJson}}

Tailored text:
{{tailoredText}}`,
  },

  compressForOnePage: {
    id: "compress_one_page",
    system: `Shrink tailored resume content after a confirmed multi-page PDF. JSON only.

Return same schema as tailor:
{
  "skillGroups": [{"groupId": string, "label": string, "items": string[]}],
  "experience": [{"id": string, "bullets": [{"id": string, "text": string, "priority": "high"|"med"|"low", "keywords": string[]}]}],
  "notesForUser": string[]
}

Plain text only — no markdown. No summary. Keep experience job ids and skill group structure.

BULLETS: each bullet MUST remain exactly ONE complete English sentence ending with a period. Never truncate with ellipsis (…). If shortening, rewrite the whole sentence denser — do not cut mid-clause ("contributing to…", "that…", "our…").

Rules by tier (higher = more aggressive):
- 1: shorten bullet wording only (still one full sentence each).
- 2: drop priority=low bullets first.
- 3: cut weakest med bullets; trim skill group items.
- 4+: keep only high-priority bullets needed for must-have keywords.

Preserve must-have keywords. notesForUser: what was cut.`,
    userTemplate: `Compression tier: {{tier}}

Must-keep high keywords:
{{highKeywordsJson}}

Current content:
{{contentJson}}`,
  },

  makeMetadata: {
    id: "make_metadata",
    system: `Rebuild master_resume.json from resume LaTeX. JSON only — full object, not a diff.

Preserve exact wording from LaTeX (bullets, titles, dates, skills). Do not invent jobs/degrees/metrics.

Required top-level keys (keep/extend existing shape):
basics, summary, objective, skills.groups[], education[], experience[], projects[], research[],
publications[], affiliations[], certifications[], awards[], coursework_highlights[],
sectionOrder, roleFamilyPresets, meta.

skills.groups items:
{id, label, items[], roleRelevance[], altLabels?, includeByDefault?, notes?}
Include groups useful for ml / data_science / swe / data_engineering (altLabels for label swaps).

Experience/projects/research bullets:
{id, text, priority: "high"|"med"|"low", keywords: string[]}

Use existing JSON as schema guide; refresh content from LaTeX; keep useful empty optional sections.
meta.sourceTemplate = "data/template.tex"; set meta.lastMakeMetadata timestamp note.`,
    userTemplate: `Fill/replace master resume JSON from LaTeX. Prefer this schema/shape:

--- EXISTING master_resume.json ---
{{existingMasterJson}}
--- END EXISTING ---

--- RAW LaTeX ---
{{latexSource}}
--- END LaTeX ---`,
  },

  changeSummary: {
    id: "change_summary",
    system: `Summarize what the tailor step changed vs the master resume, for the user. JSON only.

Schema:
{
  "headline": string,
  "bullets": string[],
  "keywordsAdded": string[],
  "sectionsTouched": string[]
}

Rules:
- Write like a short briefing: "I added keyword X in Skills…", "Reframed Experience bullets toward…".
- bullets: 3–7 concrete changes (named stack in skills, theme-driven bullet rewrites, things skipped).
- keywordsAdded: concrete stack terms from mustHaveHigh/tools that now appear in tailored text — not themes or vague baselines.
- If keywords.themes were used, mention how bullets were aligned (without claiming themes were added as skills).
- sectionsTouched: e.g. skills, experience (never "summary").
- Be honest about aggressive_fabrication / stretch. No fluff. Plain text, no markdown.`,
    userTemplate: `Controls:
{{controlsJson}}

Keywords:
{{keywordsJson}}

Gap:
{{gapJson}}

Tailored output:
{{tailoredJson}}

Master (for comparison):
{{masterResumeJson}}`,
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
