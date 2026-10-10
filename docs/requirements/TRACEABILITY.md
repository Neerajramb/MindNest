# Requirements Index and Traceability Matrix

This is the working index of every requirement in the specs (PRS 01, SRS 02, AI spec 08, Use-case/Test 04).
It exists so the PDFs never need to be re-read during implementation. Original wording lives in `docs/specs/`.

Status values: Not started · In progress · Implemented · Tested · Verified (demonstrated end-to-end) · Blocked · Deferred (approved).

## Functional requirements (PRS) with SRS detail

| ID | Requirement (short) | SRS detail | Module | Tests | Status |
|---|---|---|---|---|---|
| FR-001 | Authenticate patients and caregivers | AUTH-01, AUTH-03 | accounts | TC-001, TC-002 | Tested (API) |
| FR-002 | Separate patient/caregiver privileges | AUTH-02, AUTH-04, BR-01 | accounts, care, core.scope | TC-003, TC-016 | Tested (API) |
| FR-003 | Patient views daily schedule | SCH-02 | scheduling | AC-02 | Implemented end-to-end (API tested; UI not yet run on device) |
| FR-004 | Caregiver CRUD schedule items | SCH-01, SCH-03 | scheduling | AC-02 | Implemented end-to-end (API tested; UI not yet run on device) |
| FR-005 | Reminders for activities, appointments, medications | SCH-04, MED-03 | reminders | TC-005, AC-03 | Implemented end-to-end (API tested; UI not yet run on device) |
| FR-006 | Caregiver medication records and schedules | MED-01, MED-02, MED-05 | scheduling | TC-004 | Implemented end-to-end (API tested; UI not yet run on device) |
| FR-007 | Patient asks assistant about schedule/reminders/info | RAG-01, RAG-06 | assistant | AC-08 | Tested (API + live) |
| FR-008 | Capture camera input for object/face | OBJ-01, FACE-01 | mobile, objects_ai, people | TC-006, TC-008 | Implemented (camera for face and room scans) |
| FR-009 | Detect configured everyday objects | OBJ-02, OBJ-03 | objects_ai | TC-006 | Tested (API + live Gemini check); staged-photo evaluation pending (KI-13) |
| FR-010 | Store observations with time + context | OBJ-04, OBJ-05 | objects_ai | TC-006 | Tested (API + live Gemini check); staged-photo evaluation pending (KI-13) |
| FR-011 | Ask where an object was last detected | OBJ-06, OBJ-07, OBJ-08, BR-03 | objects_ai, assistant | TC-007, AC-04 | Tested (API + live Gemini check); staged-photo evaluation pending (KI-13) |
| FR-012 | Recognise registered people | FACE-02, FACE-03, FACE-04 | people | TC-008, AC-05 | Tested (API + live real-model check); team-photo evaluation pending (KI-12) |
| FR-013 | Caregiver registers familiar people | PEO-01..04 | people | — | Tested (API + live real-model check); team-photo evaluation pending (KI-12) |
| FR-014 | Unknown person reported as unknown | FACE-05, BR-02, BR-04 | people | TC-009 | Tested (API + live real-model check); team-photo evaluation pending (KI-12) |
| FR-015 | Speech to text | RAG-02 | memory (STT) | — | Tested (API + live WAV); phone m4a pending (KI-14) |
| FR-016 | Store conversations as searchable memory | — | memory | TC-010 | Tested (API + live real-model run) |
| FR-017 | RAG retrieves relevant memories | RAG-03, RAG-04 | memory | TC-011, AC-06 | Tested (API + live real-model run) |
| FR-018 | Person-aware retrieval | RAG-05 | memory, assistant | TC-012, AC-07 | Tested (API + live real-model run) |
| FR-019 | Grounded responses | RAG-06, RAG-07, BR-05, BR-06 | assistant | TC-013, AC-08 | Tested (API + live real-model run) |
| FR-020 | Caregiver defines safe zones | SAFE-01, CARE-04 | safety | — | Implemented end-to-end (API tested; UI not yet run on device) |
| FR-021 | Monitor location vs geofence | SAFE-02, SAFE-03, BR-07 | safety | TC-014 | Implemented end-to-end (API tested; UI not yet run on device) |
| FR-022 | Caregiver alert on violation | SAFE-04, SAFE-05 | safety, notifications | TC-015, AC-09 | Implemented end-to-end (API tested; UI not yet run on device) |
| FR-023 | Well-being audio | WELL-01..03 | wellbeing | — | Not started |
| FR-024 | Activity/event logs | CARE-06 | audit | — | Implemented (UI not yet run on device) |
| FR-025 | Caregiver notifications for important events | CARE-03 | notifications | — | Implemented (UI not yet run on device) |

