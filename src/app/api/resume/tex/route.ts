import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * Serve the kept LaTeX source from /runs.
 * Query: ?file=Resume_Jane_Doe_Amazon.tex
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file") || "";

  if (!/^Resume_[\w.-]+\.tex$/i.test(file)) {
    return NextResponse.json({ error: "Invalid tex filename" }, { status: 400 });
  }

  const texPath = path.join(process.cwd(), "runs", file);
  try {
    const text = await readFile(texPath, "utf8");
    return NextResponse.json({ ok: true, texFilename: file, texSource: text });
  } catch {
    return NextResponse.json({ error: "TeX file not found" }, { status: 404 });
  }
}
