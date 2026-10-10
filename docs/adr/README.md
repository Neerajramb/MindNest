# Architecture Decision Records

Each decision records context, the choice, rejected alternatives and consequences.
Status values: **Accepted**, **Superseded**, **Proposed**.
Approved decisions sit at the top of the source-of-truth hierarchy (see `docs/analysis/consistency-matrix.md`).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-single-mobile-app-role-shells.md) | One Expo app with separate patient and caregiver shells | Accepted |
| [0002](0002-react-native-expo.md) | React Native + Expo for the mobile client | Accepted |
| [0003](0003-django-modular-monolith.md) | Django + DRF modular monolith | Accepted |
| [0004](0004-sqlite-and-inprocess-vectors.md) | SQLite + in-process vector search for the 3-day MVP | Accepted (temporary) |
| [0005](0005-huey-background-jobs.md) | Huey (SQLite storage) for background jobs | Accepted (temporary) |
| [0006](0006-ai-providers.md) | AI provider split: local face/embeddings, Gemini for LLM/vision/STT | Accepted |
| [0007](0007-deterministic-structured-answers.md) | Structured facts are answered without the LLM | Accepted |
| [0008](0008-notifications.md) | Local scheduled reminders + polled caregiver alerts | Accepted (temporary) |
| [0009](0009-hosting.md) | Laptop hosting now, VM-ready deploy later | Accepted |
| [0010](0010-auth-and-pairing.md) | JWT auth and caregiver-issued link codes | Accepted |
