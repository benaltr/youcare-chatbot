/**
 * Utility functions for agent tools
 */

/**
 * Format a date in Hebrew format suitable for user-facing messages
 * Example: "ראשון, 25 במאי בשעה 14:30"
 */
export function formatDateHebrew(date: Date): string {
  const daysHebrew = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const monthsHebrew = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];

  const dayName = daysHebrew[date.getDay()];
  const dayOfMonth = date.getDate();
  const monthName = monthsHebrew[date.getMonth()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${dayName}, ${dayOfMonth} ב${monthName} בשעה ${hours}:${minutes}`;
}

/**
 * Format a time range in Hebrew
 * Example: "14:30 - 15:30"
 */
export function formatTimeRange(startDate: Date, endDate: Date): string {
  const startHours = String(startDate.getHours()).padStart(2, "0");
  const startMinutes = String(startDate.getMinutes()).padStart(2, "0");
  const endHours = String(endDate.getHours()).padStart(2, "0");
  const endMinutes = String(endDate.getMinutes()).padStart(2, "0");

  return `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;
}

/**
 * Format business hours from config to readable string
 * Example: "9:00 - 17:00"
 */
export function formatBusinessHours(hoursObj: { open: string; close: string }): string {
  return `${hoursObj.open} - ${hoursObj.close}`;
}

/**
 * Get day of week name in Hebrew
 */
export function getDayNameHebrew(date: Date): string {
  const daysHebrew = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  return daysHebrew[date.getDay()];
}

/**
 * Format price in ILS (Israeli Shekel)
 */
export function formatPrice(priceCents: number): string {
  const priceNIS = priceCents / 100;
  return `₪${priceNIS.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

/**
 * Group available slots by date with string keys (e.g., "Friday, January 15")
 * Returns a record with date strings as keys and time arrays as values
 */
export function groupSlotsByDate(
  slots: Array<{ start: Date; end: Date }>,
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const slot of slots) {
    const dayName = getDayNameHebrew(slot.start);
    const dayOfMonth = slot.start.getDate();
    const monthsHebrew = [
      "ינואר",
      "פברואר",
      "מרץ",
      "אפריל",
      "מאי",
      "יוני",
      "יולי",
      "אוגוסט",
      "ספטמבר",
      "אוקטובר",
      "נובמבר",
      "דצמבר",
    ];
    const monthName = monthsHebrew[slot.start.getMonth()];
    const dateKey = `${dayName}, ${dayOfMonth} ב${monthName}`;

    const timeStr = formatTimeRange(slot.start, slot.end);

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey]!.push(timeStr);
  }

  return grouped;
}
