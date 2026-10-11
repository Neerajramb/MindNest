import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/api/client';
import { holdMicrophone } from '@/features/mic-hold';

/**
 * Microphone recording for voice questions and conversations. The file is uploaded once, then discarded.
 * `onLimit` receives the file when the time limit stops the recording, so long conversations are not lost.
 */
export function useVoiceRecorder(maxSeconds = 300, onLimit?: (uri: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<() => Promise<string | null>>(async () => null);
  const onLimitRef = useRef(onLimit);
  const releaseMic = useRef<(() => void) | null>(null);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const stop = useCallback(async (): Promise<string | null> => {
    clearTimer();
    if (!recorder.isRecording) {
      releaseMic.current?.();
      return null;
    }
    await recorder.stop();
    setRecording(false);
    releaseMic.current?.();
    // Back to playback mode so spoken answers use the loudspeaker.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    return recorder.uri;
  }, [recorder]);

  useEffect(() => {
    stopRef.current = stop;
    onLimitRef.current = onLimit;
  }, [stop, onLimit]);

  const start = useCallback(async (): Promise<boolean> => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return false;
    // Ask the "MindNest" listener to let go of the microphone, and give it a moment to do so.
    releaseMic.current = holdMicrophone();
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      releaseMic.current?.();
      throw err;
    }
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxSeconds) {
          void stopRef.current().then((uri) => {
            if (uri) onLimitRef.current?.(uri);
          });
        }
        return s + 1;
      });
    }, 1000);
    return true;
  }, [recorder, maxSeconds]);

  useEffect(() => () => {
    clearTimer();
    releaseMic.current?.();
  }, []);

  return { start, stop, recording, seconds };
}

/** Upload a recording as multipart form data, with optional extra fields. */
export function uploadAudio<T>(path: string, uri: string, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  const extension = uri.split('.').pop()?.toLowerCase() || 'm4a';
  // React Native's FormData accepts { uri, name, type } file descriptors.
  form.append('audio', { uri, name: `recording.${extension}`, type: extension === 'wav' ? 'audio/wav' : 'audio/mp4' } as unknown as Blob);
  return api<T>(path, { method: 'POST', body: form, timeoutMs: 90_000 });
}
