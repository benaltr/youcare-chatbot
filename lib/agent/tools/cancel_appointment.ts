/**
 * Tool: Cancel an appointment
 * Updates appointment status and syncs with calendar adapter
 */

import { and, eq } from "drizzle-orm";
import { getCalendarAdapter } from "@/lib/adapters";
import { db, schema } from "@/lib/db";

export interface CancelAppointmentInput {
  tenantId: string;
  appointmentId: string;
  customerId: string;
  reason?: string;
}

export interface CancelAppointmentResult {
  success: boolean;
  data?: {
    appointmentId: string;
    status: string;
  };
  error?: string;
}

export async function cancelAppointment(
  input: CancelAppointmentInput,
): Promise<CancelAppointmentResult> {
  try {
    // Get appointment
    const appointmentRows = await db
      .select()
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.id, input.appointmentId),
          eq(schema.appointments.tenantId, input.tenantId),
          eq(schema.appointments.customerId, input.customerId),
        ),
      )
      .limit(1);

    const appointment = appointmentRows[0];
    if (!appointment) {
      return {
        success: false,
        error: "Appointment not found or does not belong to this customer",
      };
    }

    if (appointment.status === "cancelled") {
      return {
        success: false,
        error: "Appointment is already cancelled",
      };
    }

    // Update appointment status
    await db
      .update(schema.appointments)
      .set({
        status: "cancelled",
        notes: input.reason ? `Cancelled: ${input.reason}` : "Cancelled by customer",
      })
      .where(eq(schema.appointments.id, input.appointmentId));

    // Sync with calendar adapter
    const adapter = await getCalendarAdapter(input.tenantId);
    if (adapter) {
      await adapter.cancelAppointment({
        appointmentId: input.appointmentId,
        reason: input.reason,
      });
    }

    return {
      success: true,
      data: {
        appointmentId: input.appointmentId,
        status: "cancelled",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to cancel appointment",
    };
  }
}
