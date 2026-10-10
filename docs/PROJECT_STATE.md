# Project State (resume here)

Last updated: 2026-10-10, end of P5a.

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1**, **P2 Auth/RBAC/data model**, **P3 Schedule/medication/reminders/alerts**, **P5a Safety backend**.
- Next phase: **P4 Mobile shell + core screens (Day 2)**.

## Next exact task

Mobile P4 (Expo SDK 57, Expo Go on iPhone): API client with JWT refresh (expo-secure-store), auth screens
(login with role toggle, caregiver register, patient register with link code), role-based route groups
`(patient)` and `(caregiver)`, design tokens (>=18pt, >=56dp targets), patient Home/Schedule/Reminders/Medication/
Safety/Settings/Help, caregiver Dashboard/Patient overview/Schedule+Medication management/Reminders/Alerts/Geofence.
Local notifications from `/patients/{id}/reminders`; caregiver alert polling (`/alerts?unacknowledged=true`).
Read the Expo skills (`~/.claude/plugins/cache/claude-plugins-official/expo/1.13.6/skills/`) and the
`animate-expo` / `frontend-ui-engineering` skills before building screens.

## Last gate results (P5a)

| Check | Result |
|---|---|
| Backend `pytest` | 92 passed, 92% coverage |
| Backend `ruff`, `mypy`, `makemigrations --check` | Clean |

Run locally: `python manage.py runserver 0.0.0.0:8000` and `python manage.py run_huey` (two terminals).
Demo accounts (fictional): `python manage.py seed_demo` → `carol` (caregiver), `thomas` (patient).

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
