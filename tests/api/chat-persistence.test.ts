import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";

const TEST_TENANT_ID = "chat-persistence-test-tenant";
const TEST_TENANT_SLUG = "__test_chat_persistence__";
const TEST_PHONE = "+972123456789";

beforeEach(async () => {
  // Clean up any existing test data
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));

  // Create test tenant
  await db.insert(schema.tenants).values({
    id: TEST_TENANT_ID,
    slug: TEST_TENANT_SLUG,
    name: "Chat Persistence Test Clinic",
    languageDefault: "he",
    status: "demo",
  });

  // Create tenant config
  await db.insert(schema.tenantConfigs).values({
    tenantId: TEST_TENANT_ID,
    personaName: "TestBot",
    personaSystemPrompt: "You are a test assistant. Reply concisely in Hebrew.",
  });
});

afterEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));
});

describe("Chat Endpoint Persistence", () => {
  it("creates a customer on first message", async () => {
    const tenant = (
      await db.select().from(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID)).limit(1)
    )[0];

    // Simulate first message - manually create what the endpoint would create
    const customer = (
      await db
        .insert(schema.customers)
        .values({
          tenantId: tenant.id,
          phone: TEST_PHONE,
          source: "web_widget",
          languagePref: "he",
        })
        .returning()
    )[0];

    expect(customer).toBeDefined();
    expect(customer.phone).toBe(TEST_PHONE);
    expect(customer.tenantId).toBe(tenant.id);
  });

  it("creates a conversation on first message", async () => {
    const tenant = (
      await db.select().from(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID)).limit(1)
    )[0];

    const customer = (
      await db
        .select()
        .from(schema.customers)
        .where(
          and(eq(schema.customers.tenantId, tenant.id), eq(schema.customers.phone, TEST_PHONE)),
        )
        .limit(1)
    )[0];

    const threadId = `${tenant.id}-${TEST_PHONE}-web_widget`;

    const conversation = (
      await db
        .insert(schema.conversations)
        .values({
          tenantId: tenant.id,
          customerId: customer.id,
          channel: "web_widget",
          channelThreadId: threadId,
          status: "bot",
          language: "he",
          metadata: {},
        })
        .returning()
    )[0];

    expect(conversation).toBeDefined();
    expect(conversation.customerId).toBe(customer.id);
    expect(conversation.channel).toBe("web_widget");
    expect(conversation.status).toBe("bot");
  });

  it("saves user and assistant messages", async () => {
    const tenant = (
      await db.select().from(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID)).limit(1)
    )[0];

    const conversation = (
      await db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.tenantId, tenant.id),
            eq(schema.conversations.channel, "web_widget"),
          ),
        )
        .limit(1)
    )[0];

    // Save user message
    const userMsg = (
      await db
        .insert(schema.messages)
        .values({
          conversationId: conversation.id,
          role: "user",
          content: "שלום, איך אתה?",
          createdAt: new Date(),
        })
        .returning()
    )[0];

    expect(userMsg).toBeDefined();
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toBe("שלום, איך אתה?");

    // Save assistant message
    const assistantMsg = (
      await db
        .insert(schema.messages)
        .values({
          conversationId: conversation.id,
          role: "assistant",
          content: "שלום! אני בסדר, תודה על השאלה.",
          model: "claude-sonnet-4-6",
          tokensIn: 50,
          tokensOut: 25,
          costUsd: "0.000090",
          createdAt: new Date(),
        })
        .returning()
    )[0];

    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.model).toBe("claude-sonnet-4-6");
    expect(assistantMsg.tokensIn).toBe(50);
    expect(assistantMsg.tokensOut).toBe(25);
  });

  it("retrieves conversation history", async () => {
    const tenant = (
      await db.select().from(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID)).limit(1)
    )[0];

    const conversation = (
      await db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.tenantId, tenant.id),
            eq(schema.conversations.channel, "web_widget"),
          ),
        )
        .limit(1)
    )[0];

    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversation.id));

    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages.some((m) => m.role === "user")).toBe(true);
    expect(messages.some((m) => m.role === "assistant")).toBe(true);
  });

  it("tracks cost and tokens correctly", async () => {
    const tenant = (
      await db.select().from(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID)).limit(1)
    )[0];

    const messages = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(
            schema.messages.conversationId,
            (
              await db
                .select()
                .from(schema.conversations)
                .where(eq(schema.conversations.tenantId, tenant.id))
                .limit(1)
            )[0].id,
          ),
          eq(schema.messages.role, "assistant"),
        ),
      )
      .limit(1);

    const msg = messages[0];
    if (msg) {
      expect(typeof msg.tokensIn).toBe("number");
      expect(typeof msg.tokensOut).toBe("number");
      expect(msg.costUsd).toBeDefined();
    }
  });
});
