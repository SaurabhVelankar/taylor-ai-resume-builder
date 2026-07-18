import { PDFDocument } from "pdf-lib";
import { readFile } from "fs/promises";

/**
 * Read real PDF page count. Never replace with character estimates.
 */
export async function getPdfPageCount(
  pdfPath: string | null,
): Promise<number | null> {
  if (!pdfPath) return null;
  const bytes = await readFile(pdfPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}
