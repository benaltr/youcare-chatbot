import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type {
  AvailableSlot,
  CalendarAdapter,
  CreateAppointmentRequest,
  CreateAppointmentResponse,
  FindAvailableSlotsRequest,
  FindAvailableSlotsResponse,
  GoogleCalendarCredentials,
} from "./types";

/**
 * Google Calendar adapter for clinic scheduling
 * Handles OAuth token refresh, slot availability, and appointment creation
 */
export class GoogleCalendarAdapter implements CalendarAdapter {
  private tenantId: string;
  private config: GoogleCalendarCredentials;

  constructor(tenantId: string, config: GoogleCalendarCredentials) {
    this.tenantId = tenantId;
    this.config = config;
  }

  async findAvailableSlots(
    request: FindAvailableSlotsRequest,
  ): Promise<FindAvailableSlotsResponse> {
    try {
      await this.ensureValidToken();

      // Query Google Calendar API for events in the date range
      const timeMin = request.startDate.toISOString();
      const timeMax = request.endDate.toISOString();

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(request.staffEmail)}/events`,
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
        const error = await response.json();
        return {
          success: false,
          error: `Google Calendar API error: ${error?.error?.message || response.statusText}`,
        };
      }

      const calendarData = await response.json();
      const existingEvents = calendarData.items || [];

      // Find available slots considering duration and buffer
      const slots = this.findSlotsBetweenEvents(
        request.startDate,
        request.endDate,
        existingEvents,
        request.durationMinutes,
        request.bufferMinutes,
      );

      return {
        success: true,
        slots,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to find available slots: ${message}`,
      };
    }
  }

  async createAppointment(request: CreateAppointmentRequest): Promise<CreateAppointmentResponse> {
    try {
      await this.ensureValidToken();

      const event = {
        summary: `${request.serviceName} - ${request.customerName}`,
        description: `Appointment booked via YouCare AI Chatbot`,
        start: {
          dateTime: request.startTime.toISOString(),
          timeZone: "Asia/Jerusalem", // Default to Israel timezone
        },
        end: {
          dateTime: request.endTime.toISOString(),
          timeZone: "Asia/Jerusalem",
        },
        attendees: [{ email: request.customerEmail }, { email: request.staffEmail }],
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(request.staffEmail)}/events`,
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
        const error = await response.json();
        return {
          success: false,
          error: `Google Calendar API error: ${error?.error?.message || response.statusText}`,
        };
      }

      const createdEvent = await response.json();

      return {
        success: true,
        eventId: createdEvent.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to create appointment: ${message}`,
      };
    }
  }

  /**
   * Ensures OAuth token is valid; refreshes if expired
   * Updates database after refresh
   */
  private async ensureValidToken(): Promise<void> {
    if (
      !this.config.googleAccessTokenExpiresAt ||
      Date.now() >= this.config.googleAccessTokenExpiresAt
    ) {
      // Token expired or missing; refresh using refresh token
      const newTokens = await this.refreshAccessToken();
      this.config.googleAccessToken = newTokens.accessToken;
      this.config.googleAccessTokenExpiresAt = newTokens.expiresAt;

      // Update database synchronously
      await db
        .update(schema.tenantAdapterConfigs)
        .set({ credentials: this.config })
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
  ): AvailableSlot[] {
    const slots: AvailableSlot[] = [];

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
