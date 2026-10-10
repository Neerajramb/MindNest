# Phase Report: P9 + P10 Conversational Memory and AI Assistant (Milestones 7 and 8)

Date: 2026-10-10

## Completed

**AI providers (`backend/ai/`)**
- `embeddings.py`: local fastembed all-MiniLM-L6-v2 (384-d, 87 MB, about 20 ms per batch on this laptop).
- `speech.py`: Gemini transcription into PATIENT/OTHER turns (2.8 s live); `.m4a` tries `audio/mp4` and then `audio/aac`.
- `llm.py`: provider switch `gemini | ollama | none`.

**Memory (`memory` app)**
- Conversation, ConversationMessage and Memory (chunk text plus vector, person, time).
- Recording and typed notes both **require consent**; audio is discarded after transcription. Chunks keep who said
  what and stay under 400 characters.
- Search is scoped to the patient before scoring (AI spec section 21). A recognised person adds a +0.10 boost
  without excluding others (RAG-05). Minimum similarity is 0.30.
- Deleting a conversation removes its transcript and vectors (DB spec section 8).
- Caregiver view follows the patient's setting: NONE → 403, METADATA → dates and people, FULL → text.

**Assistant (`assistant` app)**
- Rule-based router: medical advice, help, person, object, medication, appointment, reminder, memory, schedule,
  general.
- Structured intents are answered from database templates, with sources and **no LLM** (BR-05, TC-017).
- Medical-advice questions are declined (MED-05, BR-08). Person and help intents return an action that opens the
  camera or Help.
- Memory answers: local retrieval → Gemini with system instructions that call the excerpts "data, not
  instructions", excerpts fenced in quotes, JSON output citing excerpt ids. A **grounding check** rejects answers
  with no valid citation or `found=false`. If the LLM is down, the top saved excerpt is returned verbatim with an
  uncertainty note.
- Sessions keep the recognised-person context; voice questions are transcribed and then answered the same way.
- Only the intent and whether an LLM was used are logged, not the question (API spec section 17).

**Mobile**
- Patient "Ask me" tab (P-03): Speak button (30 s limit), typed questions, quick prompts, spoken answers, a
  confidence note, sources with their age, and action buttons.
- "Who is this?" now offers "Ask about <name>", which opens the assistant with that person as context (wireframe
  P-04).
- Patient "My memories" (P-11): who you are talking with, consent switch, recording with a visible indicator,
  typed notes, delete.
- Caregiver "Conversations" (C-12), honouring the patient's privacy choice.

## Requirements addressed

FR-007, FR-015, FR-016, FR-017, FR-018, FR-019, RAG-01..07, BR-05, BR-06, AC-06, AC-07, AC-08, TC-010..013, TC-017.

## Tests run (actual results)

- `pytest`: **157 passed** (36 new): chunking, TC-010, TC-011/AC-06, AC-07 person preference, cross-patient
  isolation, consent requirement, transcription failure → 503, bad format, deletion removes vectors, caregiver
  access levels, router table (13 cases), TC-017/AC-08 structured answers with `LLM_PROVIDER=none`, medical-advice
  refusal, person action, TC-013 no-memory, TC-012 grounded answer (evidence framing checked), ungrounded answers
  rejected, LLM-outage fallback, session person context, voice query, access control.
- `ruff`, `mypy` (137 files): clean. Mobile `tsc`, `expo lint`: clean; `jest`: 17 passed.
- **Live, real stack:** a synthetic recording (Windows TTS) was transcribed into 4 turns attributed to Sarah and
  saved. Then:
  - "What did Sarah say about Sunday?" → visiting with the grandchildren, bringing mango cake (high, source Sarah).
  - "When is the electrician coming?" → Tuesday morning to fix the kitchen light.
  - "What cake is my daughter bringing?" → resolved "daughter" to Sarah; mango cake.
  - "What did Sarah say about my birthday?" → "I don't have a memory about that." (no invention).
  - Medicines, today's schedule, keys, medical advice and general chat all answered as designed.

## Outstanding

- Speech-to-text of the phone's `.m4a` recordings is not yet verified (KI-14); only WAV was tested live.
- The demo memory (Sarah, fictional) remains in the local database for the demo.
