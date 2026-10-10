# ADR-0008: Local scheduled reminders + polled caregiver alerts

- Status: Accepted
- Date: 2026-10-10

## Context

Remote push in Expo Go is limited, and FCM/APNs setup needs accounts. Reminders must fire even when the backend or network is down.

## Decision

The server materialises reminder occurrences 48 h ahead. The patient app schedules them as local notifications and reconciles on every sync. Caregiver apps poll unacknowledged alerts every 20 s in the foreground and raise local notifications. A notifications outbox records delivery state for audit and retries.

## Alternatives rejected

Expo push from day 1 (needs a dev build and FCM credentials).

## Consequences

Caregiver alerts arrive only while the caregiver app is open or recently foregrounded. Remote push is a stretch goal for the Android APK.
