import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";

export async function GET() {
  try {
    // Try to find studio-lume tenant
    const tenantRows = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, "studio-lume"))
      .limit(1);

    const tenant = tenantRows[0];

    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Try to load tenant config
    const configRows = await db
      .select()
      .from(schema.tenantConfigs)
      .where(eq(schema.tenantConfigs.tenantId, tenant.id))
      .limit(1);

    return Response.json({
      tenant: { slug: tenant.slug, id: tenant.id },
      config: configRows[0] ? "loaded" : "not found",
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 500 }
    );
  }
}
