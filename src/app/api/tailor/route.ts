import { runTailorCascade } from "@/lib/agents/cascade";
import { isDemoMode } from "@/lib/gemini/client";
import { KeywordExtractSchema, TailorControlsSchema } from "@/lib/types";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  jdText: z.string().min(1),
  controls: TailorControlsSchema,
  companyName: z.string().optional(),
  keywords: KeywordExtractSchema.optional(),
  stream: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid tailor request";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }

  if (!body.stream) {
    try {
      const result = await runTailorCascade({
        jdText: body.jdText,
        controls: body.controls,
        companyName: body.companyName,
        keywords: body.keywords,
      });
      return Response.json({
        ok: true,
        steps: result.steps,
        usedDemo: result.usedDemo,
        demoMode: isDemoMode(),
        pdfUrl: result.pdfUrl,
        pdfFilename: result.pdfFilename,
        texFilename: result.texFilename,
        texSource: result.texSource,
        changeSummary: result.changeSummary,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cascade failed";
      return Response.json({ ok: false, error: message }, { status: 400 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      try {
        send({ type: "meta", demoMode: isDemoMode() });
        await runTailorCascade({
          jdText: body.jdText,
          controls: body.controls,
          companyName: body.companyName,
          keywords: body.keywords,
          onEvent: async (event) => {
            send(event);
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Cascade failed";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
