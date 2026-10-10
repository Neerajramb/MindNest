# ADR-0004: SQLite + in-process vector search for the 3-day MVP

- Status: Accepted
- Date: 2026-10-10

## Context

The specs suggest a relational DB plus FAISS. Docker is not installed, and pgvector does not build easily on Windows. The deadline is 3 days.

## Decision

SQLite in WAL mode by default; `DATABASE_URL` switches to PostgreSQL with no code change. Embeddings are stored as float32 blobs next to their relational metadata, and search is a per-patient brute-force cosine in numpy behind a `VectorStore` interface. Deleting a memory or face profile deletes its vector in the same transaction, which meets the AI spec's deletion rule.

## Alternatives rejected

FAISS (separate index files make deletion and patient scoping harder); pgvector (the target for production, deferred).

## Consequences

Brute-force search is exact and fast enough for thousands of vectors per patient. Moving to PostgreSQL + pgvector is in the post-deadline backlog.
