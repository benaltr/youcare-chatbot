import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarAdapter } from "@/lib/adapters";
import { cancelAppointment } from "@/lib/agent/tools/cancel_appointment";
import { db, schema } from "@/lib/db";

// Mock the calendar adapter
vi.mock("@/lib/adapters", async () => {
  const actual = await vi.importActual("@/lib/adapters");
  return {
    ...actual,
    getCalendarAdapter: vi.fn(),
  };
});

const TEST_TENANT_ID = "cancel-appt-test-tenant";
const TEST_TENANT_SLUG = "cancel-appt-test";
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
    cancelAppointment: vi.fn().mockResolvedValue({ success: true }),
    createAppointment: vi.fn(),
    findAvailableSlots: vi.fn(),
    rescheduleAppointment: vi.fn(),
  };

  vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);
});

afterEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));
  vi.clearAllMocks();
});

describe("cancelAppointment", () => {
  it("updates appointment status to cancelled", async () => {
    const result = await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("✅ Appointment cancelled.");

    // Verify in database
    const appointments = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, TEST_APPOINTMENT_ID));

    expect(appointments[0]!.status).toBe("cancelled");
  });

  it("syncs cancellation with calendar adapter", async () => {
    const mockAdapter = {
      cancelAppointment: vi.fn().mockResolvedValue({ success: true }),
    };

    vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);

    await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
    });

    expect(mockAdapter.cancelAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: TEST_APPOINTMENT_ID,
      }),
    );
  });

  it("sets default cancellation note", async () => {
    await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
    });

    const appointments = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, TEST_APPOINTMENT_ID));

    expect(appointments[0]!.notes).toBe("Cancelled by customer");
  });


  it("returns error when appointment not found", async () => {
    const result = await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: "nonexistent-appointment",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Appointment not found");
  });


  it("returns error when appointment is already cancelled", async () => {
    // First cancellation
    await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
    });

    // Try to cancel again
    const result = await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Appointment is already cancelled");
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

    // Try to cancel appointment from different tenant
    const result = await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: otherAppointmentRows[0]!.id,
    });

    expect(result.success).toBe(false);

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });

  it("handles adapter not being configured", async () => {
    vi.mocked(getCalendarAdapter).mockResolvedValue(null);

    const result = await cancelAppointment({
      tenantId: TEST_TENANT_ID,
      appointmentId: TEST_APPOINTMENT_ID,
    });

    // Should still succeed in cancelling
    expect(result.success).toBe(true);
    expect(result.message).toBe("✅ Appointment cancelled.");
  });
});
