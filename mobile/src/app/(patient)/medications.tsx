import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMedications } from '@/api/hooks';
import { usePatientId } from '@/features/patient-context';
import { formatClock } from '@/lib/time';
import { Card } from '@/ui/card';
import { NamedIcon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** P-10: read-only medication instructions. Changes come only from caregivers, never from AI (MED-05). */
export default function Medications() {
  const patientId = usePatientId();
  const meds = useMedications(patientId);
  return (
    <Screen refreshing={meds.isRefetching} onRefresh={() => void meds.refetch()}>
      {meds.isLoading ? <LoadingState /> : null}
      {meds.error && !meds.data ? <ErrorState message={errorMessage(meds.error)} onRetry={() => void meds.refetch()} /> : null}
      {meds.error && meds.data ? <InlineNotice message="Could not refresh. Showing saved medicines." /> : null}
      {meds.data && meds.data.length === 0 ? (
        <EmptyState icon="medication" title="No medicines listed" message="Your caregiver can add your medicines." />
      ) : null}
      {meds.data?.map((med) => (
        <Card key={med.id} tint={colors.medicationSoft}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <NamedIcon name="medication" color={colors.medication} size={32} />
            <View style={{ flex: 1 }}>
              <AppText variant="title">{med.name}</AppText>
              {med.dosage_text ? <AppText variant="bodyStrong">{med.dosage_text}</AppText> : null}
            </View>
          </View>
          {med.instructions ? <AppText>{med.instructions}</AppText> : null}
          <AppText color={colors.textMuted}>
            {med.schedules.length
              ? `Take at: ${med.schedules.map((s) => formatClock(s.time_of_day)).join(', ')}`
              : 'No set times'}
          </AppText>
        </Card>
      ))}
      {meds.data && meds.data.length > 0 ? (
        <AppText variant="caption" color={colors.textMuted}>
          Your caregiver manages this list. MindNest never changes your doses. If something looks wrong, ask your
          caregiver or doctor.
        </AppText>
      ) : null}
    </Screen>
  );
}
