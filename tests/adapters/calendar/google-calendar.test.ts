import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleCalendarAdapter } from "@/lib/adapters/calendar/google-calendar";
import type {
  CreateAppointmentRequest,
  CreateAppointmentResponse,
  FindAvailableSlotsRequest,
  FindAvailableSlotsResponse,
} from "@/lib/adapters/calendar/types";
import { db } from "@/lib/db";

const TEST_TENANT_ID = "test-google-calendar-adapter";
const TEST_CONFIG = {
  googleAccessToken: "test-access-token",
  googleRefreshToken: "test-refresh-token",
  googleAccessTokenExpiresAt: Date.now() + 3600000, // 1 hour from now
};

describe("GoogleCalendarAdapter", () => {
  let adapter: GoogleCalendarAdapter;

  beforeEach(async () => {
    adapter = new GoogleCalendarAdapter(TEST_TENANT_ID, { ...TEST_CONFIG });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("findAvailableSlots", () => {
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

      const request: FindAvailableSlotsRequest = {
        startDate: new Date("2025-01-15T09:00:00Z"),
        endDate: new Date("2025-01-15T17:00:00Z"),
        durationMinutes: 60,
        bufferMinutes: 30,
        staffEmail: "staff@clinic.com",
      };

      const response: FindAvailableSlotsResponse = await adapter.findAvailableSlots(request);

      expect(response.success).toBe(true);
      expect(response.slots).toBeDefined();
      expect(Array.isArray(response.slots)).toBe(true);
      expect(response.slots?.length).toBeGreaterThan(0);
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

      const request: FindAvailableSlotsRequest = {
        startDate: new Date("2025-01-15T09:00:00Z"),
        endDate: new Date("2025-01-15T17:00:00Z"),
        durationMinutes: 60,
        bufferMinutes: 30,
        staffEmail: "staff@clinic.com",
      };

      const response: FindAvailableSlotsResponse = await adapter.findAvailableSlots(request);

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

      const request: FindAvailableSlotsRequest = {
        startDate: new Date("2025-01-15"),
        endDate: new Date("2025-01-15"),
        durationMinutes: 60,
        bufferMinutes: 30,
        staffEmail: "staff@clinic.com",
      };

      const response: FindAvailableSlotsResponse = await adapter.findAvailableSlots(request);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe("createAppointment", () => {
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
            attendees: [{ email: "customer@example.com" }, { email: "staff@clinic.com" }],
          }),
        }),
      );

      const request: CreateAppointmentRequest = {
        startTime: new Date("2025-01-15T14:00:00Z"),
        endTime: new Date("2025-01-15T15:00:00Z"),
        customerName: "John Doe",
        customerEmail: "customer@example.com",
        serviceName: "Laser Hair Removal",
        staffEmail: "staff@clinic.com",
      };

      const response: CreateAppointmentResponse = await adapter.createAppointment(request);

      expect(response.success).toBe(true);
      expect(response.eventId).toBe("calendar-event-123");
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

      const request: CreateAppointmentRequest = {
        startTime: new Date("2025-01-15T14:00:00Z"),
        endTime: new Date("2025-01-15T15:00:00Z"),
        customerName: "John Doe",
        customerEmail: "customer@example.com",
        serviceName: "Laser Hair Removal",
        staffEmail: "staff@clinic.com",
      };

      const response: CreateAppointmentResponse = await adapter.createAppointment(request);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe("token refresh", () => {
    it("uses valid token without refreshing", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const request: FindAvailableSlotsRequest = {
        startDate: new Date("2025-01-15T09:00:00Z"),
        endDate: new Date("2025-01-15T17:00:00Z"),
        durationMinutes: 60,
        bufferMinutes: 30,
        staffEmail: "staff@clinic.com",
      };

      await adapter.findAvailableSlots(request);

      // Only one fetch call to list events, not to refresh token
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain("googleapis.com");
    });

    it("refreshes expired token and calls database update", async () => {
      const expiredConfig = {
        googleAccessToken: "expired-token",
        googleRefreshToken: "refresh-token",
        googleAccessTokenExpiresAt: Date.now() - 1000, // Already expired
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

      // Mock the database update call
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      type UpdateMock = ReturnType<typeof updateMock>;
      vi.spyOn(db, "update").mockImplementation(updateMock as () => UpdateMock);

      const expiredAdapter = new GoogleCalendarAdapter(TEST_TENANT_ID, expiredConfig);

      const request: FindAvailableSlotsRequest = {
        startDate: new Date("2025-01-15T09:00:00Z"),
        endDate: new Date("2025-01-15T17:00:00Z"),
        durationMinutes: 60,
        bufferMinutes: 30,
        staffEmail: "staff@clinic.com",
      };

      const response: FindAvailableSlotsResponse = await expiredAdapter.findAvailableSlots(request);

      expect(response.success).toBe(true);
      // Verify refresh token call happened
      expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    });
  });
});
