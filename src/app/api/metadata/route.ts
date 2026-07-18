import { makeMetadataFromLatex } from "@/lib/agents/makeMetadata";
import { isDemoMode } from "@/lib/gemini/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z
  .object({
    write: z.boolean().optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const body = BodySchema.parse(raw) ?? {};
    const result = await makeMetadataFromLatex({ write: body.write });
    return NextResponse.json({
      ok: true,
      demoMode: isDemoMode(),
      promptId: result.promptId,
      usedDemo: result.usedDemo,
      wrote: result.wrote,
      summary: result.summary,
      masterPath: "data/master_resume.json",
      backupPath: result.backupPath
        ? "data/master_resume.backup.json"
        : null,
      master: result.master,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Make MetaData failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
