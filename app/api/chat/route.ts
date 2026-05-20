import { convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { runAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  tenantSlug: z.string().min(1),
  messages: z.array(z.any()).min(1),
});

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    const result = await runAgent({
      tenantSlug: parsed.data.tenantSlug,
      messages: await convertToModelMessages(parsed.data.messages as UIMessage[]),
    });
    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.toLowerCase().includes("tenant not found")) {
      return new Response(JSON.stringify({ error: message }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    console.error("Chat API error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
