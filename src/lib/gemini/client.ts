import { GoogleGenerativeAI } from "@google/generative-ai";

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.DEMO_MODE === "false") return false;
  return !process.env.GEMINI_API_KEY?.trim();
}

export function getGeminiClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is missing. Set it in .env.local or enable DEMO_MODE=true.",
    );
  }
  return new GoogleGenerativeAI(key);
}

export function getModelName(kind: "pro" | "flash" = "pro"): string {
  if (kind === "flash") {
    return process.env.GEMINI_MODEL_FLASH?.trim() || "gemini-2.0-flash";
  }
  return process.env.GEMINI_MODEL_PRO?.trim() || "gemini-2.0-flash";
}

/** Strip optional markdown fences and parse JSON. */
export function parseJsonFromModel<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(payload) as T;
}

export async function generateJson<T>(args: {
  system: string;
  user: string;
  kind?: "pro" | "flash";
}): Promise<{ raw: string; parsed: T; usedDemo: false }> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: getModelName(args.kind ?? "pro"),
    systemInstruction: args.system,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const result = await model.generateContent(args.user);
  const raw = result.response.text();
  return { raw, parsed: parseJsonFromModel<T>(raw), usedDemo: false };
}
