# Project State (resume here)

Last updated: 2026-10-10, end of P9+P10 (Day 3).

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1**, **P2 Auth/RBAC/data model**, **P3 Schedule/medication/reminders/alerts**, **P5a Safety backend**, **P4 Mobile app core**, **P8 Face recognition**, **P7 Object finder**, **P9+P10 Memory + Assistant**.
- Next phase: **Day 3: P8 Face, P7 Objects, P9/P10 Memory + Assistant, P11 Well-being, P12 QA, P13 Handover**.

## Next exact task

P11 Well-being: `wellbeing` app (WellbeingContent with bundled licence-clean audio generated locally: calming
tones + guided breathing script read by device TTS; WellbeingSession start/end), mobile P-12 player with
play/pause/stop and the 'supportive, not treatment' note. Then P12 QA (security review, pip/npm audit,
latency table) and P13 handover (EAS Android APK, demo script, production-readiness report).

## Last gate results (P9+P10)

| Check | Result |
|---|---|
| Backend `pytest` | 157 passed |
| Backend `ruff`, `mypy` | Clean (137 files) |
| Mobile `tsc`, `expo lint`, `jest` | Clean, 17 passed |
| Live memory + assistant (real Gemini + embeddings) | Grounded answers; 'no memory' when unknown |

Run locally: `python manage.py runserver 0.0.0.0:8000` and `python manage.py run_huey` (two terminals).
Demo accounts (fictional): `python manage.py seed_demo` → `carol` (caregiver), `thomas` (patient).

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
