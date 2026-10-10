# ADR-0001: One Expo app with separate patient and caregiver shells

- Status: Accepted
- Date: 2026-10-10

## Context

The PRS, architecture and milestones say 'Caregiver dashboard'; the UI/UX spec defines a 'Caregiver App' (C-01..C-14); the wireframe login has a Patient/Caregiver toggle. The mobile app is the primary product, and caregivers need geofence and missed-reminder alerts on their phones.

## Decision

Build one Expo app. After sign-in the user's role selects a fully separate navigation shell (`(patient)` or `(caregiver)` route groups). A patient account can never reach caregiver routes, and the server enforces this independently (RBAC on every endpoint).

## Alternatives rejected

Separate web dashboard (+30-40% frontend work and no phone alerts); two separate apps (duplicate auth, API client, design system).

## Consequences

One codebase and one design system. A web dashboard can be added later against the same API.
