import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarAdapter } from "@/lib/adapters";
import { rescheduleAppointment } from "@/lib/agent/tools/reschedule_appointment";
import { db, schema } from "@/lib/db";

// Mock the calendar adapter
vi.mock("@/lib/adapters", async () => {
  const actual = await vi.importActual("@/lib/adapters");
  return {
    ...actual,
    getCalendarAdapter: vi.fn(),
  };
});

const TEST_TENANT_ID = "reschedule-appt-test-tenant";
const TEST_TENANT_SLUG = "reschedule-appt-test";
let TEST_CUSTOMER_ID: string;
let TEST_APPOINTMENT_ID: string;

beforeEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));

  // Create test tenant
  await db.insert(schema.tenants).values({
    id: TEST_TENANT_ID,
    slug: TEST_TENANT_SLUG,
    name: "Test Clinic",
    languageDefault: "he",
    status: "demo",
  });

  // Create customer
  const customerRows = await db
    .insert(schema.customers)
    .values({
      tenantId: TEST_TENANT_ID,
      phone: "+1234567890",
      name: "Test Customer",
      languagePref: "he",
    })
    .returning();

  TEST_CUSTOMER_ID = customerRows[0]!.id;

  // Create service
  const serviceRows = await db
    .insert(schema.services)
    .values({
      tenantId: TEST_TENANT_ID,
      slug: "treatment",
      name: "Treatment",
      durationMinutes: 60,
      bufferMinutes: 0,
    })
    .returning();

  // Create appointment
  const appointmentRows = await db
    .insert(schema.appointments)
    .values({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: serviceRows[0]!.id,
      startsAt: new Date("2026-06-15T14:00:00Z"),
      endsAt: new Date("2026-06-15T15:00:00Z"),
      status: "booked",
      bookedVia: "bot",
    })
    .returning();

  TEST_APPOINTMENT_ID = appointmentRows[0]!.id;

  // Mock adapter
  const mockAdapter = {
    rescheduleAppointment: vi.fn().mockResolvedValue({ success: true }),
    createAppointment: vi.fn(),
    findAvailableSlots: vi.fn(),
    cancelAppointment: vi.fn(),
  };

  vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);
});

afterEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));
  vi.clearAllMocks();
});

