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
  newStartsAt: Date;
}

export interface RescheduleAppointmentResult {
  success: boolean;
  message: string;
  data?: {
    appointmentId: string;
  };
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

    if (appointment.status !== "booked") {
      return {
        success: false,
        message: "Cannot reschedule an appointment that is not booked",
      };
    }

    // Get service to calculate duration
    const serviceRows = await db
      .select()
      .from(schema.services)
      .where(eq(schema.services.id, appointment.serviceId))
      .limit(1);

    const service = serviceRows[0];
    if (!service) {
      return {
        success: false,
        message: "Service not found",
      };
    }

    // Calculate newEndsAt from service duration
    const newEndsAt = new Date(input.newStartsAt.getTime() + service.durationMinutes * 60000);

    // Update appointment in database
    await db
      .update(schema.appointments)
      .set({
        startsAt: input.newStartsAt,
        endsAt: newEndsAt,
      })
      .where(eq(schema.appointments.id, input.appointmentId));

    // Sync with calendar adapter
    const adapter = await getCalendarAdapter(input.tenantId);
    if (adapter) {
      await adapter.rescheduleAppointment({
        appointmentId: input.appointmentId,
        newStartsAt: input.newStartsAt,
        newEndsAt,
      });
    }

    // Format the appointment details for the message
    const dayName = input.newStartsAt.toLocaleDateString("he-IL", { weekday: "long" });
    const time = input.newStartsAt.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return {
      success: true,
      message: `✅ Rescheduled to ${dayName} at ${time}.`,
      data: {
        appointmentId: input.appointmentId,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to reschedule appointment",
    };
  }
}
