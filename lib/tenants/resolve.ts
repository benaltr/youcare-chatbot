import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Tenant } from "@/lib/db/schema";

export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  const rows = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveTenantByDomain(domain: string): Promise<Tenant | null> {
  const rows = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.domain, domain))
    .limit(1);
  return rows[0] ?? null;
}
