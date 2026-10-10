# ADR-0010: JWT auth and caregiver-issued link codes

- Status: Accepted
- Date: 2026-10-10

## Context

The wireframes show username/password login, a role toggle and a 'caregiver-invited' Register screen with a link code, but the API spec has no register or invite endpoints.

## Decision

SimpleJWT: 15-minute access token, 30-day rotating refresh token with blacklist. Tokens are stored in expo-secure-store. Caregivers self-register. A caregiver creates a patient profile and receives a one-time, expiring link code; the patient registers with it. Further caregivers are linked by a PRIMARY caregiver. Auth endpoints are rate-limited.

## Alternatives rejected

Patient passwordless QR pairing (better for MCI users; deferred); a caregiver-set patient password.

## Consequences

Matches the wireframes. QR pairing and biometric unlock are backlog items.
