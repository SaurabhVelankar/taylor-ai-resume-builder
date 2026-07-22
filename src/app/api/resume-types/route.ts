import { discoverResumeTypes } from "@/lib/resume/resumeTypes";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** List available resume archetypes (one per template_{type}.tex in data/). */
export async function GET() {
  try {
    const types = await discoverResumeTypes();
    return NextResponse.json({ ok: true, types });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list resume types";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
