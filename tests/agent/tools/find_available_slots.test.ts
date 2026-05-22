import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarAdapter } from "@/lib/adapters";
import { findAvailableSlots } from "@/lib/agent/tools/find_available_slots";
import { db, schema } from "@/lib/db";

// Mock the calendar adapter
vi.mock("@/lib/adapters", async () => {
  const actual = await vi.importActual("@/lib/adapters");
  return {
    ...actual,
    getCalendarAdapter: vi.fn(),
  };
});

const TEST_TENANT_ID = "find-slots-test-tenant";
const TEST_TENANT_SLUG = "find-slots-test";
let TEST_SERVICE_ID: string;

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

  // Create service
  const serviceRows = await db
    .insert(schema.services)
    .values({
      tenantId: TEST_TENANT_ID,
      slug: "consultation",
      name: "Consultation",
      durationMinutes: 30,
      bufferMinutes: 15,
      priceCents: 0,
    })
    .returning();

  TEST_SERVICE_ID = serviceRows[0]!.id;
});

afterEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));
  vi.clearAllMocks();
});

describe("findAvailableSlots", () => {
  it("returns available slots from calendar adapter", async () => {
    const mockAdapter = {
      findAvailableSlots: vi.fn().mockResolvedValue({
        success: true,
        slots: [
          { start: new Date("2026-06-01T10:00:00Z"), end: new Date("2026-06-01T10:30:00Z") },
          { start: new Date("2026-06-01T11:00:00Z"), end: new Date("2026-06-01T11:30:00Z") },
        ],
      }),
    };

    vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);

    const startDate = new Date("2026-06-01");
    const endDate = new Date("2026-06-07");

    const result = await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: TEST_SERVICE_ID,
      startDate,
      endDate,
    });

    expect(result.success).toBe(true);
    expect(result.slots).toHaveLength(2);
    expect(result.serviceName).toBe("Consultation");
    expect(mockAdapter.findAvailableSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: TEST_SERVICE_ID,
        durationMinutes: 30,
        bufferMinutes: 15,
      }),
    );
  });

  it("includes staff ID in adapter call when provided", async () => {
    const staffId = "staff-123";
    const mockAdapter = {
      findAvailableSlots: vi.fn().mockResolvedValue({
        success: true,
        slots: [],
      }),
    };

    vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);

    await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: TEST_SERVICE_ID,
      staffId,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-07"),
    });

    expect(mockAdapter.findAvailableSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId,
      }),
    );
  });

  it("returns error when service not found", async () => {
    const result = await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: "nonexistent-service",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-07"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service not found");
  });

  it("returns error when calendar adapter is not configured", async () => {
    vi.mocked(getCalendarAdapter).mockResolvedValue(null);

    const result = await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: TEST_SERVICE_ID,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-07"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Calendar adapter not configured");
  });

  it("returns error when adapter fails", async () => {
    const mockAdapter = {
      findAvailableSlots: vi.fn().mockResolvedValue({
        success: false,
        error: "Calendar API error",
        slots: [],
      }),
    };

    vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);

    const result = await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: TEST_SERVICE_ID,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-07"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Calendar API error");
  });

  it("handles adapter throwing an exception", async () => {
    vi.mocked(getCalendarAdapter).mockRejectedValue(new Error("Connection failed"));

    const result = await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: TEST_SERVICE_ID,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-07"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection failed");
  });

  it("passes service duration and buffer to adapter", async () => {
    const mockAdapter = {
      findAvailableSlots: vi.fn().mockResolvedValue({
        success: true,
        slots: [],
      }),
    };

    vi.mocked(getCalendarAdapter).mockResolvedValue(mockAdapter as any);

    await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: TEST_SERVICE_ID,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-07"),
    });

    expect(mockAdapter.findAvailableSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMinutes: 30,
        bufferMinutes: 15,
      }),
    );
  });

  it("returns error when service belongs to different tenant", async () => {
    // Create another tenant and service
    const otherTenantId = "other-tenant";
    await db.insert(schema.tenants).values({
      id: otherTenantId,
      slug: "other",
      name: "Other Clinic",
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

    const result = await findAvailableSlots({
      tenantId: TEST_TENANT_ID,
      serviceId: otherServiceRows[0]!.id,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-07"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service not found");

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });
});
