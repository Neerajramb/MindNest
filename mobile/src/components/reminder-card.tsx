import { View } from 'react-native';

import type { Reminder, ReminderType } from '@/api/types';
import { formatTime } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { NamedIcon, type IconName } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

export const typeIcon: Record<ReminderType, IconName> = {
  MEDICATION: 'medication',
  APPOINTMENT: 'appointment',
  ROUTINE: 'routine',
  OTHER: 'reminders',
};

export type DisplayState = 'due' | 'upcoming' | 'snoozed' | 'done' | 'missed';

export function displayState(reminder: Pick<Reminder, 'status' | 'due_at'>, now: Date = new Date()): DisplayState {
  if (reminder.status === 'ACKNOWLEDGED') return 'done';
  if (reminder.status === 'MISSED') return 'missed';
  if (new Date(reminder.due_at) <= now) return 'due';
  return reminder.status === 'SNOOZED' ? 'snoozed' : 'upcoming';
}

/** Status is always shown as icon + words, never colour alone (UI/UX section 17). */
const stateStyle: Record<DisplayState, { label: string; icon: IconName; fg: string; bg: string }> = {
  due: { label: 'Due now', icon: 'alert', fg: colors.primary, bg: colors.primarySoft },
  upcoming: { label: 'Upcoming', icon: 'clock', fg: colors.textMuted, bg: colors.background },
  snoozed: { label: 'Reminding later', icon: 'clock', fg: colors.warning, bg: colors.warningSoft },
  done: { label: 'Done', icon: 'check', fg: colors.success, bg: colors.successSoft },
  missed: { label: 'Missed', icon: 'missed', fg: colors.danger, bg: colors.dangerSoft },
};

export function StatusPill({ state }: { state: DisplayState }) {
  const s = stateStyle[state];
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: s.bg, alignSelf: 'flex-start' }}
    >
      <NamedIcon name={s.icon} size={18} color={s.fg} />
      <AppText variant="caption" color={s.fg} style={{ fontWeight: '600' }}>
        {s.label}
      </AppText>
    </View>
  );
}

type Props = {
  reminder: Reminder;
  timeZone?: string;
  onAcknowledge?: () => void;
  onSnooze?: () => void;
  busy?: boolean;
  now?: Date;
};

export function ReminderCard({ reminder, timeZone, onAcknowledge, onSnooze, busy, now }: Props) {
  const state = displayState(reminder, now);
  const isMedication = reminder.type === 'MEDICATION';
  const actionable = state === 'due' || state === 'snoozed' || state === 'missed';
  return (
    <Card tint={state === 'due' ? colors.primarySoft : undefined}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <NamedIcon name={typeIcon[reminder.type]} size={30} color={isMedication ? colors.medication : colors.primary} />
        <View style={{ flex: 1, gap: space.xs }}>
          <AppText variant="title">{reminder.message}</AppText>
          {reminder.detail ? <AppText color={colors.textMuted}>{reminder.detail}</AppText> : null}
          <AppText variant="bodyStrong">{formatTime(reminder.due_at, timeZone)}</AppText>
          <StatusPill state={state} />
          {reminder.status === 'ACKNOWLEDGED' && reminder.acknowledged_late ? (
            <AppText variant="caption" color={colors.textMuted}>
              Confirmed late
            </AppText>
          ) : null}
        </View>
      </View>
      {actionable && onAcknowledge ? (
        <View style={{ gap: space.sm }}>
          <Button
            label={isMedication ? 'I took it' : 'Done'}
            tone="success"
            icon="check"
            onPress={onAcknowledge}
            loading={busy}
            accessibilityHint="Tells your caregiver you did this. MindNest records what you tell it."
          />
          {state !== 'missed' && onSnooze ? (
            <Button label="Remind me in 10 minutes" tone="secondary" icon="clock" onPress={onSnooze} disabled={busy} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
