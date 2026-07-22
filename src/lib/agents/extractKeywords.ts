import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  isNonStackPhrase,
  isThemeTerm,
  normalizeTerm,
} from "@/lib/resume/keywordQuality";
import {
  KeywordExtract,
  KeywordExtractSchema,
  RoleFamily,
} from "@/lib/types";

function dedupePreserve(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = normalizeTerm(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Keep concrete stack only; move theme-like phrases into themes; drop blocklists. */
export function filterExtract(data: KeywordExtract): KeywordExtract {
  const themesAccum: string[] = [];
  const takeStack = (arr: string[]): string[] => {
    const kept: string[] = [];
    for (const raw of arr) {
      const t = normalizeTerm(raw);
      if (!t || isNonStackPhrase(t)) continue;
      if (isThemeTerm(t)) {
        themesAccum.push(t);
        continue;
      }
      kept.push(t);
    }
    return kept;
  };

  for (const raw of data.themes ?? []) {
    const t = normalizeTerm(raw);
    if (!t || isNonStackPhrase(t)) continue;
    themesAccum.push(t);
  }

  return KeywordExtractSchema.parse({
    ...data,
    mustHaveHigh: dedupePreserve(takeStack(data.mustHaveHigh)),
    niceToHaveLow: dedupePreserve(takeStack(data.niceToHaveLow)),
    tools: dedupePreserve(takeStack(data.tools)),
    themes: dedupePreserve(themesAccum),
    softSkills: [],
    raw: (data.raw ?? []).filter((r) => {
      const t = normalizeTerm(r.term);
      return t && !isNonStackPhrase(t) && r.importance !== undefined;
    }),
  });
}

function mockExtract(jdText: string, _roleFamily: RoleFamily): KeywordExtract {
  const stackCandidates = [
    "Python",
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "SQL",
    "AWS",
    "Docker",
    "Kubernetes",
    "PyTorch",
    "TensorFlow",
    "LLM",
    "RAG",
    "Spark",
    "Airflow",
    "PostgreSQL",
    "CI/CD",
    "Redis",
    "Neo4j",
  ];
  const themeCandidates = [
    "full-stack",
    "testing",
    "deployment",
    "automation",
    "user interfaces",
    "AI tooling",
  ];
  const presentStack = stackCandidates.filter((c) =>
    new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(jdText),
  );
  const presentThemes = themeCandidates.filter((c) =>
    new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(jdText),
  );
  const high = presentStack.slice(
    0,
    Math.max(0, Math.ceil(presentStack.length * 0.6)),
  );
  const low = presentStack.slice(high.length);

  return filterExtract(
    KeywordExtractSchema.parse({
      mustHaveHigh: high,
      niceToHaveLow: low,
      tools: high.filter((t) =>
        /python|react|aws|docker|sql|pytorch|kubernetes|node|redis|neo4j/i.test(
          t,
        ),
      ),
      themes: presentThemes,
      softSkills: [],
      raw: [
        ...high.map((term) => ({ term, importance: "high" as const })),
        ...low.map((term) => ({ term, importance: "low" as const })),
        ...presentThemes.map((term) => ({
          term,
          importance: "low" as const,
          rationale: "theme",
        })),
      ],
    }),
  );
}

export async function extractKeywords(args: {
  jdText: string;
  roleFamily: RoleFamily;
}): Promise<{ data: KeywordExtract; usedDemo: boolean }> {
  if (isDemoMode()) {
    return {
      data: mockExtract(args.jdText, args.roleFamily),
      usedDemo: true,
    };
  }

  const prompt = PROMPT_PLACEHOLDERS.extractKeywords;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, {
      jdText: args.jdText,
      roleFamily: args.roleFamily,
    }),
    kind: "flash",
  });

  return {
    data: filterExtract(KeywordExtractSchema.parse(parsed)),
    usedDemo: false,
  };
}
