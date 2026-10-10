# Project State (resume here)

Last updated: 2026-10-10, end of P1.

## Where things are

- Plan: 3-day MVP covering demo scenarios A–F (see `docs/adr/` and `docs/analysis/consistency-matrix.md`).
- Phases done: **P1 Foundation**.
- Next phase: **P2 Auth, RBAC and data model (Milestones 1+2)**.

## Next exact task

Create Django apps `accounts` (custom User with role), `care` (Patient, Caregiver, CaregiverPatient,
LinkCode, EmergencyContact, PatientSettings), and `audit` (ActivityLog). Then `core/scope.py` (`patient_scope`),
the auth endpoints (register, login, refresh, logout, me, link codes), and the IDOR test matrix.
The custom user model must exist before the first `migrate`.

## Last gate results (P1)

| Check | Result |
|---|---|
| Backend `pytest` | 4 passed |
| Backend `ruff check`, `ruff format --check` | Clean |
| Backend `mypy` | No issues (16 files) |
| Mobile `tsc --noEmit` | Clean |
| Mobile `jest` | 1 passed |

## Blockers / needed from the project owner

- `GEMINI_API_KEY` in `backend/.env` (needed from Day 3).
- Expo account for the Android build (Day 3).
