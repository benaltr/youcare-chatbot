import { db } from "@/lib/db";
import postgres from "postgres";
import { getEnv } from "@/lib/env";

export async function GET() {
  try {
    const tenants = await db.query.tenants.findMany();

    // Try to check if customers table exists
    const env = getEnv();
    const sql = postgres(env.DATABASE_URL);

    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('customers', 'conversations', 'messages', 'services')
      ORDER BY table_name
    `;

    await sql.end();

    return Response.json({
      status: 'ok',
      tenantsCount: tenants.length,
      tenants: tenants.map(t => ({ slug: t.slug, id: t.id })),
      tables: tables.map(t => t.table_name),
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message || String(error), stack: error.stack },
      { status: 500 }
    );
  }
}
