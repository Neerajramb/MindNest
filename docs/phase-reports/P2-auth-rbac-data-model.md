# Phase Report: P2 Authentication, RBAC and Data Model (Milestones 1+2)

Date: 2026-10-10

## Completed

- `accounts`: custom `User` (UUID id, role PATIENT/CAREGIVER/ADMIN, name, phone). Argon2 password hashing.
- Auth API: caregiver registration, patient registration with a one-time link code, login, refresh
  (rotation + blacklist), logout (refresh blacklisted), `me`, password change. Auth endpoints are rate-limited.
- `care`: `Patient`, `Caregiver`, `CaregiverPatient` (PRIMARY/EDITOR/VIEWER), `LinkCode`, `EmergencyContact`.
  Patient settings: memory privacy, text size, voice, language.
- `core.scope`: the single authorization helper. Unlinked patients return 404; insufficient level returns 403.
- Patient and caregiver APIs: list/create patients, patient detail and update, `patients/me` and settings,
  link codes, authorize/revoke caregivers, emergency contacts.
- `audit`: `ActivityLog` with ACTIVITY/AUDIT categories, `log_event()`, activity and audit endpoints.
- `seed_demo` command creates fictional demo accounts (refuses to run with DEBUG off).

## Deviation from the DB spec

`patients.user_id` is nullable (spec says NOT NULL) because the caregiver creates the patient profile before the
patient's account exists (link-code flow, ADR-0010). Remaining domain models (schedule, medication, reminders,
safety, people, objects, memory, well-being) are added with their modules in P3–P11.

## Requirements addressed

FR-001, FR-002, AUTH-01..04, BR-01, AC-01, AC-10; groundwork for NFR-002 and NFR-008.

## Tests run (actual results)

- `pytest`: **43 passed**; coverage 92% overall.
  - TC-001 valid login, TC-002 invalid login, TC-003 patient blocked from caregiver routes,
    TC-016 unlinked caregiver gets 404 on 9 patient endpoints, patient cannot read another patient,
    VIEWER cannot write, PRIMARY-only caregiver management, link-code reuse/expiry, token rotation,
    logout blacklisting, login rate limit (429).
- `ruff check`, `ruff format --check`: clean. `mypy`: no issues in 49 files.
- Clean-database `migrate` + `seed_demo` (run twice, idempotent) + live login smoke test: passed.

## Issues found and resolved

- An empty `DATABASE_URL=` in `.env` crashed settings; it now falls back to SQLite.
- Runtime generic subscripts on DRF/Django classes raised `TypeError`; removed.
- `request.user` typing: added `core.permissions.user_of()`, which also checks authentication at runtime.
- The throttle cache leaked between tests; it is cleared per test, and a dedicated rate-limit test was added.

## Next

P3: schedule, medication, reminders and notifications (Milestone 3).
