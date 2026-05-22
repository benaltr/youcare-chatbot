import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type {
  CalendarAdapter,
  CancelAppointmentOptions,
  CancelAppointmentResponse,
  CreateAppointmentOptions,
  CreateAppointmentResponse,
  FindAvailableSlotsOptions,
  FindAvailableSlotsResponse,
  GoogleCalendarCredentials,
  RescheduleAppointmentOptions,
  RescheduleAppointmentResponse,
} from "./types";

/**
 * Google Calendar adapter for clinic scheduling
 * Handles OAuth token refresh, slot availability, and appointment creation/cancellation/rescheduling
 */
export class GoogleCalendarAdapter implements CalendarAdapter {
  private tenantId: string;
  private config: GoogleCalendarCredentials;
  private timezone: string;

  constructor(
    tenantId: string,
    config: GoogleCalendarCredentials,
    tenantConfig?: Record<string, unknown>,
  ) {
    this.tenantId = tenantId;
    this.config = config;
    this.timezone = (tenantConfig?.timezone as string) || "Asia/Jerusalem";
  }

  async findAvailableSlots(
    options: FindAvailableSlotsOptions,
  ): Promise<FindAvailableSlotsResponse> {
    try {
      await this.ensureValidToken();

      // Get staff calendar ID or email
      const calendarId = await this.getCalendarIdForStaff(options.staffId);
      if (!calendarId) {
        return {
          success: false,
          slots: [],
          error: "Staff calendar not found",
        };
      }

      // Get service duration and buffer
      const serviceDuration = options.durationMinutes;
      const bufferMinutes = options.bufferMinutes ?? 0;

      // Query Google Calendar API for events in the date range
      const timeMin = options.dateRange.start.toISOString();
      const timeMax = options.dateRange.end.toISOString();

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      );
      url.searchParams.append("timeMin", timeMin);
      url.searchParams.append("timeMax", timeMax);
      url.searchParams.append("singleEvents", "true");
      url.searchParams.append("orderBy", "startTime");

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.googleAccessToken}`,
        },
      });

      if (!response.ok) {
        const error = await this.parseGoogleApiError(response);
        return {
          success: false,
          slots: [],
          error: `Google Calendar API error: ${error}`,
        };
      }

      const calendarData = await response.json();
      const existingEvents = calendarData.items || [];

      // Find available slots considering duration and buffer
      const slots = this.findSlotsBetweenEvents(
        options.dateRange.start,
        options.dateRange.end,
        existingEvents,
        serviceDuration,
        bufferMinutes,
      );

      return {
        success: true,
        slots,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        slots: [],
        error: `Failed to find available slots: ${message}`,
      };
    }
  }

  async createAppointment(options: CreateAppointmentOptions): Promise<CreateAppointmentResponse> {
    try {
      await this.ensureValidToken();

      // Get staff calendar ID or email
      const calendarId = await this.getCalendarIdForStaff(options.staffId);
      if (!calendarId) {
        return {
          success: false,
          appointmentId: "",
          error: "Staff calendar not found",
        };
      }

      // Ensure we have customer email
      const customerEmail =
        options.customerEmail ?? (await this.getCustomerEmail(options.customerId));
      if (!customerEmail) {
        return {
          success: false,
          appointmentId: "",
          error: "Customer email not found",
        };
      }

      const event = {
        summary: `${options.serviceName} - ${options.customerName}`,
        description: `Appointment booked via YouCare AI Chatbot${options.notes ? `\n\n${options.notes}` : ""}`,
        start: {
          dateTime: options.startsAt.toISOString(),
          timeZone: this.timezone,
        },
        end: {
          dateTime: options.endsAt.toISOString(),
          timeZone: this.timezone,
        },
        attendees: [{ email: customerEmail }, { email: calendarId }],
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );

      if (!response.ok) {
        const error = await this.parseGoogleApiError(response);
        return {
          success: false,
          appointmentId: "",
          error: `Google Calendar API error: ${error}`,
        };
      }

      const createdEvent = await response.json();

      return {
        success: true,
        appointmentId: createdEvent.id,
        calendarUrl: createdEvent.htmlLink,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        appointmentId: "",
        error: `Failed to create appointment: ${message}`,
      };
    }
  }

  async cancelAppointment(options: CancelAppointmentOptions): Promise<CancelAppointmentResponse> {
    try {
      await this.ensureValidToken();

      const calendarId = this.config.googleCalendarId;
      if (!calendarId) {
        return {
          success: false,
          error: "Google calendar ID not configured",
        };
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(options.appointmentId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.config.googleAccessToken}`,
          },
        },
      );

      if (!response.ok) {
        const error = await this.parseGoogleApiError(response);
        return {
          success: false,
          error: `Google Calendar API error: ${error}`,
        };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to cancel appointment: ${message}`,
      };
    }
  }

  async rescheduleAppointment(
    options: RescheduleAppointmentOptions,
  ): Promise<RescheduleAppointmentResponse> {
    try {
      await this.ensureValidToken();

      const calendarId = this.config.googleCalendarId;
      if (!calendarId) {
        return {
          success: false,
          appointmentId: options.appointmentId,
          error: "Google calendar ID not configured",
        };
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(options.appointmentId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${this.config.googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start: {
              dateTime: options.newStartsAt.toISOString(),
              timeZone: this.timezone,
            },
            end: {
              dateTime: options.newEndsAt.toISOString(),
              timeZone: this.timezone,
            },
          }),
        },
      );

      if (!response.ok) {
        const error = await this.parseGoogleApiError(response);
        return {
          success: false,
          appointmentId: options.appointmentId,
          error: `Google Calendar API error: ${error}`,
        };
      }

      return {
        success: true,
        appointmentId: options.appointmentId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        appointmentId: options.appointmentId,
        error: `Failed to reschedule appointment: ${message}`,
      };
    }
  }

  /**
   * Parses error from Google API response
   * Handles cases where response body is not valid JSON
   */
  private async parseGoogleApiError(response: Response): Promise<string> {
    try {
      const data = await response.json();
      return data?.error?.message || data?.message || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}: ${response.statusText}`;
    }
  }

  /**
   * Ensures OAuth token is valid; refreshes if expired
   * Updates database after refresh with race condition protection
   * Implements optimistic check-and-set to handle concurrent requests
   */
  private async ensureValidToken(): Promise<void> {
    // Check if token needs refresh with 1 minute buffer
    const tokenBuffer = 60000;
    if (
      !this.config.googleAccessTokenExpiresAt ||
      Date.now() >= this.config.googleAccessTokenExpiresAt - tokenBuffer
    ) {
      // Fetch current config from DB to detect if another process already refreshed
      const currentConfig = await db.query.tenantAdapterConfigs.findFirst({
        where: and(
          eq(schema.tenantAdapterConfigs.tenantId, this.tenantId),
          eq(schema.tenantAdapterConfigs.category, "calendar"),
        ),
      });

      // Check again with DB version; if already refreshed by another process, use that token
      const dbCredentials = currentConfig?.credentials as GoogleCalendarCredentials | undefined;
      if (
        dbCredentials?.googleAccessTokenExpiresAt &&
        Date.now() < dbCredentials.googleAccessTokenExpiresAt - tokenBuffer
      ) {
        // Another process already refreshed; update our in-memory config
        this.config = dbCredentials;
        return;
      }

      // Token still expired; refresh it ourselves
      const newTokens = await this.refreshAccessToken();
      this.config.googleAccessToken = newTokens.accessToken;
      this.config.googleAccessTokenExpiresAt = newTokens.expiresAt;

      // Update database
      await db
        .update(schema.tenantAdapterConfigs)
        .set({ credentials: this.config as Record<string, unknown> })
        .where(
          and(
            eq(schema.tenantAdapterConfigs.tenantId, this.tenantId),
            eq(schema.tenantAdapterConfigs.category, "calendar"),
          ),
        );
    }
  }

  /**
   * Refreshes Google OAuth access token using refresh token
   */
  private async refreshAccessToken(): Promise<{
    accessToken: string;
    expiresAt: number;
  }> {
    const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!googleClientId || !googleClientSecret) {
      throw new Error(
        "Google OAuth credentials not configured (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)",
      );
    }

    if (!this.config.googleRefreshToken) {
      throw new Error("No refresh token available for token refresh");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: this.config.googleRefreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${error?.error_description || response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  /**
   * Gets calendar ID for a staff member
   * Returns googleCalendarId if staffId provided, otherwise returns configured calendarId
   */
  private async getCalendarIdForStaff(staffId?: string): Promise<string | null> {
    if (staffId) {
      // Query database for staff member's Google calendar ID
      const staffMember = await db.query.staff.findFirst({
        where: (staff, { and, eq }) => {
          const tenantId = this.tenantId as string;
          return and(eq(staff.tenantId, tenantId), eq(staff.id, staffId));
        },
      });
      return staffMember?.googleCalendarId ?? staffMember?.email ?? null;
    }

    // Fall back to configured calendar ID
    return this.config.googleCalendarId ?? null;
  }

  /**
   * Gets email address for a customer
   */
  private async getCustomerEmail(customerId: string): Promise<string | null> {
    const customer = await db.query.customers.findFirst({
      where: (customers, { and, eq }) => {
        const tenantId = this.tenantId as string;
        return and(eq(customers.tenantId, tenantId), eq(customers.id, customerId));
      },
    });
    return customer?.email ?? null;
  }

  /**
   * Finds available slots between existing events
   * Considers duration requirement and buffer time
   */
  private findSlotsBetweenEvents(
    startDate: Date,
    endDate: Date,
    events: Array<{
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
    }>,
    durationMinutes: number,
    bufferMinutes: number,
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = [];

    // Parse events and sort by start time
    const parsedEvents = events
      .map((event) => ({
        start: new Date(event.start.dateTime || event.start.date || ""),
        end: new Date(event.end.dateTime || event.end.date || ""),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    // Add buffer to each event
    const bufferedEvents = parsedEvents.map((event) => ({
      start: new Date(event.start.getTime() - bufferMinutes * 60000),
      end: new Date(event.end.getTime() + bufferMinutes * 60000),
    }));

    // Find gaps between events
    let currentTime = startDate;
    const requiredMinutes = durationMinutes + bufferMinutes;

    for (const event of bufferedEvents) {
      // If there's a gap before this event
      if (currentTime < event.start) {
        const gapDuration = (event.start.getTime() - currentTime.getTime()) / 60000;
        if (gapDuration >= requiredMinutes) {
          slots.push({
            start: new Date(currentTime),
            end: new Date(currentTime.getTime() + durationMinutes * 60000),
          });
        }
      }
      currentTime = event.end;
    }

    // Check for gap after last event
    if (currentTime < endDate) {
      const gapDuration = (endDate.getTime() - currentTime.getTime()) / 60000;
      if (gapDuration >= requiredMinutes) {
        slots.push({
          start: new Date(currentTime),
          end: new Date(currentTime.getTime() + durationMinutes * 60000),
        });
      }
    }

    return slots;
  }
}
