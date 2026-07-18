import { loadMasterResume, sanitizePlainText, tailoredTextBlob } from "@/lib/resume/master";
import {
  filterConcreteStackKeywords,
  isConcreteStackKeyword,
} from "@/lib/resume/keywordQuality";
import {
  KeywordExtract,
  RoleFamily,
  TailoredResume,
  TailoredResumeSchema,
} from "@/lib/types";

function alreadyPresent(blob: string, term: string): boolean {
  return blob.toLowerCase().includes(term.toLowerCase());
}

/** Pick a skill group id for a fabricated keyword. */
function pickGroupId(term: string, availableIds: string[]): string {
  const t = term.toLowerCase();
  const prefer = (...ids: string[]) =>
    ids.find((id) => availableIds.includes(id));

  if (
    /redis|neo4j|postgres|mysql|mongo|dynamodb|cassandra|elastic|opensearch|pinecone|chroma|weaviate|faiss|sql\b|database|graph/i.test(
      t,
    )
  ) {
    return (
      prefer("databases_storage", "data_engineering_stack", "swe_stack") ??
      availableIds[0]
    );
  }
  if (
    /kubernet|k8s|docker|aws|azure|gcp|kafka|terraform|ansible|jenkins|prometheus|grafana|linux|ci\/?cd|git/i.test(
      t,
    )
  ) {
    return prefer("mlops_cloud", "swe_stack") ?? availableIds[0];
  }
  if (
    /pytorch|tensorflow|keras|scikit|pandas|numpy|spark|langchain|openai|gemini|huggingface|cuda|llm|rag/i.test(
      t,
    )
  ) {
    return (
      prefer("ai_ml_frameworks", "genai_agentic", "data_science_stack") ??
      availableIds[0]
    );
  }
  if (
    /react|angular|vue|next|node|express|django|flask|fastapi|spring|graphql|typescript|javascript/i.test(
      t,
    )
  ) {
    return prefer("swe_stack", "programming_languages") ?? availableIds[0];
  }
  if (/python|java|golang|\bgo\b|rust|c\+\+|sql|r\b/i.test(t)) {
    return prefer("programming_languages", "swe_stack") ?? availableIds[0];
  }
  return prefer("swe_stack", "mlops_cloud", "databases_storage") ?? availableIds[0];
}

export type HardInjectResult = {
  tailored: TailoredResume;
  injected: string[];
  skippedVague: string[];
};

/**
 * Aggressive mode only: force-append missing concrete stack keywords into
 * skill groups so ATS substring coverage can hit them.
 */
export async function hardInjectAggressiveKeywords(args: {
  tailored: TailoredResume;
  keywords: KeywordExtract;
  roleFamily: RoleFamily;
  /** Extra concrete terms to force (e.g. still-missing after a score). */
  forceTerms?: string[];
}): Promise<HardInjectResult> {
  const master = await loadMasterResume();
  const masterGroups = master.skills.groups.filter(
    (g) => g.id !== "soft_collaboration",
  );
  const availableIds = masterGroups.map((g) => g.id);

  const candidates = filterConcreteStackKeywords([
    ...args.keywords.mustHaveHigh,
    ...args.keywords.tools,
    ...(args.forceTerms ?? []),
  ]);

  const vagueSkipped = [
    ...args.keywords.mustHaveHigh,
    ...args.keywords.tools,
    ...(args.forceTerms ?? []),
  ].filter((t) => t.trim() && !isConcreteStackKeyword(t));

  let tailored = TailoredResumeSchema.parse({
    ...args.tailored,
    skillGroups: args.tailored.skillGroups.map((g) => ({
      ...g,
      items: g.items.map(sanitizePlainText).filter(Boolean),
    })),
  });

  // Ensure we have group shells from master if tailor returned a thin set
  if (tailored.skillGroups.length === 0) {
    tailored = TailoredResumeSchema.parse({
      ...tailored,
      skillGroups: masterGroups.slice(0, 4).map((g) => ({
        groupId: g.id,
        label: g.label,
        items: [...g.items],
      })),
    });
  }

  const blob = tailoredTextBlob(tailored);
  const injected: string[] = [];
  const groups = tailored.skillGroups.map((g) => ({
    ...g,
    items: [...g.items],
  }));

  for (const term of candidates) {
    if (alreadyPresent(blob, term) || alreadyPresent(groups.map((g) => g.items.join(" ")).join(" "), term)) {
      continue;
    }
    const groupId = pickGroupId(term, availableIds);
    let group = groups.find((g) => g.groupId === groupId);
    if (!group) {
      const masterG = masterGroups.find((g) => g.id === groupId);
      group = {
        groupId,
        label: masterG?.label ?? "Technical Skills",
        items: [],
      };
      groups.push(group);
    }
    const exists = group.items.some(
      (i) => i.toLowerCase() === term.toLowerCase(),
    );
    if (!exists) {
      group.items.push(term);
      injected.push(term);
    }
  }

  const notes = [...tailored.notesForUser];
  if (injected.length) {
    notes.push(
      `Aggressive hard-inject (fabricated skills): ${injected.join(", ")}.`,
    );
  }

  return {
    tailored: TailoredResumeSchema.parse({
      ...tailored,
      skillGroups: groups,
      notesForUser: notes,
    }),
    injected,
    skippedVague: [
      ...new Set(vagueSkipped.map((t) => t.trim()).filter(Boolean)),
    ],
  };
}

/** Local deterministic coverage over concrete terms (no LLM). */
export function coverageConcrete(
  tailored: TailoredResume,
  terms: string[],
): { coverage: number; present: string[]; missing: string[] } {
  const concrete = filterConcreteStackKeywords(terms);
  const blob = tailoredTextBlob(tailored).toLowerCase();
  const present = concrete.filter((k) => blob.includes(k.toLowerCase()));
  const missing = concrete.filter((k) => !blob.includes(k.toLowerCase()));
  return {
    coverage: concrete.length ? present.length / concrete.length : 1,
    present,
    missing,
  };
}
