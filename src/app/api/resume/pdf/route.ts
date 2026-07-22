import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * Serve the latest flat resume PDF from /runs.
 * Query: ?file=Resume_Jane_Doe_Amazon.pdf
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file") || "";

  if (!/^Resume_[\w.-]+\.pdf$/i.test(file)) {
    return NextResponse.json({ error: "Invalid resume filename" }, { status: 400 });
  }

  const pdfPath = path.join(process.cwd(), "runs", file);
  try {
    const bytes = await readFile(pdfPath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }
}
