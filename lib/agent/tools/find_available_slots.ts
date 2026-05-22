/**
 * Tool: Find available appointment slots
 * Uses calendar adapter to query availability for a service/staff member
 */

import { and, eq } from "drizzle-orm";
import { getCalendarAdapter } from "@/lib/adapters";
import { db, schema } from "@/lib/db";

export interface FindAvailableSlotsInput {
  tenantId: string;
  serviceId: string;
  staffId?: string;
  startDate: Date;
  endDate: Date;
}

export interface FindAvailableSlotsResult {
  success: boolean;
  slots?: Array<{
    start: Date;
    end: Date;
  }>;
  serviceName?: string;
  error?: string;
}

export async function findAvailableSlots(
  input: FindAvailableSlotsInput,
): Promise<FindAvailableSlotsResult> {
  try {
    // Get service details
    const serviceRows = await db
      .select()
      .from(schema.services)
      .where(
        and(eq(schema.services.id, input.serviceId), eq(schema.services.tenantId, input.tenantId)),
      )
      .limit(1);

    const service = serviceRows[0];
    if (!service) {
      return {
        success: false,
        error: "Service not found",
      };
    }

    // Get calendar adapter
    const adapter = await getCalendarAdapter(input.tenantId);
    if (!adapter) {
      return {
        success: false,
        error: "Calendar adapter not configured",
      };
    }

    // Query available slots
    const response = await adapter.findAvailableSlots({
      serviceId: input.serviceId,
      staffId: input.staffId,
      dateRange: {
        start: input.startDate,
        end: input.endDate,
      },
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
    });

    if (!response.success) {
      return {
        success: false,
        error: response.error || "Failed to find available slots",
      };
    }

    return {
      success: true,
      slots: response.slots,
      serviceName: service.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to find available slots",
    };
  }
}
