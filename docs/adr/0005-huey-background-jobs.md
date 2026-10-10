# ADR-0005: Huey (SQLite storage) for background jobs

- Status: Accepted
- Date: 2026-10-10

## Context

Reminder materialisation, missed-reminder detection, notification retry, retention purge and stale-location checks need a scheduler. Celery does not officially support Windows and needs a broker.

## Decision

Huey with SqliteHuey, run as `python manage.py run_huey`. Tests run tasks immediately.

## Alternatives rejected

Celery + Redis (VM target), APScheduler in-process (lost on restart, no retries).

## Consequences

No extra infrastructure. Revisit together with ADR-0004 for the VM deployment.
