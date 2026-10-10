import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMyAlerts, usePatients } from '@/api/hooks';
import { useAuth } from '@/auth/auth-context';
import { AlertCard } from '@/components/alert-card';
import { Button } from '@/ui/button';
import { NavRow } from '@/ui/card';
import { NamedIcon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** C-02 Dashboard: every patient with their open alerts, plus the most recent alerts. */
export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const patients = usePatients();
  const alerts = useMyAlerts(true);
  const openByPatient = new Map<string, number>();
  for (const a of alerts.data ?? []) openByPatient.set(a.patient_id, (openByPatient.get(a.patient_id) ?? 0) + 1);

  return (
    <Screen
      refreshing={patients.isRefetching || alerts.isRefetching}
      onRefresh={() => {
        void patients.refetch();
        void alerts.refetch();
      }}
    >
      <AppText variant="title">Hello, {user?.name}</AppText>

      <View style={{ gap: space.sm }}>
        <AppText variant="title" accessibilityRole="header">
          Patients
        </AppText>
        {patients.isLoading ? <LoadingState /> : null}
        {patients.error && !patients.data ? (
          <ErrorState message={errorMessage(patients.error)} onRetry={() => void patients.refetch()} />
        ) : null}
        {patients.error && patients.data ? <InlineNotice message="Could not refresh the patient list." /> : null}
        {patients.data && patients.data.length === 0 ? (
          <EmptyState
            icon="people"
            title="No patients yet"
            message="Add the person you care for. You will get a code for them to set up their phone."
            action={{ label: 'Add a patient', onPress: () => router.push('/add-patient') }}
          />
        ) : null}
        {patients.data?.map((p) => {
          const open = openByPatient.get(p.id) ?? 0;
          return (
            <NavRow
              key={p.id}
              accessibilityLabel={`${p.display_name}. ${open ? `${open} open alerts` : 'No open alerts'}`}
              onPress={() => router.push({ pathname: '/patient/[id]', params: { id: p.id } })}
            >
              <NamedIcon name="person" color={colors.primary} size={30} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{p.display_name}</AppText>
                <AppText variant="caption" color={open ? colors.danger : colors.success}>
                  {open ? `${open} open alert${open > 1 ? 's' : ''}` : 'No open alerts'}
                  {p.has_account ? '' : ' · App not set up yet'}
                </AppText>
              </View>
            </NavRow>
          );
        })}
        {patients.data && patients.data.length > 0 ? (
          <Button label="Add a patient" tone="secondary" icon="add" onPress={() => router.push('/add-patient')} />
        ) : null}
      </View>

      {alerts.data && alerts.data.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="title" accessibilityRole="header">
            Needs attention
          </AppText>
          {alerts.data.slice(0, 3).map((a) => (
            <AlertCard key={a.id} alert={a} onOpen={() => router.push('/alerts')} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
