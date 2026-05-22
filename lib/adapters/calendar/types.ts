/**
 * Calendar adapter interface for multi-tenant clinic scheduling
 * Implementations handle clinic-specific calendar systems (Google Calendar, etc.)
 */

export interface AvailableSlot {
  start: Date;
  end: Date;
}

export interface FindAvailableSlotsRequest {
  startDate: Date;
  endDate: Date;
  durationMinutes: number;
  bufferMinutes: number;
  staffEmail: string;
}

export interface FindAvailableSlotsResponse {
  success: boolean;
  slots?: AvailableSlot[];
  error?: string;
}

export interface CreateAppointmentRequest {
  startTime: Date;
  endTime: Date;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  staffEmail: string;
}

export interface CreateAppointmentResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface CalendarAdapter {
  findAvailableSlots(request: FindAvailableSlotsRequest): Promise<FindAvailableSlotsResponse>;
  createAppointment(request: CreateAppointmentRequest): Promise<CreateAppointmentResponse>;
}

export interface GoogleCalendarCredentials {
  googleAccessToken: string;
  googleRefreshToken: string;
  googleAccessTokenExpiresAt: number;
}
