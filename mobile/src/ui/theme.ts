/**
 * Design tokens. A fixed light, high-contrast palette is used on purpose (UI/UX spec section 17):
 * people with MCI benefit from a stable, predictable look, so the app does not follow the system dark mode.
 * Every text/background pair below meets WCAG AA (4.5:1) or better.
 */
export const colors = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  text: '#16191D', // 17:1 on surface
  textMuted: '#4A5059', // 7.6:1 on surface
  border: '#D3D8DF',
  primary: '#1F5FAD', // white text 6.5:1
  primarySoft: '#E5EEF9',
  success: '#1D7344', // 5.9:1 on surface
  successSoft: '#E2F2E8',
  warning: '#8A5300', // 6.3:1 on warningSoft
  warningSoft: '#FFF2DC',
  danger: '#B3261E', // 6.0:1 on surface
  dangerSoft: '#FCE8E6',
  medication: '#6A3D9E', // 7.7:1 on surface
  medicationSoft: '#F1EAF8',
  onPrimary: '#FFFFFF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

/** Minimum touch target in dp (Apple/Material recommend 44/48; larger for motor and vision difficulties). */
export const MIN_TOUCH = 56;

/** Base sizes; multiplied by the patient's text-size setting. The OS font scale still applies on top. */
export const typeScale = {
  caption: 15,
  body: 19,
  bodyStrong: 19,
  title: 24,
  heading: 30,
  display: 38,
} as const;

export type TypeVariant = keyof typeof typeScale;
