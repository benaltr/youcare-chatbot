import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { runAgent } from "@/lib/agent";
import { eq } from "drizzle-orm";

const TEST_SLUG = "__test_agent__";

beforeAll(async () => {
  await db.delete(schema.tenants).where(eq(schema.tenants.slug, TEST_SLUG));
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug: TEST_SLUG,
      name: "Agent Test Clinic",
      languageDefault: "he",
      status: "demo",
    })
    .returning();
  await db.insert(schema.tenantConfigs).values({
    tenantId: tenant.id,
    personaName: "Tester",
    personaSystemPrompt: "You are a test assistant. Reply concisely.",
  });
});

afterAll(async () => {
  await db.delete(schema.tenants).where(eq(schema.tenants.slug, TEST_SLUG));
});

describe("runAgent", () => {
  it("returns a streamable response for a simple user message", async () => {
    const result = await runAgent({
      tenantSlug: TEST_SLUG,
      messages: [{ role: "user", content: "Say the word ECHO and nothing else." }],
    });

    const text = await result.text;
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text.toUpperCase()).toContain("ECHO");
  }, 30_000);

  it("throws when tenant is not found", async () => {
    await expect(
      runAgent({
        tenantSlug: "does-not-exist-zzz",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(/tenant/i);
  });
});
