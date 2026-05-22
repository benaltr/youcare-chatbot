/**
 * Tool: Get clinic information (hours, contact, services, staff)
 * Used by agent to provide clinic details to customer
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface GetClinicInfoInput {
  tenantId: string;
}

export interface GetClinicInfoResult {
  success: boolean;
  data?: {
    name: string;
    phone?: string;
    businessHours?: Record<string, { open: string; close: string }>;
    services: Array<{
      id: string;
      name: string;
      durationMinutes: number;
      priceCents: number | null;
      category?: string;
    }>;
    staff: Array<{
      id: string;
      name: string;
      qualifications?: string[];
    }>;
  };
  error?: string;
}

export async function getClinicInfo(input: GetClinicInfoInput): Promise<GetClinicInfoResult> {
  try {
    // Get tenant info
    const tenantRows = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, input.tenantId))
      .limit(1);

    const tenant = tenantRows[0];
    if (!tenant) {
      return {
        success: false,
        error: "Clinic not found",
      };
    }

    // Get tenant config (hours, contact)
    const configRows = await db
      .select()
      .from(schema.tenantConfigs)
      .where(eq(schema.tenantConfigs.tenantId, input.tenantId))
      .limit(1);

    const config = configRows[0];

    // Get all active services for this tenant
    const services = await db
      .select()
      .from(schema.services)
      .where(eq(schema.services.tenantId, input.tenantId));

    // Get all active staff for this tenant
    const staffList = await db
      .select()
      .from(schema.staff)
      .where(eq(schema.staff.tenantId, input.tenantId));

    return {
      success: true,
      data: {
        name: tenant.name,
        phone: tenant.whatsappNumber,
        businessHours: config?.businessHours || undefined,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          category: s.category,
        })),
        staff: staffList.map((st) => ({
          id: st.id,
          name: st.name,
          qualifications: st.qualifications,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get clinic info",
    };
  }
}
