import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCalendarAdapter } from "@/lib/adapters";

export interface BookingInput {
  tenantId: string;
  customerId: string;
  serviceSlug: string;
  dateTime: string;
  customerName: string;
  customerPhone: string;
}

export async function createBooking(input: BookingInput) {
  try {
    const service = await db.query.services.findFirst({
      where: and(
        eq(schema.services.tenantId, input.tenantId),
        eq(schema.services.slug, input.serviceSlug)
      ),
    });

    if (!service) {
      return { success: false, message: `Service not found: ${input.serviceSlug}` };
    }

    const startTime = new Date(input.dateTime);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60000);

    const appointments = await db
      .insert(schema.appointments)
      .values({
        tenantId: input.tenantId,
        customerId: input.customerId,
        serviceId: service.id,
        startsAt: startTime,
        endsAt: endTime,
        status: "confirmed",
        bookedVia: "web_widget",
        notes: `Booked via chatbot`,
      })
      .returning();

    const appointment = appointments[0];

    // Create Google Calendar event
    try {
      const calendarAdapter = await getCalendarAdapter(input.tenantId);
      if (calendarAdapter) {
        await calendarAdapter.createAppointment({
          customerId: input.customerId,
          customerName: input.customerName,
          customerEmail: input.customerPhone,
          serviceId: service.id,
          serviceName: service.name,
          startsAt: startTime,
          endsAt: endTime,
          notes: `Booked via web widget`,
        });
      }
    } catch (err: any) {
      console.error("Failed to create Google Calendar event:", err.message);
    }

    return {
      success: true,
      message: "Booking confirmed",
      data: {
        appointmentId: appointment.id,
        service: service.name,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration: service.durationMinutes,
        price: service.priceCents,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to create booking",
    };
  }
}
