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
  // Prefer 2.5 Flash for reliable JSON mode; override via env if needed.
  if (kind === "flash") {
    return process.env.GEMINI_MODEL_FLASH?.trim() || "gemini-2.5-flash";
  }
  return process.env.GEMINI_MODEL_PRO?.trim() || "gemini-2.5-flash";
}

/** Strip optional markdown fences and parse JSON. */
export function parseJsonFromModel<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Model returned empty response (expected JSON).");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let payload = (fenced ? fenced[1] : trimmed).trim();

  // If extra prose sneaks in, take the outermost JSON object/array.
  if (!payload.startsWith("{") && !payload.startsWith("[")) {
    const startObj = payload.indexOf("{");
    const startArr = payload.indexOf("[");
    const start =
      startObj === -1
        ? startArr
        : startArr === -1
          ? startObj
          : Math.min(startObj, startArr);
    if (start === -1) {
      throw new Error(
        `Model did not return JSON. Preview: ${payload.slice(0, 160)}`,
      );
    }
    const endObj = payload.lastIndexOf("}");
    const endArr = payload.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    payload = payload.slice(start, end + 1);
  }

  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "JSON parse failed";
    throw new Error(
      `${detail}. Preview: ${payload.slice(0, 220).replace(/\s+/g, " ")}`,
    );
  }
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
      temperature: 0.1,
    },
  });

  const result = await model.generateContent(args.user);
  const raw = result.response.text();
  return { raw, parsed: parseJsonFromModel<T>(raw), usedDemo: false };
}
