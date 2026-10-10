# Phase Report: P5a Safety Backend (Milestone 9, server side)

Date: 2026-10-10

## Completed

- `safety`: Geofence (centre + radius 20–50,000 m), Location (GPS/NETWORK/TEST, accuracy, mocked flag),
  SafetyState (last evaluated state per patient).
- Evaluation: haversine distance; a patient is inside if inside **any** active zone; a fix counts as outside only
  when `distance − accuracy > radius` (no false alarms from GPS jitter at the edge). Alerts fire once on the
  transition to outside; returning is logged. Zone edits reset the state.
- Alerts carry time, coordinates, accuracy, zone, source and mocked flag (SAFE-05).
- `POST /patients/{id}/locations`: patients report GPS/NETWORK; caregivers (EDITOR+) may submit `TEST` locations
  to simulate scenario E (AC-09 allows simulated locations).
- `GET /patients/{id}/safety` (also `/locations/latest`): never reports "inside" from a missing or stale fix.
- `POST /sos`: patient Emergency button → HIGH alert with last location, returns emergency contacts.
- Huey: stale-location alert (once per episode, every 10 min), nightly purge of locations older than 30 days
  (the latest fix is kept).
- `seed_demo` adds a fictional "Home" safe zone.

## Deviations

- SOS is `POST /api/v1/sos` (patient derived from the token) instead of a patient-id route, so a client can never
  raise SOS for another patient.
- `alerts.location_id` from the DB spec is stored inside `alerts.data` (location id and coordinates) to keep the
  notifications app independent of the safety app.

## Tests run (actual results)

- `pytest`: **92 passed** (13 new), coverage 92%. TC-014, TC-015, AC-09, duplicate-alert suppression, re-exit,
  accuracy margin, multiple zones, simulation permissions (caregiver TEST only, VIEWER blocked, unlinked 404),
  validation, location-sharing switch, stale status, stale-alert episodes, retention purge, SOS.
- `ruff`, `mypy`, `makemigrations --check`: clean.

## Next

P4 mobile app (Day 2).
