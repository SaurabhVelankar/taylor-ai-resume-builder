import { makeAllMetadata } from "@/lib/agents/makeMetadata";
import { compileLatex } from "@/lib/latex/compile";
import { getPdfPageCount } from "@/lib/pdf/pageCount";
import {
  resolveResumeType,
  templatePathFor,
} from "@/lib/resume/resumeTypes";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Baseline company slug for the reverted working artifacts. */
const BASELINE_LABEL = "Baseline";

/**
 * Revert the working TeX to the frozen baselines:
 * - rebuild master_resume_{type}.json for EVERY archetype (Make MetaData all)
 * - recompile a pristine baseline PDF/TeX for the currently-selected type
 *   under runs/ (clears old Resume_*)
 * - return that type's baseline TeX so the editor/session is unmuddied
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const editorType = await resolveResumeType(
      typeof body?.resumeType === "string" ? body.resumeType : undefined,
    );

    const baselineTex = await readFile(templatePathFor(editorType), "utf8");

    let metadataSummary = "MetaData rebuild skipped.";
    try {
      const entries = await makeAllMetadata({});
      metadataSummary = entries.length
        ? `Rebuilt metadata for ${entries.length} type(s): ${entries
            .map((e) => (e.ok ? e.result.summary : `[${e.type}] ERROR: ${e.error}`))
            .join(" · ")}`
        : "No archetypes found to rebuild.";
    } catch (e) {
      metadataSummary =
        e instanceof Error
          ? `MetaData rebuild failed (kept existing): ${e.message}`
          : "MetaData rebuild failed (kept existing).";
    }

    const compiled = await compileLatex(baselineTex, BASELINE_LABEL);
    if (compiled.status !== "ok") {
      return NextResponse.json(
        {
          ok: false,
          error: compiled.message,
          texSource: baselineTex,
          resumeType: editorType,
          metadataSummary,
        },
        { status: 400 },
      );
    }

    const pageCount = await getPdfPageCount(compiled.pdfPath);
    const pdfUrl = `/api/resume/pdf?file=${encodeURIComponent(compiled.pdfFilename)}`;

    return NextResponse.json({
      ok: true,
      texSource: baselineTex,
      texFilename: compiled.texFilename,
      pdfFilename: compiled.pdfFilename,
      pdfUrl,
      pageCount,
      resumeType: editorType,
      metadataSummary,
      message: `Reverted working TeX to baseline (${editorType}). ${metadataSummary}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Revert failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