describe("rescheduleAppointment", () => {
  it("updates appointment dates in the database", async () => {
    const newStartsAt = new Date("2026-06-20T10:00:00Z");
    const newEndsAt = new Date("2026-06-20T11:00:00Z");

    const result = await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
      customerId: TEST_CUSTOMER_ID,
      newStartsAt,
      newEndsAt,
    });

    expect(result.success).toBe(true);
    expect(result.data?.newStartsAt).toEqual(newStartsAt);
    expect(result.data?.newEndsAt).toEqual(newEndsAt);

    // Verify in database
    const appointments = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, TEST_APPOINTMENT_ID));

    expect(appointments[0]!.startsAt).toEqual(newStartsAt);
    expect(appointments[0]!.endsAt).toEqual(newEndsAt);
  });

  it("syncs rescheduling with calendar adapter", async () => {
    const mockAdapter = {
      rescheduleAppointment: vi.fn().mockResolvedValue({ success: true }),
    };

    vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);

    const newStartsAt = new Date("2026-06-22T15:00:00Z");
    const newEndsAt = new Date("2026-06-22T16:00:00Z");

    await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
      customerId: TEST_CUSTOMER_ID,
      newStartsAt,
      newEndsAt,
    });

    expect(mockAdapter.rescheduleAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: TEST_APPOINTMENT_ID,
        newStartsAt,
        newEndsAt,
      }),
    );
  });

  it("keeps appointment status as booked after rescheduling", async () => {
    const newStartsAt = new Date("2026-06-25T09:00:00Z");
    const newEndsAt = new Date("2026-06-25T10:00:00Z");

    await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
      customerId: TEST_CUSTOMER_ID,
      newStartsAt,
      newEndsAt,
    });

    const appointments = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, TEST_APPOINTMENT_ID));

    expect(appointments[0]!.status).toBe("booked");
  });

  it("returns error when appointment not found", async () => {
    const result = await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: "nonexistent-appointment",
      customerId: TEST_CUSTOMER_ID,
      newStartsAt: new Date("2026-06-20T10:00:00Z"),
      newEndsAt: new Date("2026-06-20T11:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Appointment not found");
  });

  it("returns error when appointment does not belong to customer", async () => {
    // Create another customer
    const otherCustomerRows = await db
      .insert(schema.customers)
      .values({
        tenantId: TEST_TENANT_ID,
        phone: "+9999999999",
        name: "Other Customer",
        languagePref: "he",
      })
      .returning();

    const result = await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
      customerId: otherCustomerRows[0]!.id,
      newStartsAt: new Date("2026-06-20T10:00:00Z"),
      newEndsAt: new Date("2026-06-20T11:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Appointment not found");
  });

  it("returns error when appointment is not booked", async () => {
    // Create a cancelled appointment
    const serviceRows = await db
      .select()
      .from(schema.services)
      .where(eq(schema.services.tenantId, TEST_TENANT_ID));

    const cancelledAppointmentRows = await db
      .insert(schema.appointments)
      .values({
        tenantId: TEST_TENANT_ID,
        customerId: TEST_CUSTOMER_ID,
        serviceId: serviceRows[0]!.id,
        startsAt: new Date("2026-06-18T14:00:00Z"),
        endsAt: new Date("2026-06-18T15:00:00Z"),
        status: "cancelled",
        bookedVia: "bot",
      })
      .returning();

    const result = await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: cancelledAppointmentRows[0]!.id,
      customerId: TEST_CUSTOMER_ID,
      newStartsAt: new Date("2026-06-20T10:00:00Z"),
      newEndsAt: new Date("2026-06-20T11:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Cannot reschedule an appointment that is not booked");
  });

  it("returns error when appointment belongs to different tenant", async () => {
    // Create another tenant with an appointment
    const otherTenantId = "other-tenant";
    await db.insert(schema.tenants).values({
      id: otherTenantId,
      slug: "other",
      name: "Other Clinic",
      languageDefault: "he",
      status: "demo",
    });

    const otherCustomerRows = await db
      .insert(schema.customers)
      .values({
        tenantId: otherTenantId,
        phone: "+8888888888",
        name: "Other Customer",
        languagePref: "he",
      })
      .returning();

    const otherServiceRows = await db
      .insert(schema.services)
      .values({
        tenantId: otherTenantId,
        slug: "other-service",
        name: "Other Service",
        durationMinutes: 60,
        bufferMinutes: 0,
      })
      .returning();

    const otherAppointmentRows = await db
      .insert(schema.appointments)
      .values({
        tenantId: otherTenantId,
        customerId: otherCustomerRows[0]!.id,
        serviceId: otherServiceRows[0]!.id,
        startsAt: new Date("2026-06-20T10:00:00Z"),
        endsAt: new Date("2026-06-20T11:00:00Z"),
        status: "booked",
        bookedVia: "bot",
      })
      .returning();

    // Try to reschedule appointment from different tenant
    const result = await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: otherAppointmentRows[0]!.id,
      customerId: TEST_CUSTOMER_ID,
      newStartsAt: new Date("2026-06-25T09:00:00Z"),
      newEndsAt: new Date("2026-06-25T10:00:00Z"),
    });

    expect(result.success).toBe(false);

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });

  it("handles completed appointments (returns error)", async () => {
    // Create a completed appointment
    const serviceRows = await db
      .select()
      .from(schema.services)
      .where(eq(schema.services.tenantId, TEST_TENANT_ID));

    const completedAppointmentRows = await db
      .insert(schema.appointments)
      .values({
        tenantId: TEST_TENANT_ID,
        customerId: TEST_CUSTOMER_ID,
        serviceId: serviceRows[0]!.id,
        startsAt: new Date("2026-05-15T14:00:00Z"),
        endsAt: new Date("2026-05-15T15:00:00Z"),
        status: "completed",
        bookedVia: "bot",
      })
      .returning();

    const result = await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: completedAppointmentRows[0]!.id,
      customerId: TEST_CUSTOMER_ID,
      newStartsAt: new Date("2026-06-20T10:00:00Z"),
      newEndsAt: new Date("2026-06-20T11:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Cannot reschedule an appointment that is not booked");
  });

  it("handles adapter not being configured", async () => {
    vi.mocked(getCalendarAdapter).mockResolvedValue(null);

    const newStartsAt = new Date("2026-06-20T10:00:00Z");
    const newEndsAt = new Date("2026-06-20T11:00:00Z");

    const result = await rescheduleAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
      customerId: TEST_CUSTOMER_ID,
      newStartsAt,
      newEndsAt,
    });

    // Should still succeed in rescheduling
    expect(result.success).toBe(true);
    expect(result.data?.newStartsAt).toEqual(newStartsAt);
  });
});
