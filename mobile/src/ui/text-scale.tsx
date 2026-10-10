import { createContext, use, type ReactNode } from 'react';

const TextScaleContext = createContext(1);

/** Applies the patient's chosen text size (1.0–2.0) to every AppText below it. */
export function TextScaleProvider({ scale, children }: { scale: number; children: ReactNode }) {
  return <TextScaleContext value={Math.min(Math.max(scale, 1), 2)}>{children}</TextScaleContext>;
}

export function useTextScale(): number {
  return use(TextScaleContext);
}
