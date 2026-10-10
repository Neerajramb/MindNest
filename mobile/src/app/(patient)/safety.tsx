import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMyPatient, useSafety } from '@/api/hooks';
import { SafetyBadge } from '@/components/safety-status';
import { SafetyMap } from '@/components/safety-map';
import { usePatientId } from '@/features/patient-context';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors } from '@/ui/theme';

/** P-13 Location / Safety: the patient's view of their safe-zone status. */
export default function Safety() {
  const patientId = usePatientId();
  const me = useMyPatient();
  const safety = useSafety(patientId, 30_000);
  const [permission, setPermission] = useState<Location.LocationPermissionResponse | null>(null);

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then(setPermission);
  }, []);

  const ask = async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setPermission(result);
  };

  return (
    <Screen refreshing={safety.isRefetching} onRefresh={() => void safety.refetch()}>
      {safety.isLoading ? <LoadingState /> : null}
      {safety.error && !safety.data ? <ErrorState message={errorMessage(safety.error)} onRetry={() => void safety.refetch()} /> : null}
      {safety.data ? <SafetyBadge summary={safety.data} audience="patient" /> : null}
      {safety.data ? <SafetyMap summary={safety.data} /> : null}

      {me.data?.location_sharing_enabled && permission && !permission.granted ? (
        permission.canAskAgain ? (
          <Button label="Share my location" icon="safety" onPress={ask} large />
        ) : (
          <>
            <AppText>
              Location is turned off for MindNest. Your caregiver cannot be told if you get lost. You can turn it on in
              your phone settings.
            </AppText>
            <Button label="Open phone settings" icon="settings" onPress={() => void Linking.openSettings()} />
          </>
        )
      ) : null}
      <AppText variant="caption" color={colors.textMuted}>
        MindNest shares your location only with your caregivers, and only while the app is open. It shows where your
        phone was last seen, which may not be exactly where you are now.
      </AppText>
    </Screen>
  );
}
