import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import { JdSuggestions, JdSuggestionsSchema } from "@/lib/types";

function mockSuggestions(jdText: string): JdSuggestions {
  const lower = jdText.toLowerCase();
  let roleFamily: JdSuggestions["roleFamily"] = "other";
  if (/(machine learning|\bml\b|pytorch|tensorflow|llm)/i.test(jdText)) {
    roleFamily = "ml";
  } else if (
    /(data scientist|data science|\bsql\b|analytics|experimentation)/i.test(
      jdText,
    )
  ) {
    roleFamily = "data_science";
  } else if (
    /(software engineer|full[- ]?stack|backend|frontend|\bswe\b)/i.test(jdText)
  ) {
    roleFamily = "swe";
  }

  let workArrangement: JdSuggestions["workArrangement"] = "unspecified";
  if (/\bremote\b/i.test(jdText)) workArrangement = "remote";
  else if (/\bhybrid\b/i.test(jdText)) workArrangement = "hybrid";
  else if (/\bon[- ]?site\b/i.test(jdText)) workArrangement = "onsite";

  let seniority: JdSuggestions["seniority"] = "unspecified";
  if (/\bintern\b/i.test(jdText)) seniority = "intern";
  else if (/new grad|university grad|entry[- ]level/i.test(jdText))
    seniority = "new_grad";
  else if (/\bstaff\b|\bprincipal\b/i.test(jdText)) seniority = "staff_plus";
  else if (/\bsenior\b|\bsr\./i.test(jdText)) seniority = "senior";
  else if (/\bmid[- ]level\b|intermediate/i.test(jdText)) seniority = "mid";

  const locationMatch = jdText.match(
    /(?:location|based in|office(?:s)? in)\s*[:\-]?\s*([A-Za-z .\/,]+)/i,
  );
  const location =
    locationMatch?.[1]?.split("\n")[0]?.trim().slice(0, 80) ||
    (workArrangement === "remote" ? "Remote" : "");

  const titleLine = jdText.split("\n").map((l) => l.trim()).find(Boolean) ?? "";

  let company: string | null = null;
  const companyPatterns = [
    /(?:^|\n)\s*(?:company|employer|organization)\s*[:\-]\s*([^\n]+)/i,
    /\bat\s+([A-Z][A-Za-z0-9&.\- ]{2,40})(?:\s*[,\|]|\s*$|\s*\()/,
    /[-–—]\s*([A-Z][A-Za-z0-9&.\- ]{2,40})\s*(?:\(|$|\n)/,
    /(?:^|\n)\s*([A-Z][A-Za-z0-9&.\- ]{2,40})\s+is hiring/i,
  ];
  for (const pattern of companyPatterns) {
    const m = jdText.match(pattern);
    const candidate = m?.[1]?.trim().replace(/\s+/g, " ");
    if (candidate && candidate.length >= 2 && candidate.length <= 60) {
      company = candidate;
      break;
    }
  }

  return JdSuggestionsSchema.parse({
    title: titleLine.slice(0, 120),
    company,
    location,
    roleFamily,
    seniority,
    workArrangement,
    modeHint: lower.length > 1200 ? "middle_ground" : null,
    modeHintReason: lower.length > 1200
      ? "Long JD — Middle Ground is a safe starting point (hint only)."
      : null,
    notes: [
      "DEMO_MODE mock parse — heuristics only. Set GEMINI_API_KEY and DEMO_MODE=false for model parse.",
    ],
  });
}

export async function parseJd(jdText: string): Promise<{
  suggestions: JdSuggestions;
  usedDemo: boolean;
  promptId: string;
}> {
  const trimmed = jdText.trim();
  if (trimmed.length < 40) {
    throw new Error("Paste a fuller job description (at least ~40 characters).");
  }

  if (isDemoMode()) {
    return {
      suggestions: mockSuggestions(trimmed),
      usedDemo: true,
      promptId: PROMPT_PLACEHOLDERS.parseJd.id,
    };
  }

  const prompt = PROMPT_PLACEHOLDERS.parseJd;
  const { parsed } = await generateJson<unknown>({
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, { jdText: trimmed }),
    kind: "flash",
  });

  return {
    suggestions: JdSuggestionsSchema.parse(parsed),
    usedDemo: false,
    promptId: prompt.id,
  };
}
