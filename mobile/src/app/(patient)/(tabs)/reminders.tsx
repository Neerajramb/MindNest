import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAcknowledgeReminder, useMyPatient, useReminders, useSnoozeReminder } from '@/api/hooks';
import type { Reminder } from '@/api/types';
import { ReminderCard, displayState, type DisplayState } from '@/components/reminder-card';
import { usePatientId } from '@/features/patient-context';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { space } from '@/ui/theme';

const SECTIONS: { key: DisplayState[]; title: string }[] = [
  { key: ['due'], title: 'Due now' },
  { key: ['missed'], title: 'Missed — tap if you already did it' },
  { key: ['upcoming', 'snoozed'], title: 'Coming up' },
  { key: ['done'], title: 'Done' },
];

/** P-08 Reminders and P-09 Reminder detail (actions live on each card). */
export default function Reminders() {
  const router = useRouter();
  const patientId = usePatientId();
  const tz = useMyPatient().data?.timezone;
  const reminders = useReminders(patientId);
  const ack = useAcknowledgeReminder(patientId);
  const snooze = useSnoozeReminder(patientId);
  const now = new Date();

  const grouped = useMemo(() => {
    const map = new Map<DisplayState, Reminder[]>();
    for (const r of reminders.data ?? []) {
      const state = displayState(r);
      map.set(state, [...(map.get(state) ?? []), r]);
    }
    return map;
  }, [reminders.data]);

  const act = (action: () => Promise<unknown>) =>
    action().catch((err) => Alert.alert('Could not save', errorMessage(err)));

  return (
    <Screen refreshing={reminders.isRefetching} onRefresh={() => void reminders.refetch()}>
      <Button label="Add a reminder" icon="add" tone="secondary" onPress={() => router.push('/add-reminder')} large />
      {reminders.isLoading ? <LoadingState /> : null}
      {reminders.error && !reminders.data ? (
        <ErrorState message={errorMessage(reminders.error)} onRetry={() => void reminders.refetch()} />
      ) : null}
      {reminders.error && reminders.data ? <InlineNotice message="Could not refresh. Showing saved reminders." /> : null}
      {reminders.data && reminders.data.length === 0 ? (
        <EmptyState icon="reminders" title="No reminders" message="Reminders from your caregiver, and ones you add, will show up here." />
      ) : null}
      {SECTIONS.map(({ key, title }) => {
        const list = key.flatMap((k) => grouped.get(k) ?? []);
        if (!list.length) return null;
        return (
          <View key={title} style={{ gap: space.md }}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {list.map((r) => (
              <ReminderCard
                key={r.id}
                reminder={r}
                timeZone={tz}
                now={now}
                busy={(ack.isPending && ack.variables === r.id) || (snooze.isPending && snooze.variables?.id === r.id)}
                onAcknowledge={() => act(() => ack.mutateAsync(r.id))}
                onSnooze={() => act(() => snooze.mutateAsync({ id: r.id, minutes: 10 }))}
              />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}
