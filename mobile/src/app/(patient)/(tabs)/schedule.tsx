import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAgenda, useMyPatient } from '@/api/hooks';
import { AgendaRow } from '@/components/agenda-row';
import { usePatientId } from '@/features/patient-context';
import { addDays, formatDay, isoDateIn } from '@/lib/time';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { space } from '@/ui/theme';

/** P-06 Schedule / P-07 Calendar: opens on today; routines, medicines and appointments in one timeline. */
export default function Schedule() {
  const patientId = usePatientId();
  const tz = useMyPatient().data?.timezone;
  const today = isoDateIn(tz);
  const [day, setDay] = useState(today);
  const agenda = useAgenda(patientId, day === today ? undefined : day);
  const items = useMemo(() => agenda.data?.items ?? [], [agenda.data]);
  const nextIndex = useMemo(() => {
    if (day !== today) return -1;
    const now = new Date();
    return items.findIndex((i) => new Date(i.end_at ?? i.at) >= now);
  }, [items, day, today]);

  const label = day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : day === addDays(today, -1) ? 'Yesterday' : '';
  return (
    <Screen refreshing={agenda.isRefetching} onRefresh={() => void agenda.refetch()}>
      <View style={{ gap: space.xs }}>
        <AppText variant="heading" accessibilityRole="header">
          {label || 'Schedule'}
        </AppText>
        <AppText variant="title">{formatDay(`${day}T12:00:00Z`)}</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Earlier" icon="back" tone="secondary" onPress={() => setDay(addDays(day, -1))} style={{ flex: 1 }} />
        {day !== today ? <Button label="Today" tone="secondary" onPress={() => setDay(today)} style={{ flex: 1 }} /> : null}
        <Button label="Next day" icon="forward" tone="secondary" onPress={() => setDay(addDays(day, 1))} style={{ flex: 1 }} />
      </View>

      {agenda.isLoading ? <LoadingState /> : null}
      {agenda.error && !agenda.data ? (
        <ErrorState message={errorMessage(agenda.error)} onRetry={() => void agenda.refetch()} />
      ) : null}
      {agenda.error && agenda.data ? <InlineNotice message="Could not refresh. Showing your saved schedule." /> : null}
      {agenda.data && items.length === 0 ? (
        <EmptyState icon="schedule" title="Nothing planned" message="Your caregiver can add activities and appointments." />
      ) : null}
      {items.map((item, index) => (
        <AgendaRow key={`${item.source_id}-${item.at}`} item={item} isNext={index === nextIndex} timeZone={tz} />
      ))}
    </Screen>
  );
}
