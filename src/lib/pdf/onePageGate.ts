import { applyCompressionTier, layoutOptsForTier } from "@/lib/agents/compress";
import { compileLatex } from "@/lib/latex/compile";
import { renderLatex } from "@/lib/latex/render";
import { getPdfPageCount } from "@/lib/pdf/pageCount";
import type { HeaderLocationDecision } from "@/lib/resume/headerLocation";
import type { OnePageGate, RoleFamily, TailoredResume } from "@/lib/types";

const MAX_TIER = 6;

export type EnforceOnePageResult = {
  gate: OnePageGate;
  texSource: string;
  compileMessage: string;
  pdfPath: string | null;
  pdfUrl: string | null;
  pdfFilename: string | null;
  texFilename: string | null;
  /** Final content after any compression retries. */
  tailored: TailoredResume;
  headerDecision: HeaderLocationDecision | null;
  attempts: { tier: number; pages: number | null; note: string }[];
};

/**
 * Hard 1-page enforcement:
 * compile → measure real PDF pages → compress + retry until pages === 1
 * or max tier exhausted.
 */
export async function enforceOnePage(
  tailored: TailoredResume,
  companyName: string,
  roleFamily: RoleFamily = "other",
  highKeywords: string[] = [],
  onProgress?: (msg: string) => void | Promise<void>,
  detectedLocation: string = "",
): Promise<EnforceOnePageResult> {
  const original = tailored;
  let current = tailored;
  const attempts: EnforceOnePageResult["attempts"] = [];

  let lastTex = "";
  let lastCompiled: Awaited<ReturnType<typeof compileLatex>> | null = null;
  let lastPages: number | null = null;
  let lastHeaderDecision: HeaderLocationDecision | null = null;

  for (let tier = 0; tier <= MAX_TIER; tier++) {
    let note = "initial compile";

    if (tier > 0) {
      const source = tier === 4 ? current : original;
      const compressed = await applyCompressionTier({
        tailored: source,
        tier,
        highKeywords,
      });
      current = compressed.data;
      note = compressed.note;
      await onProgress?.(
        `Overflow — ${note}; layout trim tier ${tier}; recompiling…`,
      );
    } else {
      await onProgress?.("Compiling PDF (tier 0)…");
    }

    const layout = layoutOptsForTier(tier);
    const rendered = await renderLatex(
      current,
      roleFamily,
      layout,
      detectedLocation,
    );
    lastTex = rendered.tex;
    lastHeaderDecision = rendered.headerDecision;
    lastCompiled = await compileLatex(lastTex, companyName);
    lastPages = await getPdfPageCount(lastCompiled.pdfPath);

    attempts.push({ tier, pages: lastPages, note });

    if (lastCompiled.status !== "ok") {
      return {
        tailored: current,
        texSource: lastTex,
        compileMessage: lastCompiled.message,
        pdfPath: null,
        pdfUrl: null,
        pdfFilename: lastCompiled.pdfFilename,
        texFilename: lastCompiled.texFilename,
        headerDecision: lastHeaderDecision,
        attempts,
        gate: {
          accepted: false,
          pageCount: 0,
          tierReached: tier,
          message: `Compile failed at tier ${tier}. ${lastCompiled.message}`,
        },
      };
    }

    if (lastPages === 1) {
      const pdfUrl = `/api/resume/pdf?file=${encodeURIComponent(lastCompiled.pdfFilename)}`;
      const headerNote = lastHeaderDecision
        ? ` Header: ${lastHeaderDecision.headerLocation}.`
        : "";
      return {
        tailored: current,
        texSource: lastTex,
        compileMessage:
          tier === 0
            ? `${lastCompiled.message}${headerNote}`
            : `${lastCompiled.message} (fitted @ ${note})${headerNote}`,
        pdfPath: lastCompiled.pdfPath,
        pdfUrl,
        pdfFilename: lastCompiled.pdfFilename,
        texFilename: lastCompiled.texFilename,
        headerDecision: lastHeaderDecision,
        attempts,
        gate: {
          accepted: true,
          pageCount: 1,
          tierReached: tier,
          message:
            tier === 0
              ? `Confirmed single-page PDF.${headerNote}`
              : `Confirmed single-page PDF after compression tier ${tier} (${note}).${headerNote}`,
        },
      };
    }

    await onProgress?.(`Tier ${tier}: still ${lastPages} pages — next tier…`);
  }

  const pdfUrl =
    lastCompiled?.status === "ok" && lastCompiled.pdfFilename
      ? `/api/resume/pdf?file=${encodeURIComponent(lastCompiled.pdfFilename)}`
      : null;

  return {
    tailored: current,
    texSource: lastTex,
    compileMessage: lastCompiled?.message ?? "No compile result",
    pdfPath: lastCompiled?.pdfPath ?? null,
    pdfUrl,
    pdfFilename: lastCompiled?.pdfFilename ?? null,
    texFilename: lastCompiled?.texFilename ?? null,
    headerDecision: lastHeaderDecision,
    attempts,
    gate: {
      accepted: false,
      pageCount: lastPages ?? 0,
      tierReached: MAX_TIER,
      message: `Still ${lastPages ?? "?"} pages after ${MAX_TIER} compression tiers. Open the last PDF and trim manually, or try Mild Nudging.`,
    },
  };
}
