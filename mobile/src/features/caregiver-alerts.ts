import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useMyAlerts } from '@/api/hooks';
import type { AlertItem } from '@/api/types';
import { ensureNotificationPermission } from '@/features/reminder-notifications';

/** Ids that have not been announced yet; on the first load everything is treated as already seen. */
export function newAlerts(alerts: AlertItem[], seen: Set<string> | null): AlertItem[] {
  if (seen === null) return [];
  return alerts.filter((a) => !seen.has(a.id));
}

/**
 * Polls unacknowledged alerts while the caregiver app is open and raises a local notification for each new
 * one (ADR-0008: remote push is a later step). Returns the query so screens can show the badge count.
 */
export function useCaregiverAlertWatcher(enabled: boolean) {
  const query = useMyAlerts(enabled);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (enabled) void ensureNotificationPermission();
  }, [enabled]);

  useEffect(() => {
    const alerts = query.data;
    if (!alerts) return;
    const fresh = newAlerts(alerts, seen.current);
    seen.current = new Set(alerts.map((a) => a.id));
    for (const alert of fresh) {
      void Notifications.scheduleNotificationAsync({
        content: {
          title: `${alert.patient_name}: ${alert.severity === 'HIGH' ? 'urgent' : 'alert'}`,
          body: alert.message,
          data: { url: '/alerts' },
          sound: 'default',
        },
        trigger: null,
      });
    }
  }, [query.data]);

  return query;
}
