# Project State (resume here)

Last updated: 2026-10-10, end of P3.

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1**, **P2 Auth/RBAC/data model**, **P3 Schedule/medication/reminders/alerts**.
- Next phase: **P5a Safety backend (geofence, locations, SOS)**, then P4 mobile.

## Next exact task

Create app `safety`: Geofence (center, radius_m, active), Location (lat/lng, accuracy, source GPS/NETWORK/TEST,
is_mocked, recorded_at), haversine evaluator that alerts on an inside→outside transition (no repeat alerts while
still outside), `POST /patients/{id}/locations` (patient, or caregiver with source=TEST for demo), latest location,
`POST /patients/{id}/sos`, stale-location Huey check, 30-day location purge. Reuse `notifications.service.create_alert`.

## Last gate results (P3)

| Check | Result |
|---|---|
| Backend `pytest` | 79 passed, 92% coverage |
| Backend `ruff`, `mypy` | Clean (79 files) |
| Huey consumer on Windows (75 s run) | Started, ran all 3 periodic tasks, 0 errors |
| Live agenda smoke test with `seed_demo` | Matches wireframe P-06 |

Run locally: `python manage.py runserver 0.0.0.0:8000` and `python manage.py run_huey` (two terminals).
Demo accounts (fictional): `python manage.py seed_demo` → `carol` (caregiver), `thomas` (patient).

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
