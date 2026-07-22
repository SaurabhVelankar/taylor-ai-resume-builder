function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Sequential PDF then TeX download (no zip). */
export async function downloadExportPack(args: {
  pdfUrl: string | null;
  pdfFilename: string | null;
  texSource: string;
  texFilename: string | null;
}): Promise<void> {
  if (args.pdfUrl && args.pdfFilename) {
    const res = await fetch(args.pdfUrl);
    if (!res.ok) throw new Error("Could not download PDF");
    const blob = await res.blob();
    triggerDownload(blob, args.pdfFilename);
    await delay(400);
  }

  if (args.texSource.trim() && args.texFilename) {
    triggerDownload(
      new Blob([args.texSource], { type: "text/plain;charset=utf-8" }),
      args.texFilename,
    );
  }
}
