import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarAdapter } from "@/lib/adapters";
import { bookAppointment } from "@/lib/agent/tools/book_appointment";
import { db, schema } from "@/lib/db";

// Mock the calendar adapter
vi.mock("@/lib/adapters", async () => {
  const actual = await vi.importActual("@/lib/adapters");
  return {
    ...actual,
    getCalendarAdapter: vi.fn(),
  };
});

const TEST_TENANT_ID = "book-appt-test-tenant";
const TEST_TENANT_SLUG = "book-appt-test";
let TEST_CUSTOMER_ID: string;
let TEST_SERVICE_ID: string;
let TEST_STAFF_ID: string;

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
      email: "test@example.com",
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
      name: "Treatment Service",
      durationMinutes: 60,
      bufferMinutes: 0,
      priceCents: 50000,
    })
    .returning();

  TEST_SERVICE_ID = serviceRows[0]!.id;

  // Create staff
  const staffRows = await db
    .insert(schema.staff)
    .values({
      tenantId: TEST_TENANT_ID,
      name: "Staff Member",
      qualifications: ["treatment"],
      active: "true",
    })
    .returning();

  TEST_STAFF_ID = staffRows[0]!.id;

  // Mock adapter
  const mockAdapter = {
    createAppointment: vi.fn().mockResolvedValue({ success: true }),
    findAvailableSlots: vi.fn(),
    cancelAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
  };

  vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);
});

afterEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));
  vi.clearAllMocks();
});

describe("bookAppointment", () => {
  it("creates an appointment in the database", async () => {
    const startDate = new Date("2026-06-15T14:00:00Z");
    const endDate = new Date("2026-06-15T15:00:00Z");

    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: TEST_SERVICE_ID,
      staffId: TEST_STAFF_ID,
      startsAt: startDate,
      endsAt: endDate,
      notes: "Test appointment",
    });

    expect(result.success).toBe(true);
    expect(result.appointmentId).toBeDefined();
    expect(result.data?.serviceName).toBe("Treatment Service");
    expect(result.data?.staffName).toBe("Staff Member");

    // Verify in database
    const appointments = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, result.appointmentId!));

    expect(appointments).toHaveLength(1);
    expect(appointments[0]!.status).toBe("booked");
    expect(appointments[0]!.bookedVia).toBe("bot");
  });

  it("syncs appointment with calendar adapter", async () => {
    const mockAdapter = {
      createAppointment: vi.fn().mockResolvedValue({ success: true }),
    };

    vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);

    const startDate = new Date("2026-06-15T14:00:00Z");
    const endDate = new Date("2026-06-15T15:00:00Z");

    await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: TEST_SERVICE_ID,
      staffId: TEST_STAFF_ID,
      startsAt: startDate,
      endsAt: endDate,
    });

    expect(mockAdapter.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: TEST_CUSTOMER_ID,
        customerName: "Test Customer",
        customerEmail: "test@example.com",
        serviceId: TEST_SERVICE_ID,
        serviceName: "Treatment Service",
        staffId: TEST_STAFF_ID,
        staffName: "Staff Member",
        startsAt: startDate,
        endsAt: endDate,
      }),
    );
  });

  it("handles appointment without staff", async () => {
    const startDate = new Date("2026-06-15T14:00:00Z");
    const endDate = new Date("2026-06-15T15:00:00Z");

    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: TEST_SERVICE_ID,
      startsAt: startDate,
      endsAt: endDate,
    });

    expect(result.success).toBe(true);
    expect(result.data?.staffName).toBeUndefined();
  });

  it("includes conversation ID when provided", async () => {
    const conversationId = "conv-123";
    const startDate = new Date("2026-06-15T14:00:00Z");
    const endDate = new Date("2026-06-15T15:00:00Z");

    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: TEST_SERVICE_ID,
      startsAt: startDate,
      endsAt: endDate,
      conversationId,
    });

    expect(result.success).toBe(true);

    const appointments = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, result.appointmentId!));

    expect(appointments[0]!.conversationId).toBe(conversationId);
  });

  it("returns error when customer not found", async () => {
    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: "nonexistent-customer",
      serviceId: TEST_SERVICE_ID,
      startsAt: new Date("2026-06-15T14:00:00Z"),
      endsAt: new Date("2026-06-15T15:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");
  });

  it("returns error when service not found", async () => {
    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: "nonexistent-service",
      startsAt: new Date("2026-06-15T14:00:00Z"),
      endsAt: new Date("2026-06-15T15:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service not found");
  });

  it("returns error when customer belongs to different tenant", async () => {
    // Create another tenant and customer
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
        phone: "+9999999999",
        name: "Other Customer",
        languagePref: "he",
      })
      .returning();

    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: otherCustomerRows[0]!.id,
      serviceId: TEST_SERVICE_ID,
      startsAt: new Date("2026-06-15T14:00:00Z"),
      endsAt: new Date("2026-06-15T15:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });

  it("returns error when service belongs to different tenant", async () => {
    // Create another tenant and service
    const otherTenantId = "other-tenant-2";
    await db.insert(schema.tenants).values({
      id: otherTenantId,
      slug: "other-2",
      name: "Other Clinic 2",
      languageDefault: "he",
      status: "demo",
    });

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

    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: otherServiceRows[0]!.id,
      startsAt: new Date("2026-06-15T14:00:00Z"),
      endsAt: new Date("2026-06-15T15:00:00Z"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service not found");

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });

  it("handles adapter not being configured", async () => {
    vi.mocked(getCalendarAdapter).mockResolvedValue(null);

    const startDate = new Date("2026-06-15T14:00:00Z");
    const endDate = new Date("2026-06-15T15:00:00Z");

    const result = await bookAppointment({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: TEST_SERVICE_ID,
      startsAt: startDate,
      endsAt: endDate,
    });

    // Should still succeed in creating the appointment
    expect(result.success).toBe(true);
    expect(result.appointmentId).toBeDefined();
  });
});
