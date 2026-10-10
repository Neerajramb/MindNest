# ADR-0009: Laptop hosting now, VM-ready deploy later

- Status: Accepted
- Date: 2026-10-10

## Context

The specs mention a 'local node', but geofence alerts need an always-on server reachable from outdoors.

## Decision

For development and the demo the backend runs on the team laptop, reachable over LAN or a secure tunnel. Configuration is environment-driven so the same code deploys to a Linux VM.

## Alternatives rejected

A cloud VM from day 1 (budget not approved).

## Consequences

Alerts only work while the laptop is on. VM deployment is documented but not verified.
