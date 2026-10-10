# Phase Report: P3 Schedule, Medication, Reminders and Alerts (Milestone 3)

Date: 2026-10-10

## Completed

- `scheduling`: Routine (daily schedule), Appointment, Medication, MedicationSchedule. RFC 5545 recurrence
  (daily/weekly/monthly) evaluated in the patient's timezone; wall-clock time is kept across DST.
- Day agenda endpoint (`/patients/{id}/agenda?date=`) merging routines, medication doses and appointments with
  reminder status (P-02 Home, P-06, C-03; also the assistant's deterministic source later).
- `reminders`: occurrence model (PENDING/SNOOZED/ACKNOWLEDGED/MISSED, unique per source and time), 48 h
  idempotent materialisation, immediate refresh when a caregiver edits or removes a source, missed detection after
  a 30-minute grace, patient acknowledge (only when due within 60 min; late acknowledgements flagged) and snooze
  (5–60 min).
- `notifications`: Alert (GEOFENCE/MEDICATION/SOS/LOCATION_UNAVAILABLE/SYSTEM), Device (Expo push tokens),
  Notification outbox with exponential backoff (5 attempts), Expo push client. A notification is marked SENT only
  when Expo accepts it; without a registered device it is recorded as NO_DEVICE (in-app only).
- Caregiver alert list across all patients (`/alerts`), per-patient alerts, acknowledgement.
- Huey periodic tasks: materialise (every 15 min), mark missed (every minute), retry notifications (every minute).
- `seed_demo` now also creates the wireframe's routine for the demo patient.

## Decisions

- Missed **medication** reminders alert caregivers; missed routines are recorded only (UI/UX says caregiver
  notification on a miss is "according to configuration").
- No "SENT" reminder status: reminders fire as local notifications on the patient's phone, and the server does not
  claim delivery it cannot observe.
- "Caregiver edits require confirmation before saving" (Milestone 3) is a UI confirmation step, built in P4.

## Requirements addressed

FR-003, FR-004, FR-005, FR-006, FR-025 (alerts + outbox), SCH-01..06, MED-01..05, CARE-02/03 (API), AC-02, AC-03.

## Tests run (actual results)

- `pytest`: **79 passed** (36 new), coverage 92%. Covers recurrence and DST, TC-004, TC-005, AC-02, AC-03,
  idempotency, missed→alert→notification, routine miss without alert, acknowledge/snooze rules and ownership,
  outbox success, unregistered-token cleanup, backoff to FAILED, Expo response parsing, alert ACL.
- `ruff`, `mypy`: clean (79 files).
- Huey consumer on Windows: ran 75 s, registered and executed all periodic tasks, 0 errors.
- Live smoke test: seeded agenda matches wireframe P-06; 11 reminders in the next 48 h.

## Issues found and resolved

- Two test-expectation mistakes (recurrence window, retry clock); the code was correct.

## Outstanding

- Live Expo push delivery is not verified (needs a device push token) → KI-04.
- Huey's own log handler duplicates log lines in the consumer output (cosmetic).
