import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View, type LayoutRectangle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SavedConversation, SuggestedReminder } from '@/api/assistant';
import { ApiError } from '@/api/client';
import { useAddMyReminder, useMyPatient } from '@/api/hooks';
import { liveFaces, liveLook, type ArFace, type LivePerson } from '@/api/live';
import { objectKeys } from '@/api/objects';
import { AR, ArButton, Glass, GlassPill, NamePill, RecDot, fadeIn, fadeOut, namePillSpot } from '@/components/ar-ui';
import { useConversationCapture } from '@/features/conversation-capture';
import { usePatientId } from '@/features/patient-context';
import { uploadAudio } from '@/features/voice-recorder';
import { useWakeWord } from '@/features/wake-word';
import { boxToView } from '@/lib/ar-geometry';
import { formatClock } from '@/lib/time';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { space } from '@/ui/theme';

const FACE_PAUSE_MS = 500; // between face frames (each takes a few hundred ms on the server)
const SCENE_EVERY_MS = 10_000; // room + belongings use the online vision model, so less often
const TAG_TTL_MS = 3000; // a name disappears if the face has not been seen again for this long
const PERSON_RECENT_MS = 90_000; // a saved conversation part is linked to whoever was seen this recently
const REANNOUNCE_MS = 120_000;
const NOTICE_MS = 4000;

type Tag = { key: string; face: ArFace; seenAt: number };
type Room = { label: string; known: boolean } | null;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/**
 * AR Vision: a live camera view that keeps working on its own. Familiar faces get a floating name, the room is
 * shown, belongings are noticed and remembered, and (when everyone agrees) the conversation is saved as one memory
 * in short parts, so plans like "dinner at eight" can become reminders within seconds. "MindNest" works here too.
 */
