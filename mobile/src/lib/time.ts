/**
 * Times are shown in the patient's timezone, not the phone's, so a caregiver travelling elsewhere
 * sees the same clock times as the patient.
 */

export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(
    new Date(iso),
  );
}

export function formatDay(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(new Date(iso));
}

/** "2 min ago", "3 h ago", or a date: for observation times, so old data never looks current (NFR-009). */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function hourIn(timeZone: string | undefined, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(now);
  return Number(hour) % 24;
}

export function greeting(timeZone?: string, now: Date = new Date()): string {
  const hour = hourIn(timeZone, now);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** YYYY-MM-DD for a date in the given timezone. */
export function isoDateIn(timeZone: string | undefined, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(
    date,
  );
  return parts;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** "HH:MM" (24 h) → "9:30 am" style label for schedule definitions that have no date. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function isValidClock(value: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim());
}
