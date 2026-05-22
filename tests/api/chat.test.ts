import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/chat/route";
import { db, schema } from "@/lib/db";

const TEST_SLUG = "__test_chat_route__";

beforeAll(async () => {
  await db.delete(schema.tenants).where(eq(schema.tenants.slug, TEST_SLUG));
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug: TEST_SLUG,
      name: "Chat Test Clinic",
      status: "demo",
    })
    .returning();
  await db.insert(schema.tenantConfigs).values({
    tenantId: tenant.id,
    personaName: "Tester",
    personaSystemPrompt: "Reply with only the single word: OK.",
  });
});

afterAll(async () => {
  await db.delete(schema.tenants).where(eq(schema.tenants.slug, TEST_SLUG));
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  it("returns 400 when tenantSlug is missing", async () => {
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it("returns a streaming text response for a valid request", async () => {
    const res = await POST(
      makeRequest({
        tenantSlug: TEST_SLUG,
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
    const reader = res.body?.getReader();
    let chunks = "";
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks += decoder.decode(value);
    }
    expect(chunks.length).toBeGreaterThan(0);
  }, 30_000);
});
