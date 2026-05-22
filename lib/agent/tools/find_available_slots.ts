/**
 * Tool: Find available appointment slots
 * Uses calendar adapter to query availability for a service/staff member
 */

import { and, eq } from "drizzle-orm";
import { getCalendarAdapter } from "@/lib/adapters";
import { db, schema } from "@/lib/db";
import { groupSlotsByDate } from "./utils";

export interface FindAvailableSlotsInput {
  tenantId: string;
  serviceId: string;
  staffId?: string;
  startDate: Date;
  endDate: Date;
}

export interface FindAvailableSlotsResult {
  success: boolean;
  message: string;
  slots?: Record<string, string[]>;
  serviceName?: string;
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
        message: "Service not found",
      };
    }

    // Get calendar adapter
    const adapter = await getCalendarAdapter(input.tenantId);
    if (!adapter) {
      return {
        success: false,
        message: "Calendar adapter not configured",
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
        message: response.error || "Failed to find available slots",
      };
    }

    // Group slots by date
    const groupedSlots = groupSlotsByDate(response.slots || []);

    return {
      success: true,
      message: `Available slots for ${service.name}:`,
      slots: groupedSlots,
      serviceName: service.name,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to find available slots",
    };
  }
}
