import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { resolveTenantBySlug, resolveTenantByDomain } from "@/lib/tenants/resolve";
import { eq } from "drizzle-orm";

const TEST_SLUG = "__test_tenant_resolve__";
const TEST_DOMAIN = "test-resolve.local";

beforeAll(async () => {
  await db.delete(schema.tenants).where(eq(schema.tenants.slug, TEST_SLUG));
  await db.insert(schema.tenants).values({
    slug: TEST_SLUG,
    name: "Test Resolve",
    domain: TEST_DOMAIN,
    status: "demo",
  });
});

afterAll(async () => {
  await db.delete(schema.tenants).where(eq(schema.tenants.slug, TEST_SLUG));
});

describe("resolveTenantBySlug", () => {
  it("returns tenant when slug exists", async () => {
    const tenant = await resolveTenantBySlug(TEST_SLUG);
    expect(tenant).not.toBeNull();
    expect(tenant?.slug).toBe(TEST_SLUG);
    expect(tenant?.name).toBe("Test Resolve");
  });

  it("returns null for unknown slug", async () => {
    const tenant = await resolveTenantBySlug("does-not-exist-xyz");
    expect(tenant).toBeNull();
  });
});

describe("resolveTenantByDomain", () => {
  it("returns tenant when domain matches", async () => {
    const tenant = await resolveTenantByDomain(TEST_DOMAIN);
    expect(tenant).not.toBeNull();
    expect(tenant?.slug).toBe(TEST_SLUG);
  });

  it("returns null for unknown domain", async () => {
    const tenant = await resolveTenantByDomain("unknown.example.com");
    expect(tenant).toBeNull();
  });
});