export default function ArVision() {
  const router = useRouter();
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const patientId = usePatientId();
  const voice = useMyPatient().data?.voice_responses_enabled ?? true;
  const wake = useWakeWord();
  const addReminder = useAddMyReminder(patientId);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(true);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [view, setView] = useState<LayoutRectangle | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [photoAspect, setPhotoAspect] = useState(0.75);
  const [room, setRoom] = useState<Room>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [noticed, setNoticed] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [saveTalk, setSaveTalk] = useState<boolean | null>(null); // null until the patient has answered
  const [savedParts, setSavedParts] = useState(0);
  const [plans, setPlans] = useState<SuggestedReminder[]>([]);

  const frameBusy = useRef(false);
  const lastPerson = useRef<{ person: LivePerson; at: number } | null>(null);
  const announced = useRef(new Map<string, number>());
  const knownRoom = useRef<string | undefined>(undefined);
  const conversationId = useRef<string | undefined>(undefined);
  const saveTalkRef = useRef(saveTalk);
  useEffect(() => {
    saveTalkRef.current = saveTalk;
  }, [saveTalk]);

  // Keep working only while this screen is in front and the app is open.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);
  const running = ready && focused && appActive;

  // A frame of about 1280 px is plenty for faces and rooms, and much faster to send than a full photo.
  const pickPictureSize = async () => {
    try {
      const sizes = (await camera.current?.getAvailablePictureSizesAsync()) ?? [];
      const pixels = (s: string) => Math.max(...s.split('x').map(Number));
      const fitting = sizes.filter((s) => /^\d+x\d+$/.test(s) && pixels(s) >= 960).sort((a, b) => pixels(a) - pixels(b));
      if (fitting[0]) setPictureSize(fitting[0]);
    } catch {
      // Keep the camera's default size.
    }
  };

  const capture = async (quality: number) => {
    for (let i = 0; frameBusy.current && i < 40; i++) await pause(50); // one capture at a time
    if (!camera.current) return null;
    frameBusy.current = true;
    try {
      const photo = await camera.current.takePictureAsync({ quality, shutterSound: false, skipProcessing: true });
      if (!photo) return null;
      setPhotoAspect(Math.min(photo.width, photo.height) / Math.max(photo.width, photo.height)); // the app is portrait
      return photo.uri;
    } finally {
      frameBusy.current = false;
    }
  };

  const say = useCallback(
    (text: string) => {
      setToast(text);
      // Stay quiet while the conversation is being saved, and never talk over a MindNest answer.
      if (voice && !saveTalkRef.current && wake.status !== 'speaking' && wake.status !== 'thinking') {
        Speech.stop();
        Speech.speak(text, { rate: 0.9 });
      }
    },
    [voice, wake.status],
  );
  const sayRef = useRef(say);
  useEffect(() => {
    sayRef.current = say;
  });

  const onFaces = useCallback((faces: ArFace[]) => {
    const now = Date.now();
    setTags((old) => {
      const fresh = faces.map((face, i) => ({ key: face.person?.id ?? `unknown-${i}`, face, seenAt: now }));
      // A familiar face missed in one frame keeps its name for a moment instead of flickering.
      const keep = old.filter(
        (t) => t.face.status === 'RECOGNIZED' && now - t.seenAt < TAG_TTL_MS && !fresh.some((f) => f.key === t.key),
      );
      return [...fresh, ...keep];
    });
    for (const face of faces) {
      if (face.status !== 'RECOGNIZED' || !face.person) continue;
      lastPerson.current = { person: face.person, at: now };
      if (now - (announced.current.get(face.person.id) ?? 0) > REANNOUNCE_MS) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const who = face.person.relationship ? `${face.person.name}, your ${face.person.relationship.toLowerCase()}` : face.person.name;
        sayRef.current(`This is ${who}.`);
      }
      announced.current.set(face.person.id, now);
    }
  }, []);

  // Face loop: a frame, a short pause, the next frame. Never more than one request at a time.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    void (async () => {
      while (!stopped) {
        try {
          const uri = await capture(0.5);
          if (uri && !stopped) {
            onFaces((await liveFaces(uri)).faces);
            setOffline(false);
          }
        } catch {
          if (!stopped) setOffline(true);
          await pause(2500);
        }
        await pause(FACE_PAUSE_MS);
      }
    })();
    return () => {
      stopped = true;
    };
    // `capture` only uses refs and setters, so it does not need to be a dependency.
  }, [running, onFaces]);

  // Room + belongings loop: where the patient is and what is around, saved so "where are my keys?" works.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    void (async () => {
      while (!stopped) {
        const started = Date.now();
        try {
          const uri = await capture(0.7);
          if (uri && !stopped) {
            const look = await liveLook(uri, true, knownRoom.current);
            const place = look.scene?.place?.name;
            const label = look.scene?.location_label;
            if (place) {
              knownRoom.current = place;
              setRoom({ label: place, known: true });
            } else if (label) {
              setRoom({ label, known: false });
            }
            const found = look.scene?.found ?? [];
            if (found.length) {
              setNoticed(`Noticed your ${andList(found)}`);
              if (patientId) void client.invalidateQueries({ queryKey: objectKeys.objects(patientId) });
            }
          }
        } catch {
          // The vision service may be busy; the next look tries again.
        }
        // Look again 10 s after the last look started (straight away if that one was slow).
        for (let waited = Date.now() - started; !stopped && waited < SCENE_EVERY_MS; waited += 500) await pause(500);
      }
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, patientId]);

  // Names of faces that have left the picture fade away.
  useEffect(() => {
    if (!tags.length) return;
    const id = setTimeout(() => setTags((old) => old.filter((t) => Date.now() - t.seenAt < TAG_TTL_MS)), TAG_TTL_MS);
    return () => clearTimeout(id);
  }, [tags]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!noticed) return;
    const id = setTimeout(() => setNoticed(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [noticed]);

  const savePart = useCallback(
    async (uri: string) => {
      const recent = lastPerson.current && Date.now() - lastPerson.current.at < PERSON_RECENT_MS ? lastPerson.current.person : null;
      const send = () =>
        uploadAudio<SavedConversation>('/conversations/record', uri, {
          consent_confirmed: 'true',
          ...(recent ? { person_id: recent.id } : {}),
          ...(conversationId.current ? { conversation_id: conversationId.current } : {}),
        });
      try {
        let saved: SavedConversation;
        try {
          saved = await send();
        } catch (err) {
          // The ongoing conversation can no longer be continued (too old or deleted): start a new one.
          if (!(err instanceof ApiError && err.status === 404 && conversationId.current)) throw err;
          conversationId.current = undefined;
          saved = await send();
        }
        conversationId.current = saved.id;
        setSavedParts((n) => n + 1);
        if (saved.suggested_reminders?.length) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setPlans((p) => [...p, ...saved.suggested_reminders].slice(-2));
        }
        if (patientId) void client.invalidateQueries({ queryKey: ['patient', patientId, 'conversations'] });
      } catch {
        // No words in this part, or the server is busy: nothing to keep.
      }
    },
    [client, patientId],
  );
  const talk = useConversationCapture(running && saveTalk === true, (uri) => void savePart(uri));

  const acceptPlan = (plan: SuggestedReminder) =>
    addReminder
      .mutateAsync(plan)
      .then(() => {
        setPlans((p) => p.filter((x) => x !== plan));
        setToast(`Reminder added: ${plan.title} at ${formatClock(plan.time)}.`);
      })
      .catch(() => setToast('I could not add that reminder. Please try again.'));

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: 'AR Vision' }} />
        <AppText variant="title">MindNest needs the camera</AppText>
        <AppText>
          AR Vision shows the names of people you know on the camera picture, tells you which room you are in and
          remembers where your things are. Photos are not kept.
        </AppText>
        {permission.canAskAgain ? (
          <Button label="Allow camera" icon="camera" onPress={() => void requestPermission()} large />
        ) : (
          <Button label="Open phone settings" icon="settings" onPress={() => void Linking.openSettings()} large />
        )}
      </Screen>
    );
  }

  const roomText = room ? (room.known ? room.label : `Looks like ${room.label}`) : 'Finding the room…';
  const topOfTags = insets.top + 120; // names never cover the top controls

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <View style={{ flex: 1 }} onLayout={(e) => setView(e.nativeEvent.layout)}>
        <CameraView
          ref={camera}
          style={{ flex: 1 }}
          facing={facing}
          mute
          animateShutter={false}
          pictureSize={pictureSize}
          active={focused}
          onCameraReady={() => {
            setReady(true);
            if (!pictureSize) void pickPictureSize();
          }}
          accessibilityLabel="Live camera view"
        />
        {view
          ? tags.map((tag) => {
              const spot = namePillSpot(boxToView(tag.face.box, photoAspect, view, facing === 'front'), view, topOfTags);
              return <NamePill key={tag.key} face={tag.face} x={spot.x} y={spot.y} />;
            })
          : null}
      </View>

      {/* Top: close, where you are, and what is going on */}
      <View style={{ position: 'absolute', top: insets.top + space.sm, left: space.lg, right: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <ArButton icon="back" size={52} accessibilityLabel="Close AR Vision" onPress={() => router.back()} />
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <GlassPill icon="home" text={roomText} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {saveTalk ? (
            <Glass style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, paddingHorizontal: space.md }}>
              <RecDot />
              <AppText variant="caption" color={AR.white}>
                {talk.recording ? `Remembering${savedParts ? ` · ${savedParts}` : ''}` : 'Paused'}
              </AppText>
            </Glass>
          ) : null}
          {wake.status === 'idle' ? (
            <Glass style={{ paddingVertical: 8, paddingHorizontal: space.md }}>
              <AppText variant="caption" color={AR.skyText}>
                Say “MindNest” to ask me
              </AppText>
            </Glass>
          ) : null}
          {offline ? (
            <Glass style={{ paddingVertical: 8, paddingHorizontal: space.md }}>
              <AppText variant="caption" color={AR.rec}>
                Reconnecting…
              </AppText>
            </Glass>
          ) : null}
        </View>
        {toast ? (
          <Animated.View entering={fadeIn} exiting={fadeOut}>
            <Glass radius={24} style={{ padding: space.lg }}>
              <AppText variant="title" color={AR.white} accessibilityLiveRegion="polite">
                {toast}
              </AppText>
            </Glass>
          </Animated.View>
        ) : null}
        {noticed ? (
          <Animated.View entering={fadeIn} exiting={fadeOut} style={{ alignSelf: 'flex-start' }}>
            <GlassPill icon="check" text={noticed} />
          </Animated.View>
        ) : null}
      </View>

      {/* Bottom: the consent question first, plans heard in the talk, then the controls */}
      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: insets.bottom + space.lg, gap: space.md }}>
        {plans.map((plan) => (
          <Animated.View key={`${plan.title}-${plan.date}-${plan.time}`} entering={fadeIn} exiting={fadeOut}>
            <Glass radius={28} style={{ padding: space.lg, gap: space.md }}>
              <View style={{ gap: 2 }}>
                <AppText variant="caption" color={AR.skyText}>
                  I heard a plan
                </AppText>
                <AppText variant="title" color={AR.white}>
                  {plan.title} · {formatClock(plan.time)}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <ArButton icon="add" label="Remind me" accessibilityLabel={`Remind me: ${plan.title}`} onPress={() => void acceptPlan(plan)} />
                </View>
                <ArButton
                  icon="missed"
                  size={56}
                  accessibilityLabel="No thanks"
                  onPress={() => setPlans((p) => p.filter((x) => x !== plan))}
                />
              </View>
            </Glass>
          </Animated.View>
        ))}

        {saveTalk === null ? (
          <Animated.View entering={fadeIn} exiting={fadeOut}>
            <Glass radius={28} style={{ padding: space.xl, gap: space.md }}>
              <AppText variant="title" color={AR.white}>
                Remember conversations too?
              </AppText>
              <AppText color={AR.skyText}>
                Only if everyone here agrees to being recorded. The words are saved; the audio is not kept.
              </AppText>
              <ArButton
                icon="check"
                label="Everyone agrees"
                accessibilityLabel="Everyone agrees, remember conversations"
                onPress={() => setSaveTalk(true)}
              />
              <ArButton label="Just show names" active={false} accessibilityLabel="Do not remember conversations" onPress={() => setSaveTalk(false)} />
            </Glass>
          </Animated.View>
        ) : (
          <Animated.View entering={fadeIn} style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xl }}>
            <ArButton
              icon="mic"
              active={saveTalk}
              accessibilityLabel={saveTalk ? 'Stop remembering the conversation' : 'Remember the conversation'}
              onPress={() => setSaveTalk(saveTalk ? false : null)}
            />
            <ArButton
              icon="refresh"
              accessibilityLabel={facing === 'back' ? 'Use the front camera' : 'Use the back camera'}
              onPress={() => {
                setTags([]);
                setFacing(facing === 'back' ? 'front' : 'back');
              }}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}
