import type { ActivityEntry } from '@/api/types';

const LABELS: Record<string, string> = {
  'reminder.acknowledged': 'Confirmed a reminder',
  'reminder.snoozed': 'Asked to be reminded later',
  'reminder.missed': 'Missed a reminder',
  'alert.created': 'Alert raised',
  'alert.acknowledged': 'Alert acknowledged',
  'geofence.exit': 'Left a safe zone',
  'geofence.returned': 'Returned to a safe zone',
  'patient.settings_changed': 'Changed their settings',
};

const TYPE_WORDS: Record<string, string> = {
  MEDICATION: 'medication',
  ROUTINE: 'routine',
  APPOINTMENT: 'appointment',
};

export function describeActivity(entry: ActivityEntry): string {
  const base = LABELS[entry.event_type] ?? entry.event_type.replace(/[._]/g, ' ');
  const kind = entry.event_data.reminder_type;
  if (typeof kind === 'string' && TYPE_WORDS[kind]) return `${base} (${TYPE_WORDS[kind]})`;
  const zone = entry.event_data.zone;
  if (typeof zone === 'string') return `${base}: ${zone}`;
  if (entry.event_data.late === true) return `${base} (late)`;
  return base;
}
