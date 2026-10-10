# ADR-0003: Django + DRF modular monolith

- Status: Accepted
- Date: 2026-10-10

## Context

The specs mandate a Django/REST backend with 12 modules (MOD-01..MOD-12) that must be independently testable, with replaceable AI implementations.

## Decision

A single Django project with one app per module and an `ai/` package of provider interfaces. Every patient-scoped view resolves the patient through `core.scope`, which checks the caregiver_patient link server-side. Client-supplied patient ids are never trusted.

## Alternatives rejected

Microservices (operational overhead without benefit at this scale); FastAPI (the specs name Django).

## Consequences

Clear module boundaries inside one deployable unit.
