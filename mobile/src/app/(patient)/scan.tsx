import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMyPatient } from '@/api/hooks';
import { objectKeys, usePlaces, type ScanResult } from '@/api/objects';
import { uploadImage } from '@/api/upload';
import { usePatientId } from '@/features/patient-context';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { InlineNotice } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

/** Room scan: one photo is checked for the patient's tracked items, then discarded. */
export default function Scan() {
  const client = useQueryClient();
  const patientId = usePatientId();
  const places = usePlaces(patientId);
  const voice = useMyPatient().data?.voice_responses_enabled ?? true;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = placeId ?? places.data?.[0]?.id ?? null;

  const scan = async () => {
    if (!camera.current || !patientId) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.6 });
      const res = await uploadImage<ScanResult>(
        `/patients/${patientId}/objects/scan`,
        photo.uri,
        'image',
        selected ? { place_id: selected } : undefined,
      );
      setResult(res);
      void client.invalidateQueries({ queryKey: objectKeys.objects(patientId) });
      if (voice) {
        Speech.stop();
        Speech.speak(res.message, { rate: 0.9 });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <AppText variant="title">MindNest needs the camera</AppText>
        <AppText>Point it around the room so MindNest can remember where your things are. Photos are not kept.</AppText>
        {permission.canAskAgain ? (
          <Button label="Allow camera" onPress={() => void requestPermission()} large />
        ) : (
          <Button label="Open phone settings" icon="settings" onPress={() => void Linking.openSettings()} large />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      {places.data && places.data.length > 0 && selected ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="bodyStrong">Which room are you in?</AppText>
          <Segmented
            label="Room"
            value={selected}
            onChange={setPlaceId}
            options={places.data.slice(0, 4).map((p) => ({ value: p.id, label: p.name }))}
          />
        </View>
      ) : null}
      <View style={{ height: 340, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" accessibilityLabel="Camera view" />
      </View>
      <Button label={busy ? 'Looking…' : 'Scan'} icon="forward" onPress={scan} loading={busy} large />
      {error ? <InlineNotice tone="danger" message={error} /> : null}
      {result ? (
        <Card tint={result.found.length ? colors.successSoft : colors.background}>
          <AppText variant="title" accessibilityLiveRegion="polite">
            {result.message}
          </AppText>
        </Card>
      ) : null}
      <AppText variant="caption" color={colors.textMuted}>
        The photo is sent to an online AI service to look for your listed belongings, then discarded. Avoid scanning
        papers or other private things.
      </AppText>
    </Screen>
  );
}
