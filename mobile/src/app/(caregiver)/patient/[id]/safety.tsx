import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { api, errorMessage } from '@/api/client';
import { useAcknowledgeAlert, useGeofences, usePatient, usePatientAlerts, usePatientWrite, useSafety } from '@/api/hooks';
import { AlertCard } from '@/components/alert-card';
import { SafetyMap } from '@/components/safety-map';
import { SafetyBadge } from '@/components/safety-status';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextField } from '@/ui/form';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

type Mode = 'view' | 'zone' | 'simulate';

/** C-10 Location & geofence: zones, latest location (with time and accuracy) and safety alerts. */
export default function ManageSafety() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const patient = usePatient(id);
  const safety = useSafety(id, 15_000);
  const zones = useGeofences(id);
  const alerts = usePatientAlerts(id);
  const write = usePatientWrite(id);
  const ack = useAcknowledgeAlert();
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [zoneName, setZoneName] = useState('Home');
  const [radius, setRadius] = useState('300');
  const [error, setError] = useState<string | null>(null);
  const canEdit = ['EDITOR', 'PRIMARY'].includes(patient.data?.my_permission_level ?? '');

  const onMapPress = (coords: { latitude: number; longitude: number }) => {
    if (mode === 'zone') setDraft(coords);
    if (mode === 'simulate') {
      Alert.alert(
        'Simulate the patient here?',
        'This sends a TEST location, as if the patient’s phone reported it. Use it to check safe-zone alerts.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send test location',
            onPress: () =>
              api(`/patients/${id}/locations`, {
                method: 'POST',
                body: { latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)), accuracy_m: 5, source: 'TEST' },
              })
                .then(() => {
                  void safety.refetch();
                  void alerts.refetch();
                })
                .catch((e) => Alert.alert('Could not send', errorMessage(e))),
          },
        ],
      );
    }
  };

  const saveZone = () => {
    const r = Number(radius);
    if (!draft) return setError('Tap the map to place the centre of the safe zone.');
    if (!zoneName.trim()) return setError('Give the safe zone a name.');
    if (!Number.isInteger(r) || r < 20 || r > 50000) return setError('Radius must be between 20 and 50,000 metres.');
    setError(null);
    Alert.alert('Save this safe zone?', `${zoneName.trim()}, ${r} m radius. You will be alerted if the patient leaves all safe zones.`, [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Save',
        onPress: () =>
          write
            .mutateAsync({
              path: `/patients/${id}/geofences`,
              method: 'POST',
              body: { name: zoneName.trim(), latitude: Number(draft.latitude.toFixed(6)), longitude: Number(draft.longitude.toFixed(6)), radius_m: r },
            })
            .then(() => {
              setDraft(null);
              setMode('view');
            })
            .catch((e) => setError(errorMessage(e))),
      },
    ]);
  };

  const disableZone = (zoneId: string, name: string) =>
    Alert.alert(`Turn off “${name}”?`, 'You will no longer be alerted about this zone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: () => write.mutateAsync({ path: `/geofences/${zoneId}`, method: 'DELETE' }).catch((e) => Alert.alert('Could not save', errorMessage(e))),
      },
    ]);

  const last = safety.data?.last_location;
  return (
    <Screen
      refreshing={safety.isRefetching}
      onRefresh={() => {
        void safety.refetch();
        void zones.refetch();
        void alerts.refetch();
      }}
    >
      {safety.isLoading ? <LoadingState /> : null}
      {safety.error && !safety.data ? <ErrorState message={errorMessage(safety.error)} onRetry={() => void safety.refetch()} /> : null}
      {safety.data ? <SafetyBadge summary={safety.data} audience="caregiver" /> : null}
      {last ? (
        <AppText variant="caption" color={colors.textMuted} selectable>
          Last position {last.latitude.toFixed(5)}, {last.longitude.toFixed(5)}
          {last.accuracy_m != null ? ` (±${Math.round(last.accuracy_m)} m)` : ''} · source {last.source}
          {last.is_mocked ? ' · phone reported a mock location' : ''}
        </AppText>
      ) : null}

      {canEdit ? (
        <Segmented
          label="Map mode"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setDraft(null);
          }}
          options={[
            { value: 'view', label: 'View' },
            { value: 'zone', label: 'Add zone' },
            { value: 'simulate', label: 'Test' },
          ]}
        />
      ) : null}
      {mode === 'zone' ? <InlineNotice message="Tap the map to place the centre of the safe zone." /> : null}
      {mode === 'simulate' ? <InlineNotice message="Test mode: tap the map to send a simulated patient location." /> : null}

      <SafetyMap
        summary={safety.data}
        zones={zones.data ?? []}
        draft={draft ? { ...draft, radius_m: Number(radius) || 0 } : null}
        onPress={mode === 'view' ? undefined : onMapPress}
        height={340}
      />

      {mode === 'zone' ? (
        <Card>
          <TextField label="Zone name" value={zoneName} onChangeText={setZoneName} />
          <TextField label="Radius (metres)" value={radius} onChangeText={setRadius} keyboardType="number-pad" />
          {error ? <InlineNotice tone="danger" message={error} /> : null}
          <Button label="Save safe zone" icon="check" onPress={saveZone} loading={write.isPending} />
        </Card>
      ) : null}

      <View style={{ gap: space.sm }}>
        <AppText variant="title">Safe zones</AppText>
        {zones.data?.length === 0 ? <AppText color={colors.textMuted}>No safe zones yet.</AppText> : null}
        {zones.data?.map((z) => (
          <Card key={z.id}>
            <AppText variant="bodyStrong">{z.name}</AppText>
            <AppText color={colors.textMuted}>{z.radius_m} m radius</AppText>
            {canEdit ? <Button label="Turn off" tone="ghost" icon="trash" onPress={() => disableZone(z.id, z.name)} /> : null}
          </Card>
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <AppText variant="title">Safety alerts</AppText>
        {alerts.data?.length === 0 ? <AppText color={colors.textMuted}>No alerts.</AppText> : null}
        {alerts.data?.slice(0, 10).map((a) => (
          <AlertCard
            key={a.id}
            alert={a}
            busy={ack.isPending && ack.variables === a.id}
            onAcknowledge={() => ack.mutateAsync(a.id).catch((e) => Alert.alert('Could not save', errorMessage(e)))}
          />
        ))}
      </View>
    </Screen>
  );
}
