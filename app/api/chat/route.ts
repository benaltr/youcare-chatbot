import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { db, schema } from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/tenants/resolve";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  tenantSlug: z.string().min(1),
  messages: z.array(z.record(z.string(), z.any())).min(1),
  channelThreadId: z.string().optional(),
  phone: z.string().optional(),
});

function calculateCost(inputTokens: number, outputTokens: number): string {
  const inputCost = (3 / 1_000_000) * inputTokens;
  const outputCost = (15 / 1_000_000) * outputTokens;
  const total = inputCost + outputCost;
  return total.toFixed(6);
}

function detectLanguage(text: string): string {
  const hebrewRange = /[֐-׿]/;
  return hebrewRange.test(text) ? "he" : "en";
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    const { tenantSlug, messages: uiMessages, channelThreadId, phone } = parsed.data;

    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) {
      return new Response(JSON.stringify({ error: `Tenant not found: ${tenantSlug}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Extract user text for language detection
    const lastMessage = uiMessages?.[uiMessages.length - 1] || {};
    const userPhone = phone || "unknown";
    const userText = String(lastMessage.content || "");
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

    // Save user message
    await db.insert(schema.messages).values({
      conversationId: conversation.id,
      role: "user",
      content: userText,
      createdAt: new Date(),
    });

    // Call agent - convert messages to proper format
    const result = await runAgent({
      tenantSlug,
      messages: uiMessages.map(msg => ({
        role: String(msg.role) as "user" | "assistant",
        content: String(msg.content),
      })),
    });

    // Get streaming response
    let uiStream;
    try {
      uiStream = result.toUIMessageStreamResponse();
    } catch (err: any) {
      console.error("Failed to convert to UI stream:", err?.message);
      return new Response(
        JSON.stringify({
          error: "Stream conversion error",
          details: err?.message || "Unknown error",
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // Collect response text
    let fullResponseText = "";
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
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const json = JSON.parse(line.slice(6));
                if (json.type === "text-delta" && json.delta) {
                  fullResponseText += json.delta;
                }
              } catch {
                // Skip parsing errors
              }
            }
          }
        }
      }
    }

    // Save assistant message
    const usage = await result.usage;
    const costUsd = calculateCost(usage?.inputTokens || 0, usage?.outputTokens || 0);

    await db.insert(schema.messages).values({
      conversationId: conversation.id,
      role: "assistant",
      content: fullResponseText,
      model: "claude-sonnet-4-6",
      tokensIn: usage?.inputTokens || 0,
      tokensOut: usage?.outputTokens || 0,
      costUsd,
      createdAt: new Date(),
    });

    return uiStream;
  } catch (err: any) {
    console.error("Chat API error:", err?.message || err, err?.stack);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        details: err?.message || "Unknown error",
        code: err?.code,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
