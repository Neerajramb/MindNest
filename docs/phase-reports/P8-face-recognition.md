# Phase Report: P8 Face Intelligence (Milestone 6)

Date: 2026-10-10

## Completed

- **Models:** local OpenCV YuNet (detection, MIT) and SFace (128-d recognition, Apache-2.0). They are fetched by
  `python manage.py download_models`, which verifies pinned SHA-256 hashes, and stored in `backend/ai_models/`
  (git-ignored). Everything runs on the server's CPU; no face data leaves it.
- **Photo intake (`core/media.py`):** size and format limits, decompression-bomb guard, EXIF orientation applied
  and metadata dropped, downscale to 1280 px. Photos are processed in memory and never stored.
- **`people` app:** Person (name, relationship, notes, **consent confirmation required**) and FaceEmbedding
  (float32 vector plus model name and version, no photo).
- **Enrolment:** exactly one clear face (detection score ≥ 0.85, face ≥ 60 px) and at most 10 photos per person.
- **Recognition (`POST /face/recognize`, patient only):** compares the largest clear face against **this patient's**
  people only. Below the cosine threshold (0.40) the answer is "I'm not sure who this is"; a matching person is shown
  with a coarse confidence word, never the raw score. Unclear or missing faces get guidance instead of a guess.
- **Revocation** deletes all face data for the person (PEO-04, DB spec section 8).
- Missing models return 503 so the rest of the app keeps working (NFR-005). AI endpoints are rate-limited.
- **Mobile:** patient "Who is this?" (P-04) with camera, spoken answer and plain "Not sure"; caregiver Familiar
  people (C-08) with consent switch, photos from camera or library, and removal.

## Requirements addressed

FR-008 (camera input), FR-012, FR-013, FR-014, PEO-01..04, FACE-01..05, BR-02, BR-04, CARE-05.

## Tests run (actual results)

- `pytest`: **113 passed** (21 new). Covers TC-008 and TC-009 with a controllable engine, medium-confidence band,
  no-face and unclear-face handling, one-face enrolment rule, consent required, cross-patient isolation, revocation
  deleting vectors, access control, upload validation, 503 degradation, the real detector on a blank image, and the
  matcher and confidence labels.
- `ruff`, `mypy`: clean (105 files). Mobile `tsc`, `expo lint`: clean; `jest`: 17 passed.
- **Real-model smoke test** (OpenCV sample photos, not committed): same person after mirroring and darkening
  scored 0.922; two different people scored 0.127 (threshold 0.40). A 30 px face was correctly rejected by the
  quality gate.
- **Live end-to-end** on the running server: an unregistered face returned "not sure"; after enrolment the same
  face returned "This looks like Test Person, your friend." (high); a too-small face returned guidance. The test
  person was then deleted.

## Outstanding

- AC-05 asks for evaluation "under supported lighting/distance conditions". The FAR/FRR evaluation on consenting
  team photos has not been done yet (KI-12). The threshold may need tuning afterwards.
