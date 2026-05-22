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
}

export interface CancelAppointmentResult {
  success: boolean;
  message: string;
  data?: {
    appointmentId: string;
  };
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
        ),
      )
      .limit(1);

    const appointment = appointmentRows[0];
    if (!appointment) {
      return {
        success: false,
        message: "Appointment not found",
      };
    }

    if (appointment.status === "cancelled") {
      return {
        success: false,
        message: "Appointment is already cancelled",
      };
    }

    // Update appointment status
    await db
      .update(schema.appointments)
      .set({
        status: "cancelled",
        notes: "Cancelled by customer",
      })
      .where(eq(schema.appointments.id, input.appointmentId));

    // Sync with calendar adapter
    const adapter = await getCalendarAdapter(input.tenantId);
    if (adapter) {
      await adapter.cancelAppointment({
        appointmentId: input.appointmentId,
      });
    }

    return {
      success: true,
      message: "✅ Appointment cancelled.",
      data: {
        appointmentId: input.appointmentId,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to cancel appointment",
    };
  }
}
