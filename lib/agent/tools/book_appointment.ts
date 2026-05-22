/**
 * Tool: Book an appointment
 * Creates appointment in database and syncs with calendar adapter
 */

import { and, eq } from "drizzle-orm";
import { getCalendarAdapter } from "@/lib/adapters";
import { db, schema } from "@/lib/db";

export interface BookAppointmentInput {
  tenantId: string;
  customerId: string;
  serviceId: string;
  staffId?: string;
  startsAt: Date;
  conversationId?: string;
  notes?: string;
}

export interface BookAppointmentResult {
  success: boolean;
  message: string;
  data?: {
    appointmentId: string;
  };
}

export async function bookAppointment(input: BookAppointmentInput): Promise<BookAppointmentResult> {
  try {
    // Validate customer exists and belongs to tenant
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
        message: "Customer not found",
      };
    }

    // Validate service exists and belongs to tenant
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

    // Calculate endsAt from service duration
    const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60000);

    // Get staff name if provided
    let staffName: string | undefined;
    if (input.staffId) {
      const staffRows = await db
        .select()
        .from(schema.staff)
        .where(and(eq(schema.staff.id, input.staffId), eq(schema.staff.tenantId, input.tenantId)))
        .limit(1);

      staffName = staffRows[0]?.name;
    }

    // Create appointment in database
    const appointmentRows = await db
      .insert(schema.appointments)
      .values({
        tenantId: input.tenantId,
        customerId: input.customerId,
        serviceId: input.serviceId,
        staffId: input.staffId,
        startsAt: input.startsAt,
        endsAt,
        status: "booked",
        bookedVia: "bot",
        notes: input.notes,
        conversationId: input.conversationId,
      })
      .returning();

    const appointment = appointmentRows[0];

    // Sync with calendar adapter
    const adapter = await getCalendarAdapter(input.tenantId);
    if (adapter) {
      await adapter.createAppointment({
        customerId: input.customerId,
        customerName: customer.name || "Customer",
        customerEmail: customer.email || undefined,
        serviceId: input.serviceId,
        serviceName: service.name,
        staffId: input.staffId,
        staffName,
        startsAt: input.startsAt,
        endsAt,
        notes: input.notes,
      });
    }

    // Format the appointment details for the message
    const dayName = input.startsAt.toLocaleDateString("he-IL", { weekday: "long" });
    const time = input.startsAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

    return {
      success: true,
      message: `✅ Booked! Your ${service.name} appointment is ${dayName} at ${time}.`,
      data: {
        appointmentId: appointment.id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to book appointment",
    };
  }
}