## Caregiver dashboard (SRS 4.10)

| ID | Requirement | Screens | Status |
|---|---|---|---|
| CARE-01 | View patient status | C-02, C-03 | Implemented (UI not yet run on device) |
| CARE-02 | View schedule and reminder info | C-03, C-07 | Implemented (UI not yet run on device) |
| CARE-03 | Receive configured alerts | C-11 | Not started |
| CARE-04 | Manage geofences | C-10 | Implemented (UI not yet run on device) |
| CARE-05 | Manage familiar people | C-08 | Implemented |
| CARE-06 | Review activity history | Activity log | Not started |

## Non-functional requirements

| ID | Requirement | How it is verified | Status |
|---|---|---|---|
| NFR-001 | Privacy (minimise sensitive data) | No raw media retained; retention purge tests; Gemini synthetic-data rule | Not started |
| NFR-002 | Security | IDOR matrix, auth tests, throttling, /security-review | In progress |
| NFR-003 | Usability | Accessible tokens, large targets, icon + text, screen reader labels | Implemented (19pt+ text, 56dp+ targets, icon+text, text-size setting) |
| NFR-004 | Performance | Latency measured and recorded in P12 | Not started |
| NFR-005 | Reliability | TC-017 (LLM down → structured features keep working) | Tested (TC-017: structured answers with LLM disabled; LLM-outage fallback) |
| NFR-006 | Maintainability | Module boundaries, provider interfaces, CI | In progress |
| NFR-007 | Scalability | M:N caregivers, per-patient scoping, Postgres-ready | Not started |
| NFR-008 | Auditability | Activity/audit log for config changes and alerts | In progress |
| NFR-009 | Safety | "Last seen" wording, uncertainty language, no "safe" without location | In progress (safety status never 'safe' without fresh fix) |

## Business rules (SRS §6)

| ID | Rule | Enforced in |
|---|---|---|
| BR-01 | Patient may have several authorised caregivers | care (CaregiverPatient M:N) |
| BR-02 | Person must be registered before identification | people |
| BR-03 | Object answers mean the latest observation, not current location | objects_ai, assistant templates |
| BR-04 | Low-confidence face never presented as confirmed | people (threshold), P-04 UI |
| BR-05 | Structured data comes from the DB, not the LLM | assistant (ADR-0007) |
| BR-06 | RAG grounded; says when it does not know | assistant, memory |
| BR-07 | Geofence alerts depend on location availability | safety (stale-location alert) |
| BR-08 | Supportive only; not clinical or emergency service | UI disclaimers, P-15 |

## Acceptance criteria and demo scenarios

| AC | Area | Demo scenario | Status |
|---|---|---|---|
| AC-01 | Authentication | — | Tested (API) |
| AC-02 | Schedule | F | Not started |
| AC-03 | Medication reminder | D | Tested (API) |
| AC-04 | Object finder | A | Tested (API); live positive detection pending (KI-13) |
| AC-05 | Face recognition | B | Partly verified (live smoke test); formal evaluation pending (KI-12) |
| AC-06 | RAG | C | Tested (API + live) |
| AC-07 | Person-aware RAG | C | Tested (API + live) |
| AC-08 | Assistant (structured, no hallucination) | D | Not started |
| AC-09 | Geofence alert | E | Tested (API, simulated locations) |
| AC-10 | Privacy (no cross-patient access) | — | Tested (API, IDOR matrix) |
