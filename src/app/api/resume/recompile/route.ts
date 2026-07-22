import { compileLatex } from "@/lib/latex/compile";
import { getPdfPageCount } from "@/lib/pdf/pageCount";
import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  companyName: z.string().min(1),
  texSource: z.string().min(20),
});

/**
 * Manual recompile after user edits LaTeX in the browser.
 * Overwrites runs/Resume_…_{Company}.tex + .pdf
 */
export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const compiled = await compileLatex(body.texSource, body.companyName);
    if (compiled.status !== "ok") {
      return NextResponse.json(
        {
          ok: false,
          error: compiled.message,
          texFilename: compiled.texFilename,
          pdfFilename: compiled.pdfFilename,
        },
        { status: 400 },
      );
    }

    const pages = await getPdfPageCount(compiled.pdfPath);
    const pdfUrl = `/api/resume/pdf?file=${encodeURIComponent(compiled.pdfFilename)}`;

    return NextResponse.json({
      ok: true,
      message: compiled.message,
      texFilename: compiled.texFilename,
      pdfFilename: compiled.pdfFilename,
      pdfUrl,
      pageCount: pages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Recompile failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
