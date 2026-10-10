# Project State (resume here)

Last updated: 2026-10-10, end of P8 (Day 3).

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1**, **P2 Auth/RBAC/data model**, **P3 Schedule/medication/reminders/alerts**, **P5a Safety backend**, **P4 Mobile app core**, **P8 Face recognition**.
- Next phase: **Day 3: P8 Face, P7 Objects, P9/P10 Memory + Assistant, P11 Well-being, P12 QA, P13 Handover**.

## Next exact task

P7 Objects: needs `GEMINI_API_KEY` in backend/.env. `objects_ai` app (Place/room, TrackedObject, ScanSession,
ObjectObservation), Gemini vision detector behind an `ObjectDetector` interface (JSON-schema output mapped to the
patient's tracked vocabulary), `/objects/scan` (multipart frame + place), `/objects/query`, last-seen; mobile
P-05 Find my things and caregiver C-09 Objects + rooms.

## Last gate results (P8)

| Check | Result |
|---|---|
| Backend `pytest` | 113 passed |
| Backend `ruff`, `mypy` | Clean (105 files) |
| Mobile `tsc`, `expo lint`, `jest` | Clean, 17 passed |
| Live face recognition (real models) | Unknown -> not sure; enrolled -> recognised; tiny face -> guidance |

Run locally: `python manage.py runserver 0.0.0.0:8000` and `python manage.py run_huey` (two terminals).
Demo accounts (fictional): `python manage.py seed_demo` → `carol` (caregiver), `thomas` (patient).

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
