/**
 * Tool: Get customer profile
 * Retrieves customer info, appointment history, and packages
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface GetCustomerProfileInput {
  tenantId: string;
  customerId: string;
}

export interface GetCustomerProfileResult {
  success: boolean;
  data?: {
    id: string;
    name?: string;
    phone: string;
    email?: string;
    languagePref: string;
    profile?: Record<string, unknown>;
    upcomingAppointments: Array<{
      id: string;
      serviceName: string;
      startsAt: Date;
      staffName?: string;
    }>;
    packages: Array<{
      id: string;
      serviceName: string;
      totalSessions: number;
      sessionsUsed: number;
      expiresAt: Date | null;
      status: string;
    }>;
  };
  error?: string;
}

export async function getCustomerProfile(
  input: GetCustomerProfileInput,
): Promise<GetCustomerProfileResult> {
  try {
    // Get customer
    const customerRows = await db
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.id, input.customerId),
          eq(schema.customers.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    const customer = customerRows[0];
    if (!customer) {
      return {
        success: false,
        error: "Customer not found",
      };
    }

    // Get upcoming appointments (booked status, startsAt > now)
    const upcomingAppointments = await db
      .select({
        id: schema.appointments.id,
        serviceName: schema.services.name,
        startsAt: schema.appointments.startsAt,
        staffName: schema.staff.name,
      })
      .from(schema.appointments)
      .innerJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
      .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
      .where(
        and(
          eq(schema.appointments.tenantId, input.tenantId),
          eq(schema.appointments.customerId, input.customerId),
          eq(schema.appointments.status, "booked"),
        ),
      );

    // Get active packages
    const packages = await db
      .select({
        id: schema.packages.id,
        serviceName: schema.services.name,
        totalSessions: schema.packages.totalSessions,
        sessionsUsed: schema.packages.sessionsUsed,
        expiresAt: schema.packages.expiresAt,
        status: schema.packages.status,
      })
      .from(schema.packages)
      .innerJoin(schema.services, eq(schema.packages.serviceId, schema.services.id))
      .where(
        and(
          eq(schema.packages.tenantId, input.tenantId),
          eq(schema.packages.customerId, input.customerId),
        ),
      );

    return {
      success: true,
      data: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        languagePref: customer.languagePref,
        profile: customer.profile,
        upcomingAppointments,
        packages,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get customer profile",
    };
  }
}
