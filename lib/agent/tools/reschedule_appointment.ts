/**
 * Tool: Reschedule an appointment
 * Updates appointment date/time and syncs with calendar adapter
 */

import { and, eq } from "drizzle-orm";
import { getCalendarAdapter } from "@/lib/adapters";
import { db, schema } from "@/lib/db";

export interface RescheduleAppointmentInput {
  tenantId: string;
  appointmentId: string;
  customerId: string;
  newStartsAt: Date;
  newEndsAt: Date;
}

export interface RescheduleAppointmentResult {
  success: boolean;
  data?: {
    appointmentId: string;
    newStartsAt: Date;
    newEndsAt: Date;
    status: string;
  };
  error?: string;
}

export async function rescheduleAppointment(
  input: RescheduleAppointmentInput,
): Promise<RescheduleAppointmentResult> {
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

    if (appointment.status !== "booked") {
      return {
        success: false,
        error: "Cannot reschedule an appointment that is not booked",
      };
    }

    // Update appointment in database
    await db
      .update(schema.appointments)
      .set({
        startsAt: input.newStartsAt,
        endsAt: input.newEndsAt,
      })
      .where(eq(schema.appointments.id, input.appointmentId));

    // Sync with calendar adapter
    const adapter = await getCalendarAdapter(input.tenantId);
    if (adapter) {
      await adapter.rescheduleAppointment({
        appointmentId: input.appointmentId,
        newStartsAt: input.newStartsAt,
        newEndsAt: input.newEndsAt,
      });
    }

    return {
      success: true,
      data: {
        appointmentId: input.appointmentId,
        newStartsAt: input.newStartsAt,
        newEndsAt: input.newEndsAt,
        status: "booked",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reschedule appointment",
    };
  }
}
