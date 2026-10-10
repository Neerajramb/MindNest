# Project State (resume here)

Last updated: 2026-10-10, end of P2.

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1 Foundation**, **P2 Auth/RBAC/data model**.
- Next phase: **P3 Schedule, medication, reminders, notifications (Milestone 3)**.

## Next exact task

Create apps `scheduling` (DailySchedule routine, Appointment, Medication, MedicationSchedule with RRULE),
`reminders` (Reminder occurrence: PENDING/SENT/ACKNOWLEDGED/SNOOZED/MISSED, unique per source+time) and
`notifications` (Device, Notification outbox). Then the Huey tasks: materialise 48 h, mark missed + caregiver alert.
Use `core.scope.resolve_patient`/`resolve_owned` and `core.permissions.user_of` in every view.

## Last gate results (P2)

| Check | Result |
|---|---|
| Backend `pytest` | 43 passed, 92% coverage |
| Backend `ruff`, `mypy` | Clean (49 files) |
| Clean migrate + seed + login smoke test | Passed |
| Mobile `tsc`, `jest` | Clean, 1 passed (unchanged since P1) |

Demo accounts (fictional, local only): `python manage.py seed_demo` creates `carol` (caregiver) and `thomas` (patient).

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
