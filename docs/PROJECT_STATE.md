# Project State (resume here)

Last updated: 2026-10-10, end of P7 (Day 3).

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1**, **P2 Auth/RBAC/data model**, **P3 Schedule/medication/reminders/alerts**, **P5a Safety backend**, **P4 Mobile app core**, **P8 Face recognition**, **P7 Object finder**.
- Next phase: **Day 3: P8 Face, P7 Objects, P9/P10 Memory + Assistant, P11 Well-being, P12 QA, P13 Handover**.

## Next exact task

P9+P10 Memory + Assistant: `memory` app (Conversation, ConversationMessage, Memory with local fastembed vector,
retention status), recording flow (consent, Gemini transcription, segmentation, embedding), patient+person
filtered search; `assistant` app (router: schedule/medication/reminder/object/person/memory/general; templated
deterministic answers; Gemini only for memory/general with evidence-as-data prompt; LLM-down fallback); mobile
Assistant tab (text + voice), Memory screen, caregiver memory view honouring caregiver_memory_access.
Note: restart runserver fully after editing backend/.env.

## Last gate results (P7)

| Check | Result |
|---|---|
| Backend `pytest` | 121 passed |
| Backend `ruff`, `mypy` | Clean |
| Mobile `tsc`, `expo lint`, `jest` | Clean, 17 passed |
| Live Gemini detector / scan / query | Works; no false items reported |

Run locally: `python manage.py runserver 0.0.0.0:8000` and `python manage.py run_huey` (two terminals).
Demo accounts (fictional): `python manage.py seed_demo` → `carol` (caregiver), `thomas` (patient).

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
