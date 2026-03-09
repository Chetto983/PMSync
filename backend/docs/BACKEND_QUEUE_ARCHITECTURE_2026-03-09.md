# Backend Queue Architecture

Date: 2026-03-09
Scope: Current backend queue, worker, and background-job architecture
Status: Current reference

## Summary

The backend uses BullMQ with Redis as its primary background processing system.

This queue layer is not incidental infrastructure. It is a core platform subsystem used for:

- provider sync
- sync-back operations
- folder operations
- email send
- bulk actions
- scheduled maintenance
- webhook lifecycle
- AI-adjacent backfill and maintenance flows

The current queue architecture is strong for a modular monolith. Its main risks are operational rather than structural:

- broad queue visibility through public health surfaces
- many queue types concentrated in one process model
- mixed observability between canonical Prometheus metrics and older queue-health exports

## Core Design

### Technology

- BullMQ
- Redis via shared ioredis connection
- queue services for enqueueing and status
- worker classes/processors for execution
- scheduled jobs migrated onto BullMQ-backed infrastructure

### Design Pattern

```text
HTTP or scheduled trigger
  -> queue service
  -> BullMQ queue
  -> worker / processor
  -> domain service execution
  -> optional health and metrics reporting
```

### Shared Redis Connection

The queue stack uses a shared Redis connection singleton to avoid connection sprawl.

This is the right pattern for a monolith with many queues because it:

- reduces connection overhead
- centralizes Redis configuration
- simplifies connection lifecycle management

## Queue Configuration Model

Queue behavior is centralized in `queue.config.ts`.

Current preset classes include:

- `HIGH`
- `NORMAL`
- `LOW`
- `AI_EMBEDDING`
- `EMAIL_SYNC`
- `FOLDER_OPS`
- `CONTACTS_SYNC`
- `CALENDAR_SYNC`
- `SCHEDULED`

This is a healthy design because retry, backoff, and retention behavior are not redefined ad hoc in every queue service.

## Current Queue Capabilities

### Operational Use Cases

The queue layer supports:

- user-facing high-priority work
- provider synchronization
- sync-back to upstream providers
- scheduled maintenance and cleanup
- folder CRUD orchestration
- outbound email sending
- bulk operations
- webhook lifecycle renewal and cleanup

### Scheduling

The platform already relies on queue-backed scheduling for recurring operations instead of depending only on in-process cron behavior.

That is the right foundation for horizontal scaling.

### Health and Metrics

Current queue observability includes:

- queue status inspection
- waiting/active/completed/failed/delayed counts
- Redis latency and memory checks
- Prometheus queue-depth metrics

## Strong Points

### Queue Behavior Is Centralized

Retry, backoff, and retention defaults are centrally defined, which reduces drift.

### Shared Connection Discipline

The use of a shared Redis connection is materially better than each queue constructing its own client.

### Platform-Aware Background Processing

The queue system is used across multiple product domains, not bolted on only for one feature.

### Health and Monitoring Exist

The platform has better queue visibility than many monoliths at the same stage.

## Current Risks

### Public Queue Visibility

Detailed queue health is currently exposed through public health endpoints.

That is convenient operationally but broadens the platform’s public security surface unnecessarily.

### Mixed Metrics Surfaces

Queue visibility exists in two forms:

- canonical Prometheus metrics
- deprecated queue-health Prometheus text export under `/health/metrics`

This should converge to one source of truth.

### Operational Concentration

A large number of queues and workers still live inside one deployable application boundary.

That is acceptable today, but it raises the importance of:

- disciplined metrics
- clear job ownership
- robust dead-letter handling
- deployment safety

### Queue Taxonomy Growth

As more workflow and AI features are added, queue proliferation can become a maintainability issue unless naming, ownership, and retry classes stay governed.

## Guidance for Contributors

1. Use centralized queue presets instead of inventing per-queue retry logic.
2. Reuse the shared Redis connection for BullMQ components.
3. Prefer queue-backed execution for expensive, retryable, or provider-dependent work.
4. Do not add new monitoring integrations against deprecated queue-health metrics text.
5. Treat queue visibility endpoints as sensitive operational surfaces.

## Recommended Next Improvements

1. Restrict detailed queue health endpoints.
2. Move all monitoring to canonical `/metrics`.
3. Document queue ownership by domain and failure-handling expectations.
4. Expand dead-letter and retry observability for user-visible failures.

## Current Assessment

Queue maturity: good for a scaling monolith.

The queue architecture is a platform strength. The main work left is operational hardening and observability convergence, not a ground-up redesign.
