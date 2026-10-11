import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useFocusEffect, useNavigation } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMyPatient } from '@/api/hooks';
import { liveLook, type LiveLook, type LivePerson } from '@/api/live';
import { objectKeys } from '@/api/objects';
import { usePatientId } from '@/features/patient-context';
import { uploadAudio, useVoiceRecorder } from '@/features/voice-recorder';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { NamedIcon, type IconName } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { InlineNotice } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

/** How often a frame is checked for a familiar face (local on the server, no AI quota). */
const FACE_CHECK_MS = 6000;
const MAX_RECORDING_SECONDS = 300;

function Row({ icon, label, value, muted }: { icon: IconName; label: string; value: string; muted?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
      <NamedIcon name={icon} size={28} color={muted ? colors.textMuted : colors.primary} />
      <View style={{ flex: 1 }}>
        <AppText variant="caption" color={colors.textMuted}>
          {label}
        </AppText>
        <AppText variant="bodyStrong" color={muted ? colors.textMuted : colors.text}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Live companion: on opening, one look around names the room and stores the belongings in view; a familiar face is
 * announced when it appears; and the conversation can be saved as a memory linked to that person.
 */
export default function Live() {
  const client = useQueryClient();
  const navigation = useNavigation();
  const patientId = usePatientId();
  const voice = useMyPatient().data?.voice_responses_enabled ?? true;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [scene, setScene] = useState<LiveLook['scene']>(null);
  const [person, setPerson] = useState<LivePerson | null>(null);
  const [looking, setLooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Refs keep the polling timer and recorder callbacks reading current values.
  const frameBusy = useRef(false);
  const personRef = useRef<LivePerson | null>(null);
  const recordingRef = useRef(false);
  const lookedOnce = useRef(false);

  const say = useCallback(
    (text: string) => {
      if (!text) return;
      setMessage(text);
      // Stay quiet while recording so MindNest's voice does not end up in the saved conversation.
      if (voice && !recordingRef.current) {
        Speech.stop();
        Speech.speak(text, { rate: 0.9 });
      }
    },
    [voice],
  );

  const rememberPerson = (seen: LivePerson | null) => {
    if (!seen) return false;
    const isNew = seen.id !== personRef.current?.id;
    personRef.current = seen;
    setPerson(seen);
    return isNew;
  };

  const capture = async (quality: number) =>
    (await camera.current?.takePictureAsync({ quality, shutterSound: false, skipProcessing: true }))?.uri ?? null;

  const lookAround = async () => {
    if (!camera.current) return;
    // A face check may be mid-flight; wait for it rather than skipping the look the person asked for.
    for (let i = 0; frameBusy.current && i < 20; i++) await new Promise((r) => setTimeout(r, 250));
    frameBusy.current = true;
    setLooking(true);
    setError(null);
    try {
      const uri = await capture(0.6);
      if (!uri) return;
      const result = await liveLook(uri, true);
      setScene(result.scene);
      rememberPerson(result.face?.status === 'RECOGNIZED' ? result.face.person : null);
      say(result.message || 'I had a look, but I could not tell much. Try pointing the camera around the room.');
      if (patientId) void client.invalidateQueries({ queryKey: objectKeys.objects(patientId) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      frameBusy.current = false;
      setLooking(false);
    }
  };

  const checkFace = async () => {
    if (!camera.current || frameBusy.current) return;
    frameBusy.current = true;
    try {
      const uri = await capture(0.4);
      if (!uri) return;
      const result = await liveLook(uri, false);
      const seen = result.face?.status === 'RECOGNIZED' ? result.face.person : null;
      if (rememberPerson(seen) && result.face) say(result.face.message);
    } catch {
      // Quiet on purpose: the next check retries, and "Look around again" shows errors.
    } finally {
      frameBusy.current = false;
    }
  };

  const lookAroundRef = useRef(lookAround);
  const checkFaceRef = useRef(checkFace);
  useEffect(() => {
    lookAroundRef.current = lookAround;
    checkFaceRef.current = checkFace;
  });

  // The first look happens as soon as the camera is ready.
  useEffect(() => {
    if (ready && !lookedOnce.current) {
      lookedOnce.current = true;
      void lookAroundRef.current();
    }
  }, [ready]);

  // Familiar-face checks run only while this screen is in front.
  useFocusEffect(
    useCallback(() => {
      if (!ready) return undefined;
      const id = setInterval(() => void checkFaceRef.current(), FACE_CHECK_MS);
      return () => clearInterval(id);
    }, [ready]),
  );

  const saveRecording = async (uri: string) => {
    recordingRef.current = false;
    const withWhom = personRef.current;
    setSaving(true);
    setError(null);
    try {
      await uploadAudio('/conversations/record', uri, {
        consent_confirmed: 'true',
        ...(withWhom ? { person_id: withWhom.id } : {}),
      });
      if (patientId) void client.invalidateQueries({ queryKey: ['patient', patientId, 'conversations'] });
      say(
        withWhom
          ? `I saved your conversation with ${withWhom.name}. You can ask me about it later.`
          : 'I saved the conversation. You can ask me about it later.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const recorder = useVoiceRecorder(MAX_RECORDING_SECONDS, (uri) => void saveRecording(uri));

  const startRecording = async () => {
    setError(null);
    Speech.stop();
    if (!(await recorder.start())) {
      setError('MindNest needs the microphone to remember the conversation.');
      return;
    }
    recordingRef.current = true;
    setMessage(null);
  };

  const stopRecording = async () => {
    const uri = await recorder.stop();
    if (uri) await saveRecording(uri);
    else recordingRef.current = false;
  };
  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  // Leaving mid-conversation asks first, so a recording is never lost by accident.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!recordingRef.current) return;
        event.preventDefault();
        Alert.alert('Save this conversation?', 'You are still recording.', [
          { text: 'Keep recording', style: 'cancel' },
          {
            text: 'Save and leave',
            onPress: () =>
              void stopRecordingRef.current().finally(() => navigation.dispatch(event.data.action)),
          },
        ]);
      }),
    [navigation],
  );

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <AppText variant="title">MindNest needs the camera</AppText>
        <AppText>
          Point the camera around you. MindNest will tell you which room you are in, remember where your things are and
          tell you who you are with. Photos are not kept.
        </AppText>
        {permission.canAskAgain ? (
          <Button label="Allow camera" icon="camera" onPress={() => void requestPermission()} large />
        ) : (
          <Button label="Open phone settings" icon="settings" onPress={() => void Linking.openSettings()} large />
        )}
      </Screen>
    );
  }

  const where = scene?.place?.name ?? (scene?.location_label || null);
  const things = scene ? (scene.found.length ? scene.found : scene.others) : [];
  const withWhom = person ? `${person.name}${person.relationship ? `, your ${person.relationship.toLowerCase()}` : ''}` : null;
  const recording = recorder.recording;

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: !recording }} />
      <View style={{ height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView
          ref={camera}
          style={{ flex: 1 }}
          facing={facing}
          mute
          animateShutter={false}
          onCameraReady={() => setReady(true)}
          accessibilityLabel="Camera view"
        />
        {recording ? (
          <View
            style={{
              position: 'absolute',
              top: space.md,
              left: space.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              backgroundColor: colors.danger,
              borderRadius: radius.pill,
              paddingHorizontal: space.md,
              paddingVertical: space.xs,
            }}
          >
            <NamedIcon name="mic" size={18} color={colors.onPrimary} />
            <AppText variant="bodyStrong" color={colors.onPrimary}>
              {`Recording ${clock(recorder.seconds)}`}
            </AppText>
          </View>
        ) : null}
      </View>

      {message ? (
        <Card tint={colors.primarySoft}>
          <AppText variant="title" accessibilityLiveRegion="polite">
            {message}
          </AppText>
        </Card>
      ) : null}

      <Card>
        <Row
          icon="home"
          label="Where you are"
          value={where ?? (looking ? 'Looking…' : 'Not sure yet')}
          muted={!where}
        />
        <Row
          icon="safety"
          label={scene?.found.length ? 'Your things I can see' : 'What I can see'}
          value={things.length ? things.join(', ') : looking ? 'Looking…' : 'Nothing I recognise yet'}
          muted={!things.length}
        />
        <Row icon="person" label="Who is with you" value={withWhom ?? 'No one I know yet'} muted={!person} />
      </Card>

      {error ? <InlineNotice tone="danger" message={error} /> : null}

      {recording ? (
        <Button
          label={person ? `Stop and save talk with ${person.name}` : 'Stop and save conversation'}
          tone="danger"
          icon="stop"
          onPress={() => void stopRecording()}
          large
        />
      ) : (
        <View style={{ gap: space.xs }}>
          <Button
            label={person ? `Remember my talk with ${person.name}` : 'Remember this conversation'}
            icon="mic"
            onPress={() => void startRecording()}
            loading={saving}
            large
          />
          <AppText variant="caption" color={colors.textMuted}>
            Only record when everyone here agrees. Tapping this confirms they do.
          </AppText>
        </View>
      )}

      <Button
        label={looking ? 'Looking…' : 'Look around again'}
        tone="secondary"
        icon="refresh"
        onPress={() => void lookAround()}
        loading={looking}
      />
      <Button
        label={facing === 'back' ? 'Use front camera' : 'Use back camera'}
        tone="ghost"
        icon="camera"
        onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
      />
      <AppText variant="caption" color={colors.textMuted}>
        Photos are checked and then discarded; they are sent to an online AI service to recognise the room and your
        things. Faces are checked only against people your caregiver added. Recordings are turned into text and the
        audio is not kept.
      </AppText>
    </Screen>
  );
}
