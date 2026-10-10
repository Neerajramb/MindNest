import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/api/client';

/** Microphone recording for voice questions and conversations. The file is uploaded once, then discarded. */
export function useVoiceRecorder(maxSeconds = 300) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<() => Promise<string | null>>(async () => null);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const stop = useCallback(async (): Promise<string | null> => {
    clearTimer();
    if (!recorder.isRecording) return null;
    await recorder.stop();
    setRecording(false);
    // Back to playback mode so spoken answers use the loudspeaker.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    return recorder.uri;
  }, [recorder]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async (): Promise<boolean> => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return false;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxSeconds) void stopRef.current();
        return s + 1;
      });
    }, 1000);
    return true;
  }, [recorder, maxSeconds]);

  useEffect(() => clearTimer, []);

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
