# ADR-0007: Structured facts are answered without the LLM

- Status: Accepted
- Date: 2026-10-10

## Context

BR-05 says medication schedules etc. must come from the database, not be invented by the LLM. TC-017 says core functions must survive an LLM outage. The Gemini terms forbid medical advice.

## Decision

The assistant router classifies each question. Schedule, medication, reminder, appointment, object and safety questions are answered from templates over database rows, with sources. Only memory and general questions reach the LLM, and the retrieved memories are passed as quoted evidence, never as instructions.

## Alternatives rejected

Send everything to the LLM with tool calling (slower, can hallucinate, fails when the LLM is down).

## Consequences

Structured answers are fast and testable and never hallucinate fields (AC-08).
