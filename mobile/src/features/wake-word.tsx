import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { askAssistant, startSession, type AssistantAnswer } from '@/api/assistant';
import { errorMessage } from '@/api/client';
import { useMyPatient } from '@/api/hooks';
import { useMicrophoneHeld } from '@/features/mic-hold';
import { afterWakeWord } from '@/lib/wake-word';

type SpeechModule = typeof import('expo-speech-recognition');

/**
 * Speech recognition is a native module that Expo Go does not include, and the package loads it as soon as it is
 * imported. Load it only in our own build, so the rest of the app keeps working in Expo Go.
 */
function loadSpeechRecognition(): SpeechModule | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional native module, see above
    const mod = require('expo-speech-recognition') as SpeechModule;
    return mod.ExpoSpeechRecognitionModule.isRecognitionAvailable() ? mod : null;
  } catch {
    return null;
  }
}

const speech = loadSpeechRecognition();
const recognizer = speech?.ExpoSpeechRecognitionModule;

const ENABLED_KEY = 'mindnest.wakeWord';
const QUESTION_PAUSE_MS = 1500; // silence after the question before it is sent
const NAME_ONLY_WAIT_MS = 8000; // after just "MindNest", how long to wait for the question
const CAPTURE_PART_MS = 20_000; // while also saving a conversation, it is saved in parts of about 20 seconds

/**
 * - unavailable: Expo Go or no speech recogniser on this phone
 * - off: turned off in Settings, or permission refused
 * - idle: listening for "MindNest"
 * - listening: heard the name, taking the question
 * - thinking / speaking: answering (the microphone is closed so MindNest does not hear itself)
 * - paused: another screen is using the microphone, or the app is in the background
 */
export type WakeStatus = 'unavailable' | 'off' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused';

type WakeWord = {
  status: WakeStatus;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  heard: string;
  answer: AssistantAnswer | null;
  notice: string | null;
  dismiss: () => void;
  /** True when the listener is running and can also record the conversation (our own build, switched on). */
  canCapture: boolean;
  /**
   * Also keep the audio of what is heard (AR Vision): `onPart` gets a file for each part with speech in it. The
   * microphone can only be used by one recorder, so the wake-word listener records instead of a second recorder.
   */
  captureConversation: (onPart: ((uri: string) => void) | null) => void;
};

const WakeWordContext = createContext<WakeWord>({
  status: 'unavailable',
  enabled: false,
  setEnabled: () => undefined,
  heard: '',
  answer: null,
  notice: null,
  dismiss: () => undefined,
  canCapture: false,
  captureConversation: () => undefined,
});

