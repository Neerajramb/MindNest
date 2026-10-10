import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMyPatient } from '@/api/hooks';
import { uploadImage } from '@/api/upload';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { NamedIcon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { InlineNotice } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

type Result = {
  status: 'RECOGNIZED' | 'UNKNOWN' | 'NO_FACE' | 'UNCLEAR';
  message: string;
  person: { id: string; name: string; relationship: string } | null;
  confidence: 'high' | 'medium' | null;
};

/** P-04 "Who is this?": identity is shown only above the threshold; otherwise "I'm not sure" (BR-04). */
export default function WhoIsThis() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voice = useMyPatient().data?.voice_responses_enabled ?? true;

  const capture = async () => {
    if (!camera.current) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.6, skipProcessing: false });
      const answer = await uploadImage<Result>('/face/recognize', photo.uri);
      setResult(answer);
      if (voice) {
        Speech.stop();
        Speech.speak(answer.message, { rate: 0.9 });
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
        <AppText>To tell you who someone is, point the camera at their face. Photos are not saved.</AppText>
        {permission.canAskAgain ? (
          <Button label="Allow camera" icon="person" onPress={() => void requestPermission()} large />
        ) : (
          <Button label="Open phone settings" icon="settings" onPress={() => void Linking.openSettings()} large />
        )}
      </Screen>
    );
  }

  const known = result?.status === 'RECOGNIZED';
  return (
    <Screen>
      <View style={{ height: 360, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing={facing} accessibilityLabel="Camera view" />
      </View>
      <Button label={busy ? 'Looking…' : 'Who is this?'} icon="person" onPress={capture} loading={busy} large />
      <Button
        label={facing === 'back' ? 'Use front camera' : 'Use back camera'}
        tone="secondary"
        onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
      />
      {error ? <InlineNotice tone="danger" message={error} /> : null}
      {result ? (
        <Card tint={known ? colors.successSoft : colors.warningSoft}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }} accessibilityLiveRegion="polite">
            <NamedIcon name={known ? 'person' : 'warning'} size={36} color={known ? colors.success : colors.warning} />
            <View style={{ flex: 1, gap: space.xs }}>
              <AppText variant="title">{known && result.person ? result.person.name : 'Not sure'}</AppText>
              {known && result.person?.relationship ? <AppText variant="bodyStrong">{result.person.relationship}</AppText> : null}
              <AppText>{result.message}</AppText>
              {known && result.person ? (
                <Button
                  label={`Ask about ${result.person.name}`}
                  tone="secondary"
                  icon="speaker"
                  onPress={() =>
                    router.push({
                      pathname: '/assistant',
                      params: { personId: result.person!.id, personName: result.person!.name },
                    })
                  }
                />
              ) : null}
              {known && result.confidence === 'medium' ? (
                <AppText variant="caption" color={colors.textMuted}>
                  Fairly sure. Ask them if you are unsure.
                </AppText>
              ) : null}
            </View>
          </View>
        </Card>
      ) : null}
      <AppText variant="caption" color={colors.textMuted}>
        The photo is only used to check against people your caregiver added, then it is discarded.
      </AppText>
    </Screen>
  );
}
