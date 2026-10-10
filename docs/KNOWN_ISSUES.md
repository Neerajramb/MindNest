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
| KI-09 | Privacy | Offline cache (the patient's agenda, reminders, medicines, safety status) is stored in AsyncStorage, which is not encrypted | Needed for offline viewing (UI/UX section 16) | Limited to the patient's own read data, 24 h maximum age, wiped on sign-out; move to an encrypted store for production | Medium |
| KI-10 | Verification | Core screens tried on the project owner's iPhone (Expo Go) on 2026-10-10: "everything looks good so far". Not yet tried on Android; not every flow exercised | Manual testing in progress | Run demo scenarios A-F on iPhone and Android before submission | Medium |
| KI-12 | AI evaluation | Face recognition not yet evaluated on consenting team photos (FAR/FRR across lighting, pose, distance); threshold 0.40 is the starting value | No team dataset yet | Collect 3-5 photos per team member plus unknown faces; run the evaluation and record results | Medium |
| KI-11 | UX scope | Reminder detail (P-09) is merged into reminder cards; Assistant, Memory, Well-being, Find object and Who is this arrive in the AI phase | 3-day plan order | Delivered on Day 3 | Low |
| KI-13 | AI evaluation | Object detection not yet evaluated on staged photos of the tracked belongings (precision/recall); live checks so far confirm it reports nothing that is not visible | No staged dataset yet | Photograph keys, wallet, glasses, phone, bottle and bag in several rooms; record results | Medium |
| KI-14 | AI / voice | Transcription of the phone's .m4a (AAC) recordings not yet verified live; WAV verified | No AAC encoder on the dev laptop | Record a question and a conversation on the iPhone; if Gemini rejects both MIME types, record WAV on iOS or convert server-side | Medium |
| KI-08 | Deployment | VM / container deployment not verified | Docker not installed | Verify on a VM before production use | Medium |
