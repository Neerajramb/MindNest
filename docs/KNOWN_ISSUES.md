# Known Issues and Technical Debt

Honest register of limitations. Each entry says what is affected, why, and what would resolve it.

| ID | Area | Issue | Why | Resolution path | Severity |
|---|---|---|---|---|---|
| KI-01 | AI / privacy | Gemini free tier may use inputs for training and human review | Free-tier terms; project owner's choice for the 3-day MVP | Use a paid Gemini tier (no training) or `LLM_PROVIDER=ollama`, plus local STT and detector, before real patient data | High |
| KI-02 | Database | SQLite instead of PostgreSQL; in-process vector search instead of pgvector | No Docker; pgvector on Windows; deadline (ADR-0004) | Set `DATABASE_URL` to PostgreSQL; add pgvector-backed `VectorStore` | Medium |
| KI-03 | Hosting | Backend runs on a laptop, so alerts only work while it is on | ADR-0009 | Deploy to a Linux VM with TLS (steps to be added to `docs/DEPLOYMENT.md`) | High |
| KI-04 | Notifications | Caregiver alerts are polled in the foreground; no remote push | Expo Go limits; no FCM credentials yet (ADR-0008) | Development build + Expo push (FCM/APNs) | High |
| KI-05 | Geofencing | No background location tracking | Needs a development build and background permission | expo-location background task in a dev build | High |
| KI-06 | Tooling | Expo skills plugin fails to load on Claude Code 2.1.86 | Unknown hook event `UserPromptExpansion` | Update Claude Code; skills read directly meanwhile | Low |
| KI-07 | Auth | No email password reset | No SMTP provider configured | Add an email backend and reset tokens | Medium |
| KI-08 | Deployment | VM / container deployment not verified | Docker not installed | Verify on a VM before production use | Medium |
