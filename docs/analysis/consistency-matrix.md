# Document Consistency Matrix

This matrix compares the eight specification PDFs, the consolidated HTML, the milestone sheet and the wireframes.
Status is as of 2026-10-10. A resolution marked **Decided** was approved by the project owner (see the ADRs).

Impact levels: L = low, M = medium, H = high, C = critical.

## Source-of-truth hierarchy

1. Approved decisions and ADRs (`docs/adr/`)
2. PRS (01) and SRS (02): requirement IDs and business rules
3. AI/ML spec (08) for AI behaviour; Architecture (03) for module boundaries
4. DB (05) and API (06) as amended below; the generated OpenAPI schema (`/api/schema`) is canonical once implemented
5. UI/UX (07) and the wireframes
6. Consolidated HTML and milestone sheet (derived views). The consolidated HTML omits the AI/ML spec (08).

## Matrix

| # | Item | Sources | Conflict or gap | Impact | Resolution | Decision |
|---|---|---|---|---|---|---|
| 1 | Caregiver interface form | PRS, Arch, Milestones "dashboard"; UI/UX "Caregiver App"; wireframe role toggle | Web vs mobile undefined | H | One Expo app, separate role shells (ADR-0001) | Decided |
| 2 | Where the backend runs | PRS §2 "local node"; geofence alerts need reachability | A local node is unreachable outdoors | C | Laptop now, VM-ready (ADR-0009) | Decided |
| 3 | LLM hosting | AI spec §14 local model; 14 GB RAM, no GPU | Local CPU LLM is slow and weak | H | Gemini free tier, synthetic data only; Ollama/none fallback (ADR-0006) | Decided |
| 4 | Object vocabulary | AI spec §17 keys, wallet, glasses | COCO detectors lack these classes | C | Gemini vision on room scans (ADR-0006) | Decided |
| 5 | Detector licence | AI spec "YOLO-family" | Ultralytics YOLO is AGPL-3.0 | M | Not used; local detector later must be permissively licensed | Decided |
| 6 | Face model licence | AI spec | Common InsightFace weights are non-commercial | M | OpenCV YuNet (MIT) + SFace (Apache-2.0) | Decided |
| 7 | How object observations are captured | Arch §5 continuous camera | Background camera impossible on phones; GPS useless indoors | C | Explicit "Scan room" sessions with a caregiver-defined room list | Decided |
| 8 | Conversation capture and consent | FR-015/016; DB `retention_status` | No consent model; third parties recorded (DPDP Act 2023) | C | Record button, consent checkbox, indicator; raw audio deleted after transcription | Decided |
| 9 | Patient sign-in UX | Wireframe P-01 | Passwords are hard for MCI users | H | Username/password now (wireframe); QR pairing in backlog (ADR-0010) | Decided |
| 10 | Register, invite, password | Milestone 1; wireframe Register; P-01 "Forgot" | No API endpoints | H | `/auth/register`, link codes, password change; email reset deferred (no SMTP) | Decided |
| 11 | Reminder states | DB vs UI and Milestone 3 | No SNOOZED status or snooze endpoint | M | Add SNOOZED + `snoozed_until` + `POST /reminders/{id}/snooze` | Convention |
| 12 | Reminder rule vs occurrence | DB `reminders`; `recurrence_rule TEXT` | Rules and occurrences mixed; format undefined | H | RFC 5545 RRULE; occurrences materialised 48 h ahead, idempotent; missed after 30 min grace | Decided |
| 13 | "Mark as taken" wording | Wireframe P-10 vs out-of-scope ingestion claims | Implies verification | L | Stored as ACKNOWLEDGED; shown as "patient-reported" | Convention |
| 14 | Help/Emergency (P-15) | UI/UX, wireframe | No model or API | H | `emergency_contacts`, `POST /patients/{id}/sos`; 112 shown; BR-08 disclaimer | Decided |
| 15 | Well-being storage | API §13 | No DB tables; C-13 has no API | M | `wellbeing_content`, `wellbeing_sessions`; licence-clean bundled audio | Decided |
| 16 | Notification persistence | SRS §7 | No device or outbox tables | H | `devices`, `notifications` outbox with retry | Convention |
| 17 | Vector store | DB `vector_ref`; AI spec FAISS | Deletion consistency and scoping are hard | H | Vectors stored with relational rows (ADR-0004) | Decided |
| 18 | Face embedding storage | DB `face_embeddings.embedding_ref` | Location unspecified | M | Stored with the row; photos discarded; hard delete on revoke | Convention |
| 19 | Caregiver permission levels | `caregiver_patient.permission_level` | Values undefined | M | PRIMARY, EDITOR, VIEWER | Convention |
| 20 | Caregiver access to memories | C-12 | Patient privacy control undefined | M | Patient setting NONE / METADATA (default) / FULL | Decided |
| 21 | Activity vs audit | API `/activity`, `/audit` | One table, two views | L | `category` = ACTIVITY / AUDIT | Convention |
| 22 | Admin role | "if applicable" | Undefined | L | Django admin only | Convention |
| 23 | Route inconsistencies | UI §18 vs API | `/schedule` vs `/patients/{id}/schedule` etc. | L | OpenAPI schema is canonical; patient derived from token | Convention |
| 24 | Observation location | DB lat/long | GPS meaningless indoors | L | `place` (room) + optional scan session | Convention |
| 25 | Language | `preferred_language` | Malayalam STT/LLM quality unknown | M | English now, i18n-ready strings | Assumption |
| 26 | Geofence runtime | Arch §9 | Background location needs a dev build | H | Foreground posting + simulated location (allowed by AC-09); server authoritative | Decided |
| 27 | Location retention | DB §8 | No value | M | 30 days, nightly purge | Decided |
| 28 | Performance targets | NFR-004, SRS 5.4 | Must be measured | M | Proposed targets measured in P12 | Convention |
| 29 | Consolidated HTML omits AI spec | HTML §16 | Incomplete "single reference" | L | Hierarchy above | Convention |
| 30 | Milestones omit CI, security, deployment | Milestones | Missing engineering work | M | CI from P1; security and deployment in P12/P13 | Convention |
