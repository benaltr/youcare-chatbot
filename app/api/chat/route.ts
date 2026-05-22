import { convertToModelMessages, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { db, schema } from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/tenants/resolve";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  tenantSlug: z.string().min(1),
  messages: z.array(z.any()).min(1),
  channelThreadId: z.string().optional(),
  phone: z.string().optional(),
});

function calculateCost(promptTokens: number, completionTokens: number): string {
  // Claude Sonnet 4.6 pricing (approximately)
  // Input: $3 per 1M tokens, Output: $15 per 1M tokens
  const inputCost = (3 / 1_000_000) * promptTokens;
  const outputCost = (15 / 1_000_000) * completionTokens;
  const total = inputCost + outputCost;
  return total.toFixed(6);
}

function detectLanguage(text: string): string {
  // Simple heuristic: if text contains Hebrew characters, assume Hebrew
  const hebrewRange = /[֐-׿]/;
  return hebrewRange.test(text) ? "he" : "en";
}

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
    const { tenantSlug, messages: uiMessages, channelThreadId, phone } = parsed.data;

    // Resolve tenant
    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) {
      return new Response(JSON.stringify({ error: `Tenant not found: ${tenantSlug}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Convert UI messages to model messages
    const messages = await convertToModelMessages(uiMessages as UIMessage[]);

    // Extract last user message for language detection
    const lastMessage = uiMessages[uiMessages.length - 1] as Record<string, unknown> | undefined;
    const userPhone = phone || "unknown";
    const userText = (lastMessage?.content as string) || "";
    const detectedLanguage = detectLanguage(userText);

    // Find or create customer
    let customer = await db.query.customers.findFirst({
      where: and(eq(schema.customers.tenantId, tenant.id), eq(schema.customers.phone, userPhone)),
    });

    if (!customer) {
      const newCustomers = await db
        .insert(schema.customers)
        .values({
          tenantId: tenant.id,
          phone: userPhone,
          source: "web_widget",
          languagePref: detectedLanguage,
        })
        .returning();
      customer = newCustomers[0];
    }

    // Find or create conversation
    // Use provided channelThreadId or generate from phone
    const threadId = channelThreadId || `${tenant.id}-${userPhone}-web_widget`;

    let conversation = await db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.tenantId, tenant.id),
        eq(schema.conversations.channelThreadId, threadId),
        eq(schema.conversations.channel, "web_widget"),
      ),
    });

    if (!conversation) {
      const newConversations = await db
        .insert(schema.conversations)
        .values({
          tenantId: tenant.id,
          customerId: customer.id,
          channel: "web_widget",
          channelThreadId: threadId,
          status: "bot",
          language: detectedLanguage,
          metadata: {},
        })
        .returning();
      conversation = newConversations[0];
    }

    // Call agent
    const result = await runAgent({
      tenantSlug: tenantSlug,
      messages,
    });

    // Save user message
    await db.insert(schema.messages).values({
      conversationId: conversation.id,
      role: "user",
      content: userText,
      createdAt: new Date(),
    });

    // Collect response and save it
    const uiStream = result.toUIMessageStreamResponse();

    // We need to capture the response text. Since streamText returns a stream,
    // we'll save the message after we've collected the full response.
    // For now, we'll create a wrapper that captures the response.

    // Get the full text from the stream by consuming it
    let fullResponseText = "";

    // Clone the response so we can read it
    const clonedResponse = uiStream.clone();
    const reader = clonedResponse.body?.getReader();

    if (reader) {
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const text = decoder.decode(value, { stream: !done });
          // Parse SSE format: "data: {...}\n\n"
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const json = JSON.parse(line.slice(6));
                if (json.type === "text-delta" && json.delta) {
                  fullResponseText += json.delta;
                }
              } catch {
                // Skip parsing errors on non-JSON lines
              }
            }
          }
        }
      }
    }

    // Save assistant message with collected response
    const usage = result.usage;
    const costUsd = calculateCost(usage?.promptTokens || 0, usage?.completionTokens || 0);

    await db.insert(schema.messages).values({
      conversationId: conversation.id,
      role: "assistant",
      content: fullResponseText,
      model: "claude-sonnet-4-6",
      tokensIn: usage?.promptTokens || 0,
      tokensOut: usage?.completionTokens || 0,
      costUsd,
      createdAt: new Date(),
    });

    // Return the original stream response
    return uiStream;
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
