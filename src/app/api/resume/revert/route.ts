import { makeMetadataFromLatex } from "@/lib/agents/makeMetadata";
import { compileLatex } from "@/lib/latex/compile";
import { getPdfPageCount } from "@/lib/pdf/pageCount";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";

const TEMPLATE_PATH = path.join(process.cwd(), "data", "template.tex");

/** Baseline company slug for the reverted working artifacts. */
const BASELINE_LABEL = "Baseline";

/**
 * Revert the working TeX to the frozen baseline (data/template.tex):
 * - rebuild master_resume.json from the template (Make MetaData)
 * - recompile a pristine baseline PDF/TeX under runs/ (clears old Resume_*)
 * - return the baseline TeX so the editor/session is unmuddied
 */
export async function POST() {
  try {
    const baselineTex = await readFile(TEMPLATE_PATH, "utf8");

    let metadataSummary = "MetaData rebuild skipped.";
    try {
      const meta = await makeMetadataFromLatex({});
      metadataSummary = meta.summary;
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
      metadataSummary,
      message: `Reverted working TeX to baseline. ${metadataSummary}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Revert failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
