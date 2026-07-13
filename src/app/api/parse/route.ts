import { parseJd } from "@/lib/agents/parseJd";
import { isDemoMode } from "@/lib/gemini/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  jdText: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const result = await parseJd(body.jdText);
    return NextResponse.json({
      ok: true,
      suggestions: result.suggestions,
      usedDemo: result.usedDemo,
      demoMode: isDemoMode(),
      promptId: result.promptId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse JD";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
