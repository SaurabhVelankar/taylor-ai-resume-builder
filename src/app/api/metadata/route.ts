import { makeAllMetadata } from "@/lib/agents/makeMetadata";
import { isDemoMode } from "@/lib/gemini/client";
import { NextResponse } from "next/server";
import path from "path";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    write: z.boolean().optional(),
  })
  .optional();

function rel(p: string): string {
  return path.relative(process.cwd(), p).split(path.sep).join("/");
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const body = BodySchema.parse(raw) ?? {};
    const entries = await makeAllMetadata({ write: body.write });

    if (entries.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No template_{type}.tex files found in data/. Add at least one (e.g. template_ml.tex).",
        },
        { status: 400 },
      );
    }

    const results = entries.map((e) =>
      e.ok
        ? {
            type: e.type,
            ok: true as const,
            usedDemo: e.result.usedDemo,
            wrote: e.result.wrote,
            summary: e.result.summary,
            masterPath: rel(e.result.masterPath),
            backupPath: e.result.backupPath ? rel(e.result.backupPath) : null,
            master: e.result.master,
          }
        : { type: e.type, ok: false as const, error: e.error },
    );

    const okCount = results.filter((r) => r.ok).length;
    const summary = `Make MetaData ran for ${results.length} type(s): ${results
      .map((r) => (r.ok ? r.summary : `[${r.type}] ERROR: ${r.error}`))
      .join(" · ")}`;

    return NextResponse.json({
      ok: okCount > 0,
      demoMode: isDemoMode(),
      summary,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Make MetaData failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
