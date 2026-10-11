import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { holdMicrophone } from '@/features/mic-hold';
import { useWakeWord } from '@/features/wake-word';

const SPEECH_DB = -40; // louder than this counts as someone talking
const PAUSE_MS = 1200; // a part ends this long after the talking stops…
const MIN_PART_MS = 3000; // …once it is at least this long,
const MAX_PART_MS = 25_000; // or at this length during non-stop talk
const POLL_MS = 200;
const MIN_SPEECH_MS = 600; // a cough or a door is not talk

/**
 * Records the conversation around the patient while `active` and hands each spoken part to `onPart` (AR Vision
 * saves them as memories). A part ends at a pause in the talk, so what was said is processed within seconds;
 * silence is never uploaded.
 *
 * In our own build with the wake word on, the "MindNest" listener records, so the patient can still say
 * "MindNest" (one microphone, one recorder). Otherwise (Expo Go, or wake word off) a normal recorder is used.
 */
export function useConversationCapture(active: boolean, onPart: (uri: string) => void) {
  const wake = useWakeWord();
  const viaWakeWord = wake.canCapture;
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [recording, setRecording] = useState(false);
  const onPartRef = useRef(onPart);
  useEffect(() => {
    onPartRef.current = onPart;
  });

  const { captureConversation } = wake;
  useEffect(() => {
    if (!active || !viaWakeWord) return;
    captureConversation((uri) => onPartRef.current(uri));
    return () => captureConversation(null);
  }, [active, viaWakeWord, captureConversation]);

  useEffect(() => {
    if (!active || viaWakeWord) return;
    let stopped = false;
    let release: (() => void) | null = null;
    let finishPart: (() => void) | null = null;

    const recordPart = async (): Promise<string | null> => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      let loudFor = 0;
      let quietFor = 0;
      await new Promise<void>((resolve) => {
        let elapsed = 0;
        const id = setInterval(() => {
          elapsed += POLL_MS;
          if ((recorder.getStatus().metering ?? -160) > SPEECH_DB) {
            loudFor += POLL_MS;
            quietFor = 0;
          } else {
            quietFor += POLL_MS;
          }
          const paused = loudFor >= MIN_SPEECH_MS && quietFor >= PAUSE_MS && elapsed >= MIN_PART_MS;
          // Nobody talking: start a fresh part now and then, so the file never grows long and silent.
          if (paused || elapsed >= MAX_PART_MS) done();
        }, POLL_MS);
        const done = () => {
          clearInterval(id);
          finishPart = null;
          resolve();
        };
        finishPart = done;
      });
      await recorder.stop();
      return loudFor >= MIN_SPEECH_MS ? recorder.uri : null;
    };

    void (async () => {
      if (!(await requestRecordingPermissionsAsync()).granted || stopped) return;
      release = holdMicrophone();
      try {
        while (!stopped) {
          const uri = await recordPart();
          if (uri) onPartRef.current(uri);
        }
      } catch {
        // Recording failed (for example the microphone was taken by a call); stop quietly.
      } finally {
        setRecording(false);
        release?.();
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      }
    })();

    return () => {
      stopped = true;
      finishPart?.(); // end the current part now, so it is still saved when AR Vision closes
    };
  }, [active, viaWakeWord, recorder]);

  return { recording: viaWakeWord ? active && wake.status !== 'paused' : recording, viaWakeWord };
}
