import { compileLatexStub } from "@/lib/latex/compile";
import { renderLatexStub } from "@/lib/latex/render";
import { getPdfPageCount } from "@/lib/pdf/pageCount";
import type { OnePageGate, TailoredResume } from "@/lib/types";

/**
 * Hard 1-page enforcement loop (structure locked).
 * Today: stubbed compile → cannot confirm pages → does not accept as 1-page.
 * Later: compile → measure → compress tiers → retry until pages === 1.
 */
export async function enforceOnePage(
  tailored: TailoredResume,
): Promise<{
  gate: OnePageGate;
  texSource: string;
  compileMessage: string;
}> {
  const texSource = renderLatexStub(tailored);
  const compiled = await compileLatexStub(texSource);
  const pageCount = await getPdfPageCount(compiled.pdfPath);

  if (pageCount === null) {
    return {
      texSource,
      compileMessage: compiled.message,
      gate: {
        accepted: false,
        pageCount: 0,
        tierReached: 0,
        message:
          "One-page gate pending: PDF not compiled yet, so page count cannot be confirmed.",
      },
    };
  }

  // Future path when compile exists:
  // for tier in compressionTiers: shrink → compile → if pageCount === 1 accept
  const accepted = pageCount === 1;
  return {
    texSource,
    compileMessage: compiled.message,
    gate: {
      accepted,
      pageCount,
      tierReached: 0,
      message: accepted
        ? "Confirmed single-page PDF."
        : `Confirmed overflow (${pageCount} pages). Retry/compress tiers would run here.`,
    },
  };
}
