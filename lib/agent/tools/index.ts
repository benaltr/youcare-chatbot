/**
 * Agent booking tools index
 * Exports all tools for use by the agent
 */

export {
  type BookAppointmentInput,
  type BookAppointmentResult,
  bookAppointment,
} from "./book_appointment";
export {
  type CancelAppointmentInput,
  type CancelAppointmentResult,
  cancelAppointment,
} from "./cancel_appointment";
export {
  type FindAvailableSlotsInput,
  type FindAvailableSlotsResult,
  findAvailableSlots,
} from "./find_available_slots";
export {
  type GetClinicInfoInput,
  type GetClinicInfoResult,
  getClinicInfo,
} from "./get_clinic_info";
export {
  type GetCustomerProfileInput,
  type GetCustomerProfileResult,
  getCustomerProfile,
} from "./get_customer_profile";
export {
  type RescheduleAppointmentInput,
  type RescheduleAppointmentResult,
  rescheduleAppointment,
} from "./reschedule_appointment";
export * from "./utils";
