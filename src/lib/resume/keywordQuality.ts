/**
 * Shared keyword quality: concrete named stack vs vague category phrases.
 * Used by extract filter, aggressive hard-inject, and ATS scoring.
 */

function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ");
}

/** Soft skills — never skills / ATS. */
const SOFT_SKILL_BLOCKLIST =
  /^(communication|collaboration|teamwork|team player|leadership|ownership|interpersonal|problem[- ]?solving|work ethic|detail[- ]oriented|self[- ]?starter|fast learner|adaptability|time management|critical thinking|verbal|written communication)$/i;

/** Baseline / category junk (CS fundamentals, "software", …). */
const VAGUE_BASELINE_BLOCKLIST =
  /^(computer science fundamentals?|cs fundamentals?|fundamentals of (computer )?science|software engineering fundamentals?|programming fundamentals?|technical skills?|computer science|software engineering|software|engineering|programming|coding|algorithms?|data structures?|systems?|data|technology|technologies|it|computer|computers|math(ematics)?|statistics?|analytics?|science|research|development|developer|engineering principles?|best practices?|modern software|clean code|object[- ]oriented|oop|solid principles?|sdlc|agile|scrum|kanban)$/i;

/**
 * Category phrases that look "technical" but are not named tools
 * (e.g. "Databases", "data storage solutions").
 */
const VAGUE_CATEGORY_PHRASE =
  /^(databases?|database\s+systems?|data\s+storage(\s+solutions?)?|storage\s+solutions?|data\s+solutions?|data\s+platforms?|data\s+management|cloud\s+(solutions?|platforms?|services?|technologies)|web\s+technologies|big\s+data|relational\s+databases?|nosql(\s+databases?)?|graph\s+databases?|sql\s+databases?|distributed\s+systems?|microservices?|design\s+patterns?|software\s+design|system\s+design|api\s+design|backend\s+systems?|frontend\s+systems?|enterprise\s+software|information\s+systems?|computer\s+networks?|operating\s+systems?)$/i;

/** Theme-like work areas (bullet direction, not skill-line inject). */
const THEME_TERM =
  /^(full[- ]?stack|front[- ]?end|back[- ]?end|testing|deployment|deployments|automation|user interfaces?|ui\/ux|ui|ux|ai tooling|ai tools?|devops|distributed systems?|microservices?|cloud(?:[- ]native)?|machine learning|deep learning|data science|data engineering|platform|infrastructure|observability|monitoring|security|scalability|performance|web applications?|mobile|product|experimentation|mlops)$/i;

/**
 * Looks like a named product/tool (Neo4j, Redis, PostgreSQL, Node.js, CI/CD).
 */
const NAMED_STACK_HINT =
  /^(python|javascript|typescript|java|golang|go|rust|c\+\+|c#|ruby|php|scala|kotlin|swift|r\b|matlab|sql|nosql|html|css|react|angular|vue(\.?js)?|next\.?js|node\.?js|express|django|flask|fastapi|spring|rails|\.net|pytorch|tensorflow|keras|scikit[- ]?learn|pandas|numpy|spark|hadoop|kafka|airflow|dbt|snowflake|databricks|tableau|power\s*bi|aws|azure|gcp|google\s*cloud|docker|kubernetes|k8s|terraform|ansible|jenkins|github\s*actions|gitlab|linux|unix|git|redis|neo4j|postgres(ql)?|mysql|mongodb|dynamodb|cassandra|elasticsearch|opensearch|pinecone|chroma|weaviate|faiss|rabbitmq|graphql|rest|grpc|langchain|llamaindex|openai|gemini|huggingface|transformers|cuda|ci\/?cd|prometheus|grafana|nginx|apache)$/i;

export function isSoftSkillTerm(term: string): boolean {
  return SOFT_SKILL_BLOCKLIST.test(normalizeTerm(term));
}

export function isVagueBaselineTerm(term: string): boolean {
  return VAGUE_BASELINE_BLOCKLIST.test(normalizeTerm(term));
}

export function isVagueCategoryPhrase(term: string): boolean {
  return VAGUE_CATEGORY_PHRASE.test(normalizeTerm(term));
}

export function isThemeTerm(term: string): boolean {
  return THEME_TERM.test(normalizeTerm(term));
}

/** Drop from stack lists entirely (soft / baseline / category phrases). */
export function isNonStackPhrase(term: string): boolean {
  const t = normalizeTerm(term);
  if (!t) return true;
  return (
    isSoftSkillTerm(t) || isVagueBaselineTerm(t) || isVagueCategoryPhrase(t)
  );
}

/**
 * Eligible for aggressive hard-inject + ATS denominator.
 * Named tools only — never vague category phrases.
 */
export function isConcreteStackKeyword(term: string): boolean {
  const t = normalizeTerm(term);
  if (!t || isNonStackPhrase(t) || isThemeTerm(t)) return false;
  if (NAMED_STACK_HINT.test(t)) return true;
  // Multi-word category leftovers (e.g. "data storage solutions") already blocked.
  // Allow remaining short tokens / dotted / versioned product names.
  if (t.length <= 40 && !/\s+solutions?\b/i.test(t) && !/\b(solutions?|technologies)\b/i.test(t)) {
    // Reject pure English noun phrases without digits/camel/product cues
    if (/^[a-z]+(\s+[a-z]+){2,}$/i.test(t) && !NAMED_STACK_HINT.test(t)) {
      return false;
    }
    return true;
  }
  return false;
}

export function filterConcreteStackKeywords(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = normalizeTerm(raw);
    if (!t || !isConcreteStackKeyword(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export { normalizeTerm };
