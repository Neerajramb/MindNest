import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAppointments, usePatient, usePatientWrite, useRoutines } from '@/api/hooks';
import { describeRule } from '@/lib/recurrence';
import { formatClock, formatDateTime } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** C-04 Daily schedule and C-05 Calendar management. */
export default function ManageSchedule() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patient = usePatient(id);
  const routines = useRoutines(id);
  const appointments = useAppointments(id);
  const write = usePatientWrite(id);
  const canEdit = ['EDITOR', 'PRIMARY'].includes(patient.data?.my_permission_level ?? '');
  const tz = patient.data?.timezone;

  const remove = (title: string, path: string, message: string) =>
    Alert.alert(title, message, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => write.mutateAsync({ path, method: 'DELETE' }).catch((e) => Alert.alert('Could not remove', errorMessage(e))),
      },
    ]);

  return (
    <Screen
      refreshing={routines.isRefetching || appointments.isRefetching}
      onRefresh={() => {
        void routines.refetch();
        void appointments.refetch();
      }}
    >
      <View style={{ gap: space.sm }}>
        <AppText variant="title" accessibilityRole="header">
          Routines
        </AppText>
        {routines.isLoading ? <LoadingState /> : null}
        {routines.error ? <ErrorState message={errorMessage(routines.error)} onRetry={() => void routines.refetch()} /> : null}
        {routines.data?.length === 0 ? <EmptyState icon="routine" title="No routines" message="Add daily activities like a walk or lunch." /> : null}
        {routines.data?.map((r) => (
          <Card key={r.id}>
            <AppText variant="bodyStrong">
              {formatClock(r.scheduled_time)} · {r.title}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {describeRule(r.recurrence_rule)}
              {r.reminder_enabled ? ' · reminder on' : ' · no reminder'}
            </AppText>
            {canEdit ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label="Edit"
                  icon="edit"
                  tone="secondary"
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/patient/[id]/routine-form', params: { id, routineId: r.id } })}
                />
                <Button
                  label="Remove"
                  icon="trash"
                  tone="ghost"
                  style={{ flex: 1 }}
                  onPress={() => remove('Remove this routine?', `/schedule/${r.id}`, `${r.title} will no longer be reminded.`)}
                />
              </View>
            ) : null}
          </Card>
        ))}
        {canEdit ? (
          <Button label="Add routine" icon="add" onPress={() => router.push({ pathname: '/patient/[id]/routine-form', params: { id } })} />
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <AppText variant="title" accessibilityRole="header">
          Upcoming appointments
        </AppText>
        {appointments.isLoading ? <LoadingState /> : null}
        {appointments.data?.length === 0 ? <EmptyState icon="appointment" title="No upcoming appointments" /> : null}
        {appointments.data?.map((a) => (
          <Card key={a.id}>
            <AppText variant="bodyStrong">{a.title}</AppText>
            <AppText>{formatDateTime(a.start_at, tz)}</AppText>
            {a.location ? <AppText color={colors.textMuted}>{a.location}</AppText> : null}
            {canEdit ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label="Edit"
                  icon="edit"
                  tone="secondary"
                  style={{ flex: 1 }}
                  onPress={() =>
                    router.push({ pathname: '/patient/[id]/appointment-form', params: { id, appointmentId: a.id } })
                  }
                />
                <Button
                  label="Delete"
                  icon="trash"
                  tone="ghost"
                  style={{ flex: 1 }}
                  onPress={() => remove('Delete this appointment?', `/appointments/${a.id}`, `${a.title} will be removed.`)}
                />
              </View>
            ) : null}
          </Card>
        ))}
        {canEdit ? (
          <Button
            label="Add appointment"
            icon="add"
            onPress={() => router.push({ pathname: '/patient/[id]/appointment-form', params: { id } })}
          />
        ) : null}
      </View>
    </Screen>
  );
}
