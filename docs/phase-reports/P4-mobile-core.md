# Phase Report: P4 Mobile Shell and Core Screens (Milestone 4)

Date: 2026-10-10

## Completed

**Foundation:** Expo SDK 57, TypeScript strict, Expo Router.
- Design tokens: fixed high-contrast palette (all pairs at least 4.5:1), body text of at least 19 pt scaled by the
  patient's text-size setting, touch targets of at least 56 dp, icon plus text on every important action.
- Every data screen has loading, error, empty and content states, plus an offline banner.
- API client: envelope unwrapping, typed `ApiError` with field errors, single-flight token refresh, sign-out when
  the refresh token is rejected, request timeouts. Tokens are kept in expo-secure-store.
- TanStack Query; only the patient's own read data is persisted for offline use (24 h, wiped on sign-out).

**Auth:** sign-in with Patient/Caregiver toggle (P-01), patient registration with link code, caregiver
registration, server-address override, and plain-language "Forgot password" guidance (no email reset yet, KI-07).

**Patient app:**
- P-02 Home: greeting, clock, next reminder with "I took it" / "Remind me in 10 minutes", later today, safety
  status, location permission prompt, "Read this to me" (device text-to-speech), Help.
- P-06/P-07 My day: day navigation, medication rows distinct, next item emphasised, finished items secondary.
- P-08/P-09 Reminders: Due now / Missed / Coming up / Done; late confirmation allowed.
- P-10 Medicines (read-only, MED-05 note), P-13 Where am I (map, last-seen wording), P-14 Settings (text size,
  spoken answers, conversation privacy, sign out), P-15 Help (SOS with confirmation, call contacts, 112).
- Local notifications mirror the server's 48 h reminder window; foreground location reporting.

**Caregiver app:**
- C-02 Dashboard (patients and open alerts), C-11 Alerts (acknowledge with confirmation; 20 s polling plus local
  notifications), C-14 Account, add patient with link code and share sheet.
- C-03 Patient overview, C-04/C-05 schedule management with routine and appointment forms (native pickers;
  appointment time in the patient's timezone), C-06 medication management (times added and removed), C-07
  reminder status review, C-10 map with safe zones, add-zone by tapping, test-location simulation and safety
  alerts, emergency contacts, activity log.
- Every caregiver save asks for confirmation first (Milestone 3).

## Decisions

- JS tabs instead of NativeTabs, for larger labels and targets.
- Patient tabs are Home / My day / Reminders / More; Assistant joins on Day 3 instead of shipping a placeholder.
- Fixed light theme for predictable contrast (UI/UX section 17).

## Tests run (actual results)

- `tsc --noEmit`: clean. `expo lint` (eslint-config-expo): 0 errors and 0 warnings after fixes.
- `jest`: **17 passed** (API client envelope, refresh, sign-out and network errors; reminder, safety and alert
  logic; ReminderCard and EmptyState interaction).
- `expo export` for iOS and Android: both bundles built (3.3 MB / 3.4 MB Hermes bytecode).
- **Not yet run on a physical device** (KI-10).

## Next

Day 3: face recognition, object finder, memory and assistant, well-being, then QA and handover.
