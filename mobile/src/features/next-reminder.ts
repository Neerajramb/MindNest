import type { Reminder } from '@/api/types';

/** The reminder that needs attention: overdue/due first, otherwise the soonest upcoming one. */
export function nextReminder(reminders: Reminder[], now: Date): Reminder | undefined {
  const open = reminders.filter((r) => r.status === 'PENDING' || r.status === 'SNOOZED');
  const soonWindow = now.getTime() - 60 * 60 * 1000;
  return open
    .filter((r) => new Date(r.due_at).getTime() >= soonWindow)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
}
