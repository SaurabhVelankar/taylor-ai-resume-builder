import { runTailorCascade } from "@/lib/agents/cascade";
import { isDemoMode } from "@/lib/gemini/client";
import { TailorControlsSchema } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  jdText: z.string().min(1),
  controls: TailorControlsSchema,
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const result = await runTailorCascade({
      jdText: body.jdText,
      controls: body.controls,
    });
    return NextResponse.json({
      ok: true,
      steps: result.steps,
      usedDemo: result.usedDemo,
      demoMode: isDemoMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cascade failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
