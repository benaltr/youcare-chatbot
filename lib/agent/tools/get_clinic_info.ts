/**
 * Tool: Get clinic information (hours, contact, services, staff)
 * Used by agent to provide clinic details to customer
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface GetClinicInfoInput {
  tenantId: string;
  field?: "hours" | "services" | "contact" | "all";
}

export interface GetClinicInfoResult {
  success: boolean;
  message: string;
  data?: {
    hours?: Record<string, { open: string; close: string }>;
    services?: Array<{
      id: string;
      name: string;
      durationMinutes: number;
      priceCents: number | null;
      category?: string;
    }>;
    contact?: {
      name: string;
      phone?: string;
    };
  };
}

export async function getClinicInfo(input: GetClinicInfoInput): Promise<GetClinicInfoResult> {
  const field = input.field || "all";

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
        message: "Clinic not found",
      };
    }

    const data: GetClinicInfoResult["data"] = {};

    // Get hours if requested
    if (field === "hours" || field === "all") {
      const configRows = await db
        .select()
        .from(schema.tenantConfigs)
        .where(eq(schema.tenantConfigs.tenantId, input.tenantId))
        .limit(1);

      const config = configRows[0];
      if (config?.businessHours) {
        data.hours = config.businessHours;
      }
    }

    // Get services if requested
    if (field === "services" || field === "all") {
      const services = await db
        .select()
        .from(schema.services)
        .where(eq(schema.services.tenantId, input.tenantId));

      data.services = services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        priceCents: s.priceCents,
        category: s.category || undefined,
      }));
    }

    // Get contact if requested
    if (field === "contact" || field === "all") {
      data.contact = {
        name: tenant.name,
        phone: tenant.whatsappNumber || undefined,
      };
    }

    return {
      success: true,
      message: "Clinic information retrieved",
      data: Object.keys(data).length > 0 ? data : undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to get clinic info",
    };
  }
}
