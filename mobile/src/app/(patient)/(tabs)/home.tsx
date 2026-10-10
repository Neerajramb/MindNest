import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAcknowledgeReminder, useAgenda, useMyPatient, useReminders, useSafety, useSnoozeReminder } from '@/api/hooks';
import type { AgendaItem } from '@/api/types';
import { AgendaRow } from '@/components/agenda-row';
import { ReminderCard } from '@/components/reminder-card';
import { SafetyBadge } from '@/components/safety-status';
import { nextReminder } from '@/features/next-reminder';
import { usePatientId } from '@/features/patient-context';
import { formatDay, formatTime, greeting } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** P-02 Home: answers "What do I need to do?", "What is next?" and "Can I ask for help?". */
export default function Home() {
  const router = useRouter();
  const patientId = usePatientId();
  const now = useNow();
  const me = useMyPatient();
  const reminders = useReminders(patientId);
  const agenda = useAgenda(patientId);
  const safety = useSafety(patientId, 60_000);
  const ack = useAcknowledgeReminder(patientId);
  const snooze = useSnoozeReminder(patientId);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((p) => setLocationPermission(p.status));
  }, []);

  const tz = me.data?.timezone;
  const name = me.data?.preferred_name || me.data?.display_name || '';
  const next = useMemo(() => (reminders.data ? nextReminder(reminders.data, now) : undefined), [reminders.data, now]);
  const upcoming: AgendaItem[] = useMemo(
    () => (agenda.data?.items ?? []).filter((i) => new Date(i.end_at ?? i.at) >= now).slice(0, 3),
    [agenda.data, now],
  );

  const act = (action: () => Promise<unknown>) =>
    action().catch((err) => Alert.alert('Could not save', errorMessage(err)));

  const readAloud = () => {
    const parts = [`${greeting(tz, now)} ${name}.`, `It is ${formatTime(now.toISOString(), tz)}.`];
    if (next) parts.push(`Next: ${next.message} at ${formatTime(next.due_at, tz)}.`);
    if (upcoming.length) parts.push(`Later today: ${upcoming.map((i) => `${i.title} at ${formatTime(i.at, tz)}`).join(', ')}.`);
    Speech.stop();
    Speech.speak(parts.join(' '), { rate: 0.9 });
  };

  const askLocation = async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(result.status);
  };

  const loading = me.isLoading || (reminders.isLoading && !reminders.data);
  return (
    <Screen
      refreshing={reminders.isRefetching || agenda.isRefetching}
      onRefresh={() => {
        void reminders.refetch();
        void agenda.refetch();
        void safety.refetch();
      }}
    >
      <View style={{ gap: space.xs, paddingTop: space.xxl }}>
        <AppText variant="heading" accessibilityRole="header">
          {greeting(tz, now)}
          {name ? `, ${name}` : ''}
        </AppText>
        <AppText variant="title" color={colors.textMuted}>
          {formatDay(now.toISOString(), tz)} · {formatTime(now.toISOString(), tz)}
        </AppText>
      </View>

      {loading ? <LoadingState /> : null}
      {reminders.error && !reminders.data ? (
        <ErrorState message={errorMessage(reminders.error)} onRetry={() => void reminders.refetch()} />
      ) : null}
      {reminders.error && reminders.data ? <InlineNotice message="Could not refresh. Showing saved reminders." /> : null}

      {reminders.data ? (
        next ? (
          <View style={{ gap: space.sm }}>
            <AppText variant="title" accessibilityRole="header">
              What to do next
            </AppText>
            <ReminderCard
              reminder={next}
              timeZone={tz}
              now={now}
              busy={ack.isPending || snooze.isPending}
              onAcknowledge={() => act(() => ack.mutateAsync(next.id))}
              onSnooze={() => act(() => snooze.mutateAsync({ id: next.id, minutes: 10 }))}
            />
          </View>
        ) : (
          <Card tint={colors.successSoft}>
            <AppText variant="title">Nothing to do right now</AppText>
            <AppText color={colors.textMuted}>I will remind you when something is due.</AppText>
          </Card>
        )
      ) : null}

      <View style={{ gap: space.sm }}>
        <AppText variant="title" accessibilityRole="header">
          Later today
        </AppText>
        {agenda.data && upcoming.length === 0 ? (
          <AppText color={colors.textMuted}>Nothing else planned for today.</AppText>
        ) : null}
        {upcoming.map((item, index) => (
          <AgendaRow key={`${item.source_id}-${item.at}`} item={item} isNext={index === 0} timeZone={tz} />
        ))}
        <Button label="See my whole day" tone="secondary" icon="schedule" onPress={() => router.push('/schedule')} />
      </View>

      {safety.data ? <SafetyBadge summary={safety.data} audience="patient" /> : null}
      {me.data?.location_sharing_enabled && locationPermission && locationPermission !== 'granted' ? (
        <Card tint={colors.warningSoft}>
          <AppText variant="bodyStrong">Let MindNest see where you are?</AppText>
          <AppText color={colors.textMuted}>
            Your caregiver will be told if you leave your safe places. Your location is only shared with them.
          </AppText>
          <Button label="Share my location" icon="safety" onPress={askLocation} />
        </Card>
      ) : null}

      <View style={{ gap: space.md }}>
        <Button label="Who is this?" icon="person" onPress={() => router.push('/who-is-this')} large />
        <Button label="Read this to me" tone="secondary" icon="speaker" onPress={readAloud} large />
        <Button label="Help" tone="danger" icon="help" onPress={() => router.push('/help')} large />
      </View>
    </Screen>
  );
}
