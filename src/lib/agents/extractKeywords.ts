import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  KeywordExtract,
  KeywordExtractSchema,
  RoleFamily,
} from "@/lib/types";

function mockExtract(jdText: string, roleFamily: RoleFamily): KeywordExtract {
  const candidates = [
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
    "Prisma",
    "PostgreSQL",
    "CI/CD",
    "System Design",
    "A/B testing",
  ];
  const present = candidates.filter((c) =>
    new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(jdText),
  );
  const high = present.slice(0, Math.max(3, Math.ceil(present.length * 0.6)));
  const low = present.slice(high.length);

  return KeywordExtractSchema.parse({
    mustHaveHigh: high.length ? high : ["communication", roleFamily],
    niceToHaveLow: low.length ? low : ["ownership"],
    tools: high.filter((t) => /python|react|aws|docker|sql|pytorch/i.test(t)),
    softSkills: ["communication", "collaboration"].filter((s) =>
      new RegExp(s, "i").test(jdText),
    ),
    raw: [
      ...high.map((term) => ({ term, importance: "high" as const })),
      ...low.map((term) => ({ term, importance: "low" as const })),
    ],
  });
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

  return { data: KeywordExtractSchema.parse(parsed), usedDemo: false };
}
