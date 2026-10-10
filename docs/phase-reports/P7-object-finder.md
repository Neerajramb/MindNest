# Phase Report: P7 Object Intelligence (Milestone 5)

Date: 2026-10-10

## Completed

- **Model choice (measured, not assumed):** Gemini `gemini-flash-lite-latest`. On a sample photo it took 2.9–4.9 s
  and listed the same objects as `gemini-flash-latest` (7–18 s). `gemini-2.5-flash`, the previous default, is no
  longer available to new keys, so it was replaced. The model stays configurable through `GEMINI_MODEL`.
- **`ai/gemini.py`:** one shared client with a timeout and a single error type (`AIUnavailable`) for degradation.
  A missing key now logs a clear warning.
- **`ai/objects.py`:** `ObjectDetector` interface. The Gemini detector's JSON-schema output restricts labels to an
  **enum of the patient's tracked items**, so unknown objects are never forced into a class (AI spec section 5) and
  text inside a photo cannot add labels.
- **`objects_ai` app:** Place (rooms), TrackedObject (name plus aliases), ObjectObservation (place, time,
  confidence, source, scan id; never a photo).
- **Scan (`POST /patients/{id}/objects/scan`):** one frame, re-encoded without metadata and sent to the detector;
  observations are stored for items at or above `OBJECT_MIN_CONFIDENCE` (0.5). The photo is not kept.
- **Query (`POST /objects/query`):** deterministic matching (aliases, singular/plural, longest name wins), no LLM.
  Answers always say "last seen … at <time>"; observations older than 24 h add "it may have been moved"; an item
  that is not tracked or not yet seen gets a plain answer (OBJ-08).
- **Mobile:** patient "Find my things" (P-05) with item buttons, a free-text question and spoken answer; "Scan a
  room" with a room picker and camera; caregiver "Belongings & rooms" (C-09) with last-seen times.
- `seed_demo` adds 4 rooms and 6 tracked items (keys, wallet, glasses, phone, water bottle, bag; AI spec section 17).

## Requirements addressed

FR-008, FR-009, FR-010, FR-011, OBJ-01..08, BR-03, NFR-009, AC-04 (rules).

## Tests run (actual results)

- `pytest`: **121 passed** (8 new): TC-006 (only confident tracked items stored), TC-007/AC-04 (query returns last
  observation with time), wording for singular items and old observations, no-observation and unknown-item answers,
  plural and alias matching, 503 with nothing stored on detector failure, access control including another
  patient's room, unique item names.
- `ruff`, `mypy`: clean. Mobile `tsc`, `expo lint`: clean; `jest`: 17 passed.
- **Live:** the real Gemini detector found banana and orange on a fruit photo and did not report keys or wallet.
  Through the running API, a scan of that photo returned "I didn't see any of your tracked items here", and asking
  for keys before any scan returned "I don't have a recent location for your keys."

## Issue found and fixed

- The running server returned 503 because its process started before the key was added (the autoreload parent
  keeps the old empty environment). Fixed by a full restart; a clear log warning now names this cause.

## Outstanding

- Positive detection of real belongings (keys, glasses…) still has to be checked with staged photos on the phone
  (KI-13). Room scans send photos to the Gemini free tier: staged scenes only (KI-01).
