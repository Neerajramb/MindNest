import { useSyncExternalStore } from 'react';

/**
 * Only one thing can use the microphone at a time. Screens that record (questions, conversations) hold it, and the
 * "MindNest" wake-word listener steps aside while it is held.
 */
let holds = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Hold the microphone; call the returned function to release it (safe to call more than once). */
export function holdMicrophone(): () => void {
  holds += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    emit();
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useMicrophoneHeld = () => useSyncExternalStore(subscribe, () => holds > 0);
