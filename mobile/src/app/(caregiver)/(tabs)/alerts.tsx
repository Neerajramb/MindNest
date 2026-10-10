import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAcknowledgeAlert, useMyAlerts } from '@/api/hooks';
import type { AlertItem } from '@/api/types';
import { AlertCard } from '@/components/alert-card';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';

/** C-11 Alerts: review and acknowledge (polled every 20 s while the app is open). */
export default function Alerts() {
  const router = useRouter();
  const alerts = useMyAlerts(true);
  const ack = useAcknowledgeAlert();

  const acknowledge = (alert: AlertItem) =>
    Alert.alert('Acknowledge this alert?', 'Other caregivers will see that you are handling it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Acknowledge',
        onPress: () => ack.mutateAsync(alert.id).catch((err) => Alert.alert('Could not save', errorMessage(err))),
      },
    ]);

  const open = (alert: AlertItem) =>
    router.push({
      pathname: alert.type === 'GEOFENCE' || alert.type === 'SOS' || alert.type === 'LOCATION_UNAVAILABLE'
        ? '/patient/[id]/safety'
        : '/patient/[id]',
      params: { id: alert.patient_id },
    });

  return (
    <Screen refreshing={alerts.isRefetching} onRefresh={() => void alerts.refetch()}>
      {alerts.isLoading ? <LoadingState /> : null}
      {alerts.error && !alerts.data ? <ErrorState message={errorMessage(alerts.error)} onRetry={() => void alerts.refetch()} /> : null}
      {alerts.error && alerts.data ? <InlineNotice message="Could not refresh. These alerts may be out of date." /> : null}
      {alerts.data && alerts.data.length === 0 ? (
        <EmptyState icon="check" title="All clear" message="No alerts need your attention." />
      ) : null}
      {alerts.data?.map((a) => (
        <AlertCard
          key={a.id}
          alert={a}
          busy={ack.isPending && ack.variables === a.id}
          onAcknowledge={() => acknowledge(a)}
          onOpen={() => open(a)}
        />
      ))}
    </Screen>
  );
}
