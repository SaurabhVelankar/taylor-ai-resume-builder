import { getStore } from "@/lib/tracker/store";
import { NewApplicationInputSchema } from "@/lib/tracker/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** List all saved applications (newest first). */
export async function GET() {
  try {
    const applications = await getStore().list();
    return NextResponse.json({ ok: true, applications });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list applications";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** Save a new application from the current cascade state ("I Applied"). */
export async function POST(request: Request) {
  try {
    const input = NewApplicationInputSchema.parse(await request.json());
    const application = await getStore().create(input);
    return NextResponse.json({ ok: true, application });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save application";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
