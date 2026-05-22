/**
 * Calendar adapter interface for multi-tenant clinic scheduling
 * Implementations handle clinic-specific calendar systems (Google Calendar, etc.)
 */

export interface AvailableSlot {
  start: Date;
  end: Date;
}

export interface FindAvailableSlotsOptions {
  serviceId: string;
  staffId?: string;
  dateRange: { start: Date; end: Date };
  durationMinutes: number;
  bufferMinutes?: number;
}

export interface FindAvailableSlotsResponse {
  success: boolean;
  slots: Array<{ start: Date; end: Date }>;
  error?: string;
}

export interface CreateAppointmentOptions {
  customerId: string;
  customerName: string;
  customerEmail?: string;
  serviceId: string;
  serviceName: string;
  staffId?: string;
  staffName?: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string;
}

export interface CreateAppointmentResponse {
  success: boolean;
  appointmentId: string;
  calendarUrl?: string;
  error?: string;
}

export interface CancelAppointmentOptions {
  appointmentId: string;
  reason?: string;
}

export interface CancelAppointmentResponse {
  success: boolean;
  error?: string;
}

export interface RescheduleAppointmentOptions {
  appointmentId: string;
  newStartsAt: Date;
  newEndsAt: Date;
}

export interface RescheduleAppointmentResponse {
  success: boolean;
  appointmentId: string;
  error?: string;
}

export interface CalendarAdapter {
  findAvailableSlots(options: FindAvailableSlotsOptions): Promise<FindAvailableSlotsResponse>;

  createAppointment(options: CreateAppointmentOptions): Promise<CreateAppointmentResponse>;

  cancelAppointment(options: CancelAppointmentOptions): Promise<CancelAppointmentResponse>;

  rescheduleAppointment(
    options: RescheduleAppointmentOptions,
  ): Promise<RescheduleAppointmentResponse>;
}

export interface GoogleCalendarCredentials {
  googleAccessToken: string;
  googleRefreshToken: string;
  googleAccessTokenExpiresAt: number;
  googleCalendarId?: string;
}
