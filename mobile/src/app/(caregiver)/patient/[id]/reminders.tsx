import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { usePatient, useReminders } from '@/api/hooks';
import { StatusPill, displayState, typeIcon } from '@/components/reminder-card';
import { formatDateTime } from '@/lib/time';
import { Card } from '@/ui/card';
import { NamedIcon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** C-07 Reminder status review (SCH-06). "Done" means the patient confirmed it; nothing more is claimed. */
export default function ReminderReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tz = usePatient(id).data?.timezone;
  const reminders = useReminders(id);
  const list = [...(reminders.data ?? [])].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  return (
    <Screen refreshing={reminders.isRefetching} onRefresh={() => void reminders.refetch()}>
      <AppText color={colors.textMuted}>
        The last 24 hours and the next 48 hours. “Done” is what the patient confirmed in the app.
      </AppText>
      {reminders.isLoading ? <LoadingState /> : null}
      {reminders.error && !reminders.data ? (
        <ErrorState message={errorMessage(reminders.error)} onRetry={() => void reminders.refetch()} />
      ) : null}
      {reminders.data?.length === 0 ? <EmptyState icon="reminders" title="No reminders in this period" /> : null}
      {list.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <NamedIcon name={typeIcon[r.type]} color={r.type === 'MEDICATION' ? colors.medication : colors.primary} />
            <View style={{ flex: 1, gap: space.xs }}>
              <AppText variant="bodyStrong">{r.message}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {formatDateTime(r.scheduled_at, tz)}
              </AppText>
              <StatusPill state={displayState(r)} />
              {r.acknowledged_late ? (
                <AppText variant="caption" color={colors.textMuted}>
                  Confirmed late (patient-reported)
                </AppText>
              ) : null}
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
