/**
 * STUB: Compile .tex → PDF via tectonic / pdflatex.
 * Wire after Overleaf master template is locked in.
 */
export async function compileLatexStub(_texSource: string): Promise<{
  pdfPath: string | null;
  status: "stub";
  message: string;
}> {
  return {
    pdfPath: null,
    status: "stub",
    message:
      "LaTeX compile not wired yet. Drop your controlled template into data/template.tex, then implement tectonic/pdflatex here.",
  };
}
