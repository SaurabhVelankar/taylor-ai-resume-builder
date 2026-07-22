import { getStore } from "@/lib/tracker/store";
import { ApplicationPatchSchema } from "@/lib/tracker/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Update editable fields (status / notes). */
export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const patch = ApplicationPatchSchema.parse(await request.json());
    const application = await getStore().update(id, patch);
    return NextResponse.json({ ok: true, application });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** Delete an application. */
export async function DELETE(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    await getStore().remove(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
