import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMedications, usePatient, usePatientWrite } from '@/api/hooks';
import { formatClock } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { NamedIcon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** C-06 Medication management. Only caregivers change medicines; the AI never does (MED-05). */
export default function ManageMedications() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patient = usePatient(id);
  const meds = useMedications(id);
  const write = usePatientWrite(id);
  const canEdit = ['EDITOR', 'PRIMARY'].includes(patient.data?.my_permission_level ?? '');

  const stop = (medId: string, name: string) =>
    Alert.alert(`Stop ${name}?`, 'Its reminders will stop. You can add it again later.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Stop medicine',
        style: 'destructive',
        onPress: () =>
          write.mutateAsync({ path: `/medications/${medId}`, method: 'DELETE' }).catch((e) => Alert.alert('Could not save', errorMessage(e))),
      },
    ]);

  return (
    <Screen refreshing={meds.isRefetching} onRefresh={() => void meds.refetch()}>
      {meds.isLoading ? <LoadingState /> : null}
      {meds.error && !meds.data ? <ErrorState message={errorMessage(meds.error)} onRetry={() => void meds.refetch()} /> : null}
      {meds.data?.length === 0 ? <EmptyState icon="medication" title="No medicines" message="Add a medicine and when to take it." /> : null}
      {meds.data?.map((m) => (
        <Card key={m.id} tint={colors.medicationSoft}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <NamedIcon name="medication" color={colors.medication} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{m.name}</AppText>
              {m.dosage_text ? <AppText>{m.dosage_text}</AppText> : null}
            </View>
          </View>
          {m.instructions ? <AppText color={colors.textMuted}>{m.instructions}</AppText> : null}
          <AppText>Times: {m.schedules.length ? m.schedules.map((s) => formatClock(s.time_of_day)).join(', ') : 'none set'}</AppText>
          {canEdit ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                label="Edit"
                icon="edit"
                tone="secondary"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/patient/[id]/medication-form', params: { id, medicationId: m.id } })}
              />
              <Button label="Stop" icon="trash" tone="ghost" style={{ flex: 1 }} onPress={() => stop(m.id, m.name)} />
            </View>
          ) : null}
        </Card>
      ))}
      {canEdit ? (
        <Button label="Add medicine" icon="add" onPress={() => router.push({ pathname: '/patient/[id]/medication-form', params: { id } })} />
      ) : null}
    </Screen>
  );
}
