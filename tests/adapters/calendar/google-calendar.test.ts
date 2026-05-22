import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleCalendarAdapter } from "@/lib/adapters/calendar/google-calendar";
import type {
  CancelAppointmentOptions,
  CancelAppointmentResponse,
  CreateAppointmentOptions,
  CreateAppointmentResponse,
  FindAvailableSlotsOptions,
  FindAvailableSlotsResponse,
  RescheduleAppointmentOptions,
  RescheduleAppointmentResponse,
} from "@/lib/adapters/calendar/types";
import { db } from "@/lib/db";

const TEST_TENANT_ID = "test-google-calendar-adapter";
const TEST_CONFIG = {
  googleAccessToken: "test-access-token",
  googleRefreshToken: "test-refresh-token",
  googleAccessTokenExpiresAt: Date.now() + 3600000, // 1 hour from now
  googleCalendarId: "test-calendar-id",
};

const TEST_STAFF_ID = "test-staff-id";
const TEST_CUSTOMER_ID = "test-customer-id";
const TEST_SERVICE_ID = "test-service-id";

describe("GoogleCalendarAdapter", () => {
  let adapter: GoogleCalendarAdapter;

  beforeEach(async () => {
    adapter = new GoogleCalendarAdapter(
      TEST_TENANT_ID,
      { ...TEST_CONFIG },
      { timezone: "Asia/Jerusalem" },
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("findAvailableSlots", () => {
    beforeEach(() => {
      // Mock database queries for staff
      vi.spyOn(db.query.staff, "findFirst").mockResolvedValue({
        id: TEST_STAFF_ID,
        tenantId: TEST_TENANT_ID,
        name: "Test Staff",
        email: "staff@clinic.com",
        qualifications: [],
        googleCalendarId: "staff-calendar-id",
        externalId: null,
        source: null,
        active: "true",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });

    it("returns slots when calendar is empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [],
          }),
        }),
      );

      const options: FindAvailableSlotsOptions = {
        serviceId: TEST_SERVICE_ID,
        staffId: TEST_STAFF_ID,
        dateRange: {
          start: new Date("2025-01-15T09:00:00Z"),
          end: new Date("2025-01-15T17:00:00Z"),
        },
        durationMinutes: 60,
        bufferMinutes: 30,
      };

      const response: FindAvailableSlotsResponse = await adapter.findAvailableSlots(options);

      expect(response.success).toBe(true);
      expect(response.slots).toBeDefined();
      expect(Array.isArray(response.slots)).toBe(true);
      expect(response.slots.length).toBeGreaterThan(0);
    });

    it("finds slots between existing events", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "event1",
                start: { dateTime: "2025-01-15T10:00:00Z" },
                end: { dateTime: "2025-01-15T11:00:00Z" },
              },
            ],
          }),
        }),
      );

      const options: FindAvailableSlotsOptions = {
        serviceId: TEST_SERVICE_ID,
        staffId: TEST_STAFF_ID,
        dateRange: {
          start: new Date("2025-01-15T09:00:00Z"),
          end: new Date("2025-01-15T17:00:00Z"),
        },
        durationMinutes: 60,
        bufferMinutes: 30,
      };

      const response: FindAvailableSlotsResponse = await adapter.findAvailableSlots(options);

      expect(response.success).toBe(true);
      expect(response.slots).toBeDefined();
      expect(Array.isArray(response.slots)).toBe(true);
    });

    it("returns error when Google API fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          statusText: "Unauthorized",
          json: async () => ({
            error: { message: "Invalid credentials" },
          }),
        }),
      );

      const options: FindAvailableSlotsOptions = {
        serviceId: TEST_SERVICE_ID,
        staffId: TEST_STAFF_ID,
        dateRange: {
          start: new Date("2025-01-15T09:00:00Z"),
          end: new Date("2025-01-15T17:00:00Z"),
        },
        durationMinutes: 60,
        bufferMinutes: 30,
      };

      const response: FindAvailableSlotsResponse = await adapter.findAvailableSlots(options);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.slots).toEqual([]);
    });

    it("uses defaultBufferMinutes when bufferMinutes is not provided", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [],
          }),
        }),
      );

      const options: FindAvailableSlotsOptions = {
        serviceId: TEST_SERVICE_ID,
        staffId: TEST_STAFF_ID,
        dateRange: {
          start: new Date("2025-01-15T09:00:00Z"),
          end: new Date("2025-01-15T17:00:00Z"),
        },
        durationMinutes: 60,
        // bufferMinutes not provided
      };

      const response: FindAvailableSlotsResponse = await adapter.findAvailableSlots(options);

      expect(response.success).toBe(true);
      expect(response.slots.length).toBeGreaterThan(0);
    });
  });

  describe("createAppointment", () => {
    beforeEach(() => {
      // Mock database queries for staff and customer
      vi.spyOn(db.query.staff, "findFirst").mockResolvedValue({
        id: TEST_STAFF_ID,
        tenantId: TEST_TENANT_ID,
        name: "Test Staff",
        email: "staff@clinic.com",
        qualifications: [],
        googleCalendarId: "staff-calendar-id",
        externalId: null,
        source: null,
        active: "true",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(db.query.customers, "findFirst").mockResolvedValue({
        id: TEST_CUSTOMER_ID,
        tenantId: TEST_TENANT_ID,
        phone: "0501234567",
        name: "John Doe",
        email: "customer@example.com",
        languagePref: "he",
        profile: {},
        externalId: null,
        source: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });

    it("creates appointment successfully", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "calendar-event-123",
            summary: "Laser Hair Removal - John Doe",
            start: { dateTime: "2025-01-15T14:00:00Z" },
            end: { dateTime: "2025-01-15T15:00:00Z" },
            htmlLink: "https://calendar.google.com/calendar/u/0/r/eventedit/...",
            attendees: [{ email: "customer@example.com" }, { email: "staff@clinic.com" }],
          }),
        }),
      );

      const options: CreateAppointmentOptions = {
        customerId: TEST_CUSTOMER_ID,
        customerName: "John Doe",
        customerEmail: "customer@example.com",
        serviceId: TEST_SERVICE_ID,
        serviceName: "Laser Hair Removal",
        staffId: TEST_STAFF_ID,
        staffName: "Test Staff",
        startsAt: new Date("2025-01-15T14:00:00Z"),
        endsAt: new Date("2025-01-15T15:00:00Z"),
        notes: "Customer prefers morning appointments",
      };

      const response: CreateAppointmentResponse = await adapter.createAppointment(options);

      expect(response.success).toBe(true);
      expect(response.appointmentId).toBe("calendar-event-123");
      expect(response.calendarUrl).toBeDefined();
    });

    it("returns error when appointment creation fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          statusText: "Forbidden",
          json: async () => ({
            error: { message: "Permission denied" },
          }),
        }),
      );

      const options: CreateAppointmentOptions = {
        customerId: TEST_CUSTOMER_ID,
        customerName: "John Doe",
        customerEmail: "customer@example.com",
        serviceId: TEST_SERVICE_ID,
        serviceName: "Laser Hair Removal",
        staffId: TEST_STAFF_ID,
        startsAt: new Date("2025-01-15T14:00:00Z"),
        endsAt: new Date("2025-01-15T15:00:00Z"),
      };

      const response: CreateAppointmentResponse = await adapter.createAppointment(options);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.appointmentId).toBe("");
    });

    it("fetches customer email from database when not provided", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "calendar-event-123",
            htmlLink: "https://calendar.google.com/...",
          }),
        }),
      );

      const options: CreateAppointmentOptions = {
        customerId: TEST_CUSTOMER_ID,
        customerName: "John Doe",
        // customerEmail not provided
        serviceId: TEST_SERVICE_ID,
        serviceName: "Laser Hair Removal",
        staffId: TEST_STAFF_ID,
        startsAt: new Date("2025-01-15T14:00:00Z"),
        endsAt: new Date("2025-01-15T15:00:00Z"),
      };

      const response: CreateAppointmentResponse = await adapter.createAppointment(options);

      expect(response.success).toBe(true);
      expect(response.appointmentId).toBe("calendar-event-123");
    });
  });

  describe("cancelAppointment", () => {
    it("cancels appointment successfully", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
        }),
      );

      const options: CancelAppointmentOptions = {
        appointmentId: "calendar-event-123",
        reason: "Customer requested cancellation",
      };

      const response: CancelAppointmentResponse = await adapter.cancelAppointment(options);

      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
    });

    it("returns error when cancellation fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          statusText: "Not Found",
          json: async () => ({
            error: { message: "Event not found" },
          }),
        }),
      );

      const options: CancelAppointmentOptions = {
        appointmentId: "non-existent-event",
      };

      const response: CancelAppointmentResponse = await adapter.cancelAppointment(options);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe("rescheduleAppointment", () => {
    it("reschedules appointment successfully", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
        }),
      );

      const options: RescheduleAppointmentOptions = {
        appointmentId: "calendar-event-123",
        newStartsAt: new Date("2025-01-16T10:00:00Z"),
        newEndsAt: new Date("2025-01-16T11:00:00Z"),
      };

      const response: RescheduleAppointmentResponse = await adapter.rescheduleAppointment(options);

      expect(response.success).toBe(true);
      expect(response.appointmentId).toBe("calendar-event-123");
      expect(response.error).toBeUndefined();
    });

    it("returns error when rescheduling fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          statusText: "Conflict",
          json: async () => ({
            error: { message: "Time slot already booked" },
          }),
        }),
      );

      const options: RescheduleAppointmentOptions = {
        appointmentId: "calendar-event-123",
        newStartsAt: new Date("2025-01-16T10:00:00Z"),
        newEndsAt: new Date("2025-01-16T11:00:00Z"),
      };

      const response: RescheduleAppointmentResponse = await adapter.rescheduleAppointment(options);

      expect(response.success).toBe(false);
      expect(response.appointmentId).toBe("calendar-event-123");
      expect(response.error).toBeDefined();
    });
  });

  describe("token refresh", () => {
    it("uses valid token without refreshing", async () => {
      vi.spyOn(db.query.staff, "findFirst").mockResolvedValue({
        id: TEST_STAFF_ID,
        tenantId: TEST_TENANT_ID,
        name: "Test Staff",
        email: "staff@clinic.com",
        qualifications: [],
        googleCalendarId: "staff-calendar-id",
        externalId: null,
        source: null,
        active: "true",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const options: FindAvailableSlotsOptions = {
        serviceId: TEST_SERVICE_ID,
        staffId: TEST_STAFF_ID,
        dateRange: {
          start: new Date("2025-01-15T09:00:00Z"),
          end: new Date("2025-01-15T17:00:00Z"),
        },
        durationMinutes: 60,
        bufferMinutes: 30,
      };

      await adapter.findAvailableSlots(options);

      // Only one fetch call to list events, not to refresh token
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain("googleapis.com");
    });

    it("refreshes expired token and calls database update", async () => {
      const expiredConfig = {
        googleAccessToken: "expired-token",
        googleRefreshToken: "refresh-token",
        googleAccessTokenExpiresAt: Date.now() - 1000, // Already expired
        googleCalendarId: "test-calendar-id",
      };

      const fetchMock = vi.fn();
      // First call: refresh token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          expires_in: 3600,
        }),
      });
      // Second call: list events
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      // Mock environment variables
      vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id");
      vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");

      // Mock database queries
      vi.spyOn(db.query.staff, "findFirst").mockResolvedValue({
        id: TEST_STAFF_ID,
        tenantId: TEST_TENANT_ID,
        name: "Test Staff",
        email: "staff@clinic.com",
        qualifications: [],
        googleCalendarId: "staff-calendar-id",
        externalId: null,
        source: null,
        active: "true",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Mock the database query and update calls
      vi.spyOn(db.query.tenantAdapterConfigs, "findFirst").mockResolvedValue({
        tenantId: TEST_TENANT_ID,
        category: "calendar",
        adapter: "google_calendar",
        credentials: expiredConfig,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      type UpdateMock = ReturnType<typeof updateMock>;
      vi.spyOn(db, "update").mockImplementation(updateMock as () => UpdateMock);

      const expiredAdapter = new GoogleCalendarAdapter(TEST_TENANT_ID, expiredConfig, {
        timezone: "Asia/Jerusalem",
      });

      const options: FindAvailableSlotsOptions = {
        serviceId: TEST_SERVICE_ID,
        staffId: TEST_STAFF_ID,
        dateRange: {
          start: new Date("2025-01-15T09:00:00Z"),
          end: new Date("2025-01-15T17:00:00Z"),
        },
        durationMinutes: 60,
        bufferMinutes: 30,
      };

      const response: FindAvailableSlotsResponse = await expiredAdapter.findAvailableSlots(options);

      expect(response.success).toBe(true);
      // Verify refresh token call happened
      expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    });
  });
});
