import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import type { Reminder } from '@/api/types';

const MAX_SCHEDULED = 60; // iOS keeps at most 64 pending local notifications.

/** Ask once; reminders are the app's core function, so the request happens when the patient app opens. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Reminders that should still fire on this device, soonest first. */
export function upcomingToSchedule(reminders: Reminder[], now: Date = new Date()): Reminder[] {
  return reminders
    .filter((r) => (r.status === 'PENDING' || r.status === 'SNOOZED') && new Date(r.due_at) > now)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .slice(0, MAX_SCHEDULED);
}

/**
 * Mirrors the server's reminder window into local notifications, so reminders fire on time even with no
 * network (ADR-0008). Re-run whenever the reminder list changes; it replaces what was scheduled before.
 */
export function useReminderNotifications(reminders: Reminder[] | undefined) {
  useEffect(() => {
    if (!reminders) return;
    let cancelled = false;
    void (async () => {
      if (!(await ensureNotificationPermission()) || cancelled) return;
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const reminder of upcomingToSchedule(reminders)) {
        if (cancelled) return;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: reminder.message,
            body: reminder.detail || 'Open MindNest to confirm.',
            data: { reminderId: reminder.id, url: '/reminders' },
            sound: 'default',
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminder.due_at) },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reminders]);
}
