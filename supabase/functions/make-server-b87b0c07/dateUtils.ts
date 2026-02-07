/**
 * SYNC: This file must stay in sync with:
 * src/utils/dateUtils.ts
 * Last synced: 2026-02-07
 *
 * Centralized Date/Time Utilities for WellNest Pilates
 * Timezone: Europe/Skopje (UTC+1/+2 with DST)
 */

// ============ TIMEZONE UTILITIES ============

/**
 * Get current date/time in Skopje timezone
 */
export const getSkopjeTime = (): Date => {
  const now = new Date();
  const skopjeTimeString = now.toLocaleString('en-US', {
    timeZone: 'Europe/Skopje',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return new Date(skopjeTimeString);
};

/**
 * Get today's date at midnight in Skopje timezone
 */
export const getSkopjeToday = (): Date => {
  const today = getSkopjeTime();
  today.setHours(0, 0, 0, 0);
  return today;
};

// ============ DATE CHECKS ============

/**
 * Check if a date is a weekday (Monday-Friday)
 */
export const isWeekday = (date: Date): boolean => {
  const dayOfWeek = date.getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
};

/**
 * Check if a date is valid for booking:
 * - Not in the past
 * - Is a weekday (Mon-Fri)
 */
export const isValidBookingDate = (date: Date): boolean => {
  const today = getSkopjeToday();
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);

  // Must be today or future
  if (compareDate < today) {
    return false;
  }

  // Must be a weekday
  return isWeekday(compareDate);
};

/**
 * Check if a date is in the past (before today)
 */
export const isDateInPast = (date: Date): boolean => {
  const today = getSkopjeToday();
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate < today;
};

/**
 * Check if a time slot is in the past or too soon (within 5 minutes)
 */
export const isTimeSlotPast = (date: Date, timeSlot: string): boolean => {
  const now = getSkopjeTime();
  const [hours, minutes] = timeSlot.split(':').map(Number);
  const slotDateTime = new Date(date);
  slotDateTime.setHours(hours, minutes, 0, 0);

  // Add 5 minute buffer
  const bufferMs = 5 * 60 * 1000;
  return slotDateTime.getTime() <= now.getTime() + bufferMs;
};

// ============ DATE FORMATTING ============

/**
 * Format date key for API: "2026-02-03" (ISO format)
 */
export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format date key legacy format: "2-3" (month-day)
 */
export const formatDateKeyLegacy = (date: Date): string => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}-${day}`;
};

/**
 * Format date for short display: "3 Feb"
 */
export const formatDateShort = (date: Date): string => {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = date.getMonth();
  return `${day} ${monthNames[month]}`;
};

/**
 * Parse date key from API format: "2026-02-03" -> Date
 */
export const parseDateKey = (dateKey: string): Date | null => {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

// ============ DATE GENERATION ============

export type BookingDate = {
  day: string;        // Day name (for frontend localization)
  date: string;       // Display format "3 Feb"
  key: string;        // Legacy format "2-3"
  dateKey: string;    // ISO format "2026-02-03"
  fullDate: Date;     // Full Date object
  dayOfWeek: number;  // 0=Mon, 1=Tue, ... 4=Fri
};

/**
 * Get the next N weekdays starting from today
 */
export const getAvailableBookingDates = (count: number): BookingDate[] => {
  const dates: BookingDate[] = [];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  let currentDate = getSkopjeToday();
  let daysChecked = 0;
  const maxDaysToCheck = count * 3; // Check enough days to find N weekdays

  while (dates.length < count && daysChecked < maxDaysToCheck) {
    const dayOfWeek = currentDate.getDay();

    // Only include weekdays (Monday = 1 to Friday = 5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dateObj = new Date(currentDate);

      dates.push({
        day: dayNames[dayOfWeek - 1],
        date: formatDateShort(dateObj),
        key: formatDateKeyLegacy(dateObj),
        dateKey: formatDateKey(dateObj),
        fullDate: dateObj,
        dayOfWeek: dayOfWeek - 1, // 0=Mon, 1=Tue, etc.
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
    daysChecked++;
  }

  return dates;
};

/**
 * Get calendar date range starting from today
 */
export const getCalendarDateRange = (weeks: number = 5): { start: Date; end: Date } => {
  const start = getSkopjeToday();
  const end = new Date(start);
  end.setDate(end.getDate() + (weeks * 7));
  return { start, end };
};

/**
 * Generate all weekday dates in a range
 */
export const getCalendarDates = (startDate: Date, endDate: Date): Date[] => {
  const dates: Date[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    if (isWeekday(current)) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

/**
 * Generate ALL dates in a range (including weekends) - for admin panel
 */
export const getAllCalendarDates = (startDate: Date, endDate: Date): Date[] => {
  const dates: Date[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

// ============ TIME SLOTS ============

/**
 * Available time slots for booking
 */
export const TIME_SLOTS = ['09:00', '10:00', '11:00', '17:00', '18:00', '19:00', '20:00'] as const;

/**
 * Maximum capacity per time slot
 */
export const MAX_CAPACITY = 4;

/**
 * Package validity in days
 */
export const PACKAGE_VALIDITY_DAYS = 35;

/**
 * Get end time for a time slot (1 hour later)
 */
export const getEndTime = (startTime: string): string => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHours = hours + 1;
  return `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Filter time slots to only show available (not in past)
 */
export const getAvailableTimeSlots = (date: Date, allSlots: readonly string[] = TIME_SLOTS): string[] => {
  return allSlots.filter(slot => !isTimeSlotPast(date, slot));
};