export const useWakeWord = () => useContext(WakeWordContext);

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** Hands-free assistant: say "MindNest" (or "Hey MindNest") and a question while the patient app is open. */
export function WakeWordProvider({ children }: { children: ReactNode }) {
  const voice = useMyPatient().data?.voice_responses_enabled ?? true;
  const appActive = useAppActive();
  const micHeld = useMicrophoneHeld();
  const [enabled, setEnabledState] = useState(false);
  const [permitted, setPermitted] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const running = useRef(false);
  const shouldRun = useRef(false);
  const phaseRef = useRef(phase);
  const question = useRef('');
  const committed = useRef(''); // question words from finished utterances (Android splits on pauses)
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartDelay = useRef(250);
  const onDevice = useRef(recognizer?.supportsOnDeviceRecognition() ?? false);
  const session = useRef<string | undefined>(undefined);
  const voiceRef = useRef(voice);
  const capture = useRef<((uri: string) => void) | null>(null);
  const heardSpeech = useRef(false); // anything said in the current recogniser session
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
    voiceRef.current = voice;
  }, [phase, voice]);

  // On unless the patient turned it off.
  useEffect(() => {
    if (!recognizer) return;
    SecureStore.getItemAsync(ENABLED_KEY)
      .then((value) => setEnabledState(value !== 'off'))
      .catch(() => setEnabledState(true));
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    if (on) setNotice(null);
    void SecureStore.setItemAsync(ENABLED_KEY, on ? 'on' : 'off');
  }, []);

  // Ask for the microphone and speech recognition once it is on (the system shows its prompt the first time).
  useEffect(() => {
    if (!recognizer || !enabled) return;
    recognizer
      .requestPermissionsAsync()
      .then((permission) => {
        setPermitted(permission.granted);
        if (!permission.granted) {
          setEnabled(false);
          setNotice('MindNest needs the microphone and speech recognition to hear its name. You can turn this on again in Settings.');
        }
      })
      .catch(() => setPermitted(false));
  }, [enabled, setEnabled]);

  const start = useCallback(() => {
    if (!recognizer || running.current || !shouldRun.current) return;
    running.current = true;
    try {
      recognizer.start({
        lang: 'en-IN',
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        contextualStrings: ['MindNest', 'Hey MindNest'],
        requiresOnDeviceRecognition: onDevice.current,
        addsPunctuation: false,
        ...(capture.current ? { recordingOptions: { persist: true } } : {}),
      });
    } catch {
      running.current = false; // tried again on the next change (app reopened, recording finished)
    }
  }, []);

  const backToIdle = useCallback(() => {
    question.current = '';
    committed.current = '';
    setPhase('idle');
  }, []);

  // iOS keeps the whole session's words, so an old "MindNest" would wake it again: start a fresh session.
  const freshSession = () => {
    if (running.current) recognizer?.abort();
  };

  const finish = useCallback(async () => {
    const text = question.current.trim();
    if (!text) {
      freshSession();
      backToIdle();
      setHeard('');
      return;
    }
    setPhase('thinking');
    let reply: string;
    try {
      if (!session.current) session.current = (await startSession().catch(() => undefined))?.id;
      const result = await askAssistant(text, session.current);
      setAnswer(result);
      reply = result.answer;
    } catch (err) {
      setAnswer(null);
      setNotice(errorMessage(err));
      reply = "Sorry, I couldn't answer that right now.";
    }
    if (!voiceRef.current) return backToIdle();
    setPhase('speaking');
    Speech.stop();
    Speech.speak(reply, { rate: 0.9, onDone: backToIdle, onStopped: backToIdle, onError: backToIdle });
  }, [backToIdle]);

  const onTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      const current = phaseRef.current;
      if (current === 'thinking' || current === 'speaking') return;
      const rest = afterWakeWord(text);
      let next: string;
      if (rest !== null) {
        next = rest;
        if (current === 'idle') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setAnswer(null);
          setNotice(null);
          setPhase('listening');
          phaseRef.current = 'listening';
        }
      } else if (current === 'listening') {
        next = `${committed.current} ${text}`.trim();
      } else {
        return;
      }
      if (isFinal) committed.current = next;
      question.current = next;
      setHeard(next);
      if (silence.current) clearTimeout(silence.current);
      silence.current = setTimeout(() => void finish(), next ? QUESTION_PAUSE_MS : NAME_ONLY_WAIT_MS);
    },
    [finish],
  );

  // Recogniser events, subscribed once.
  useEffect(() => {
    if (!recognizer) return;
    const subs = [
      recognizer.addListener('start', () => {
        running.current = true;
        restartDelay.current = 250;
        heardSpeech.current = false;
      }),
      recognizer.addListener('audioend', (event) => {
        // A part of the conversation is finished; silent parts are not saved.
        if (capture.current && event.uri && heardSpeech.current) capture.current(event.uri);
      }),
      recognizer.addListener('end', () => {
        running.current = false;
        // Recognisers stop by themselves (iOS after about a minute, Android after silence); start again.
        if (shouldRun.current) setTimeout(start, restartDelay.current);
      }),
      recognizer.addListener('error', (event) => {
        if (event.error === 'not-allowed') {
          setEnabled(false);
          setNotice('MindNest is not allowed to use speech recognition. You can allow it in the phone settings.');
        } else if ((event.error === 'language-not-supported' || event.error === 'service-not-allowed') && onDevice.current) {
          onDevice.current = false; // no offline model for this language yet: use the phone's online recogniser
        } else if (event.error === 'network') {
          restartDelay.current = 5000;
        } else if (!['no-speech', 'speech-timeout', 'aborted'].includes(event.error)) {
          restartDelay.current = 2000;
        }
      }),
      recognizer.addListener('result', (event) => {
        const text = event.results[0]?.transcript ?? '';
        if (!text) return;
        heardSpeech.current = true;
        onTranscript(text, event.isFinal);
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [onTranscript, start, setEnabled]);

  // Listen only when on, the app is in front, no other screen is recording and MindNest is not answering.
  const listen = !!recognizer && enabled && permitted && appActive && !micHeld && (phase === 'idle' || phase === 'listening');
  useEffect(() => {
    shouldRun.current = listen;
    if (listen) start();
    else if (running.current) recognizer?.abort();
  }, [listen, start]);

  // While saving a conversation, end each session after about a minute so its audio is saved as one part; the
  // recogniser then starts again by itself. Not in the middle of a question.
  useEffect(() => {
    if (!capturing || !listen) return;
    const id = setInterval(() => {
      if (running.current && phaseRef.current === 'idle') recognizer?.stop();
    }, CAPTURE_PART_MS);
    return () => clearInterval(id);
  }, [capturing, listen]);

  const captureConversation = useCallback((onPart: ((uri: string) => void) | null) => {
    const changed = !!onPart !== !!capture.current;
    capture.current = onPart;
    setCapturing(!!onPart);
    // Recording is chosen when a session starts: end the current one (saving its audio if it was recording).
    if (changed && running.current) recognizer?.stop();
  }, []);

  useEffect(
    () => () => {
      shouldRun.current = false;
      if (silence.current) clearTimeout(silence.current);
      recognizer?.abort();
    },
    [],
  );

  // The answer stays on screen for a while after it is spoken, then the card goes away by itself.
  const showingResult = phase === 'idle' && (!!answer || !!notice);
  useEffect(() => {
    if (!showingResult) return;
    const timer = setTimeout(() => {
      setAnswer(null);
      setNotice(null);
      setHeard('');
    }, 20_000);
    return () => clearTimeout(timer);
  }, [showingResult]);

  const dismiss = useCallback(() => {
    Speech.stop();
    if (silence.current) clearTimeout(silence.current);
    setAnswer(null);
    setNotice(null);
    setHeard('');
    freshSession();
    backToIdle();
  }, [backToIdle]);

  const status: WakeStatus = !recognizer
    ? 'unavailable'
    : !enabled
      ? 'off'
      : phase !== 'idle'
        ? phase
        : !appActive || micHeld
          ? 'paused'
          : 'idle';

  const canCapture = !!recognizer && enabled && permitted;
  const value = useMemo(
    () => ({ status, enabled, setEnabled, heard, answer, notice, dismiss, canCapture, captureConversation }),
    [status, enabled, setEnabled, heard, answer, notice, dismiss, canCapture, captureConversation],
  );
  return <WakeWordContext.Provider value={value}>{children}</WakeWordContext.Provider>;
}
