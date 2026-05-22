import { db } from "@/lib/db";

export async function GET() {
  try {
    const tenants = await db.query.tenants.findMany();

    return Response.json({
      status: 'ok',
      tenantsCount: tenants.length,
      tenants: tenants.map(t => ({ slug: t.slug, id: t.id })),
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message || String(error), stack: error.stack },
      { status: 500 }
    );
  }
}
