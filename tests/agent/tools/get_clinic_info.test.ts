import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getClinicInfo } from "@/lib/agent/tools/get_clinic_info";
import { db, schema } from "@/lib/db";

const TEST_TENANT_ID = "clinic-info-test-tenant";
const TEST_TENANT_SLUG = "clinic-info-test";

beforeEach(async () => {
  // Clean up before test
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));

  // Create test tenant
  await db.insert(schema.tenants).values({
    id: TEST_TENANT_ID,
    slug: TEST_TENANT_SLUG,
    name: "Test Clinic",
    whatsappNumber: "+1234567890",
    languageDefault: "he",
    status: "demo",
  });

  // Create tenant config
  await db.insert(schema.tenantConfigs).values({
    tenantId: TEST_TENANT_ID,
    personaName: "Test Assistant",
    personaSystemPrompt: "You are a test assistant",
    businessHours: {
      Monday: { open: "09:00", close: "17:00" },
      Tuesday: { open: "09:00", close: "17:00" },
    },
  });

  // Create test services
  await db.insert(schema.services).values([
    {
      tenantId: TEST_TENANT_ID,
      slug: "laser-hair-removal",
      name: "Laser Hair Removal",
      durationMinutes: 45,
      bufferMinutes: 15,
      priceCents: 50000,
      category: "Hair Removal",
    },
    {
      tenantId: TEST_TENANT_ID,
      slug: "facial",
      name: "Facial Treatment",
      durationMinutes: 60,
      bufferMinutes: 0,
      priceCents: 40000,
      category: "Facials",
    },
  ]);

  // Create test staff
  await db.insert(schema.staff).values([
    {
      tenantId: TEST_TENANT_ID,
      name: "Sarah",
      qualifications: ["laser", "facial"],
      active: "true",
    },
    {
      tenantId: TEST_TENANT_ID,
      name: "David",
      qualifications: ["facial"],
      active: "true",
    },
  ]);
});

afterEach(async () => {
  // Clean up after test
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));
});

describe("getClinicInfo", () => {
  it("returns all info (default field)", async () => {
    const result = await getClinicInfo({ tenantId: TEST_TENANT_ID });

    expect(result.success).toBe(true);
    expect(result.message).toBeTruthy();
    expect(result.data?.contact?.name).toBe("Test Clinic");
    expect(result.data?.contact?.phone).toBe("+1234567890");
    expect(result.data?.hours).toBeDefined();
    expect(result.data?.services).toBeDefined();
  });

  it("returns only contact info when field='contact'", async () => {
    const result = await getClinicInfo({ tenantId: TEST_TENANT_ID, field: "contact" });

    expect(result.success).toBe(true);
    expect(result.data?.contact?.name).toBe("Test Clinic");
    expect(result.data?.contact?.phone).toBe("+1234567890");
    expect(result.data?.hours).toBeUndefined();
    expect(result.data?.services).toBeUndefined();
  });

  it("returns only business hours when field='hours'", async () => {
    const result = await getClinicInfo({ tenantId: TEST_TENANT_ID, field: "hours" });

    expect(result.success).toBe(true);
    expect(result.data?.hours).toBeDefined();
    expect(result.data?.hours?.Monday).toEqual({ open: "09:00", close: "17:00" });
    expect(result.data?.contact).toBeUndefined();
    expect(result.data?.services).toBeUndefined();
  });

  it("returns only services when field='services'", async () => {
    const result = await getClinicInfo({ tenantId: TEST_TENANT_ID, field: "services" });

    expect(result.success).toBe(true);
    expect(result.data?.services).toBeDefined();
    expect(result.data?.services).toHaveLength(2);
    expect(result.data?.services?.[0]?.name).toBe("Laser Hair Removal");
    expect(result.data?.hours).toBeUndefined();
    expect(result.data?.contact).toBeUndefined();
  });

  it("includes service details (duration, price, category)", async () => {
    const result = await getClinicInfo({ tenantId: TEST_TENANT_ID, field: "services" });

    expect(result.success).toBe(true);
    const laserService = result.data?.services?.[0];
    expect(laserService?.durationMinutes).toBe(45);
    expect(laserService?.priceCents).toBe(50000);
    expect(laserService?.category).toBe("Hair Removal");
  });

  it("returns error when clinic not found", async () => {
    const result = await getClinicInfo({ tenantId: "nonexistent-clinic" });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Clinic not found");
  });

  it("handles clinic with no business hours config", async () => {
    // Create a clinic without business hours
    const noHoursId = "no-hours-clinic";
    await db.insert(schema.tenants).values({
      id: noHoursId,
      slug: "no-hours",
      name: "No Hours Clinic",
      languageDefault: "he",
      status: "demo",
    });

    await db.insert(schema.tenantConfigs).values({
      tenantId: noHoursId,
      personaName: "Assistant",
      personaSystemPrompt: "Test",
    });

    const result = await getClinicInfo({ tenantId: noHoursId });

    expect(result.success).toBe(true);
    expect(result.data?.hours).toBeUndefined();

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, noHoursId));
  });

  it("handles empty services and staff lists", async () => {
    // Create a new tenant with no services
    const emptyId = "empty-clinic";
    await db.insert(schema.tenants).values({
      id: emptyId,
      slug: "empty",
      name: "Empty Clinic",
      languageDefault: "he",
      status: "demo",
    });

    await db.insert(schema.tenantConfigs).values({
      tenantId: emptyId,
      personaName: "Assistant",
      personaSystemPrompt: "Test",
    });

    const result = await getClinicInfo({ tenantId: emptyId });

    expect(result.success).toBe(true);
    expect(result.data?.services).toHaveLength(0);

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, emptyId));
  });
});
