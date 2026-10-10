# Project State (resume here)

Last updated: 2026-10-10, end of P4 (Day 2).

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1**, **P2 Auth/RBAC/data model**, **P3 Schedule/medication/reminders/alerts**, **P5a Safety backend**, **P4 Mobile app core**.
- Next phase: **Day 3: P8 Face, P7 Objects, P9/P10 Memory + Assistant, P11 Well-being, P12 QA, P13 Handover**.

## Next exact task

P8 Face: backend `people` app (Person, FaceEmbedding with float32 vector), OpenCV YuNet + SFace models
downloaded to `backend/ai_models/` (git-ignored) by a management command, enrolment endpoint (multipart image,
consent flag, photo discarded after embedding), `/face/recognize` with a threshold and a 'not sure' answer;
mobile C-08 People and P-04 'Who is this?' (expo-camera). `GEMINI_API_KEY` is needed from P7 onwards.

## Last gate results (P4)

| Check | Result |
|---|---|
| Backend `pytest` | 92 passed, 92% coverage (unchanged) |
| Mobile `tsc`, `expo lint` | Clean |
| Mobile `jest` | 17 passed |
| `expo export` iOS + Android | Both bundles built |
| On-device run | Not yet done (KI-10) |

Run locally: `python manage.py runserver 0.0.0.0:8000` and `python manage.py run_huey` (two terminals).
Demo accounts (fictional): `python manage.py seed_demo` → `carol` (caregiver), `thomas` (patient).

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
