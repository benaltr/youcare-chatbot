import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCustomerProfile } from "@/lib/agent/tools/get_customer_profile";
import { db, schema } from "@/lib/db";

const TEST_TENANT_ID = "customer-profile-test-tenant";
const TEST_TENANT_SLUG = "customer-profile-test";
let TEST_CUSTOMER_ID: string;
let TEST_SERVICE_ID: string;

beforeEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));

  // Create test tenant
  const tenantRows = await db
    .insert(schema.tenants)
    .values({
      id: TEST_TENANT_ID,
      slug: TEST_TENANT_SLUG,
      name: "Test Clinic",
      languageDefault: "he",
      status: "demo",
    })
    .returning();

  // Create customer
  const customerRows = await db
    .insert(schema.customers)
    .values({
      tenantId: TEST_TENANT_ID,
      phone: "+1234567890",
      name: "John Doe",
      email: "john@example.com",
      languagePref: "he",
      profile: { notes: "Test customer" },
    })
    .returning();

  TEST_CUSTOMER_ID = customerRows[0]!.id;

  // Create service
  const serviceRows = await db
    .insert(schema.services)
    .values({
      tenantId: TEST_TENANT_ID,
      slug: "laser-removal",
      name: "Laser Hair Removal",
      durationMinutes: 45,
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
      name: "Sarah",
      qualifications: ["laser"],
      active: "true",
    })
    .returning();

  // Create upcoming appointment
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);

  await db.insert(schema.appointments).values({
    tenantId: TEST_TENANT_ID,
    customerId: TEST_CUSTOMER_ID,
    serviceId: TEST_SERVICE_ID,
    staffId: staffRows[0]!.id,
    startsAt: futureDate,
    endsAt: new Date(futureDate.getTime() + 45 * 60 * 1000),
    status: "booked",
    bookedVia: "bot",
  });

  // Create package
  await db.insert(schema.packages).values({
    tenantId: TEST_TENANT_ID,
    customerId: TEST_CUSTOMER_ID,
    serviceId: TEST_SERVICE_ID,
    totalSessions: 10,
    sessionsUsed: 2,
    pricePaidCents: 500000,
    purchasedAt: new Date(),
    status: "active",
  });
});

afterEach(async () => {
  // Clean up
  await db.delete(schema.tenants).where(eq(schema.tenants.id, TEST_TENANT_ID));
});

describe("getCustomerProfile", () => {
  it("returns customer basic info", async () => {
    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("John Doe");
    expect(result.data?.phone).toBe("+1234567890");
    expect(result.data?.email).toBe("john@example.com");
  });

  it("returns customer language preference and profile data", async () => {
    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data?.languagePref).toBe("he");
    expect(result.data?.profile?.notes).toBe("Test customer");
  });

  it("returns upcoming appointments", async () => {
    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data?.upcomingAppointments).toHaveLength(1);
    expect(result.data?.upcomingAppointments[0]?.serviceName).toBe("Laser Hair Removal");
    expect(result.data?.upcomingAppointments[0]?.staffName).toBe("Sarah");
  });

  it("returns active packages with session info", async () => {
    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data?.packages).toHaveLength(1);
    expect(result.data?.packages[0]?.serviceName).toBe("Laser Hair Removal");
    expect(result.data?.packages[0]?.totalSessions).toBe(10);
    expect(result.data?.packages[0]?.sessionsUsed).toBe(2);
    expect(result.data?.packages[0]?.status).toBe("active");
  });

  it("returns error when customer not found", async () => {
    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: "nonexistent-customer",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");
  });

  it("returns error when customer does not belong to tenant", async () => {
    // Create a customer in a different tenant
    const otherTenantId = "other-tenant-id";
    await db.insert(schema.tenants).values({
      id: otherTenantId,
      slug: "other-tenant",
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

    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: otherCustomerRows[0]!.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");

    // Clean up
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });

  it("returns empty appointments when none are booked", async () => {
    // Create a new customer with no appointments
    const newCustomerRows = await db
      .insert(schema.customers)
      .values({
        tenantId: TEST_TENANT_ID,
        phone: "+9876543210",
        name: "Jane Doe",
        languagePref: "he",
      })
      .returning();

    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: newCustomerRows[0]!.id,
    });

    expect(result.success).toBe(true);
    expect(result.data?.upcomingAppointments).toHaveLength(0);
  });

  it("returns empty packages when none are active", async () => {
    // Create a new customer with no packages
    const newCustomerRows = await db
      .insert(schema.customers)
      .values({
        tenantId: TEST_TENANT_ID,
        phone: "+1111111111",
        name: "Bob Smith",
        languagePref: "he",
      })
      .returning();

    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: newCustomerRows[0]!.id,
    });

    expect(result.success).toBe(true);
    expect(result.data?.packages).toHaveLength(0);
  });

  it("only returns booked appointments, not cancelled ones", async () => {
    // Create a cancelled appointment
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);

    await db.insert(schema.appointments).values({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
      serviceId: TEST_SERVICE_ID,
      startsAt: futureDate,
      endsAt: new Date(futureDate.getTime() + 45 * 60 * 1000),
      status: "cancelled",
      bookedVia: "bot",
    });

    const result = await getCustomerProfile({
      tenantId: TEST_TENANT_ID,
      customerId: TEST_CUSTOMER_ID,
    });

    expect(result.success).toBe(true);
    // Should still only have 1 appointment (the booked one)
    expect(result.data?.upcomingAppointments).toHaveLength(1);
  });
});
