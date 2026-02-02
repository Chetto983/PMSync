# MailAgent

## What This Is

A comprehensive email sync and AI-powered productivity platform. After v1 refactoring, the backend features a stable, maintainable architecture with vertical slice pattern for email drivers and services, race condition protection, and comprehensive stress testing.

## Core Value

**Stable, maintainable email sync that doesn't corrupt user data under concurrent load.**

## Current State

**Version:** v1 shipped (2026-02-02)
**Status:** Production-ready
**Codebase:** ~77% reduction in large service files (11,129 → 2,512 lines)

**Tech Stack:**
- Backend: NestJS, PostgreSQL, Redis, BullMQ
- Frontend: Next.js, MUI, TanStack Query
- AI: Mistral, pgvector embeddings, VoltAgent

## Requirements

### Validated

<!-- Shipped and working in v1 -->

**v1 - Stability & Code Quality Refactor:**
- ✓ FOUND-01 through FOUND-07: Foundation cleanup (sanitization, dead code, deprecation hook) — v1
- ✓ RACE-01 through RACE-04: Race condition fixes (locks, monitoring, atomicity, timeouts) — v1
- ✓ DRIV-01 through DRIV-04: Driver splits (IMAP, Gmail, Microsoft with facades) — v1
- ✓ SERV-01 through SERV-05: Service splits (folder-sync, emails, base-sync, knowledge-base) — v1
- ✓ TEST-01 through TEST-07: Comprehensive stress testing (isolation, concurrency, recovery) — v1

**Existing capabilities (pre-v1):**
- ✓ Email sync with Gmail, Outlook, and IMAP providers — existing
- ✓ Folder synchronization across all providers — existing
- ✓ VoltAgent AI chat with context management — existing
- ✓ Email embeddings and RAG search — existing
- ✓ Multi-tenant data isolation (architecture) — existing
- ✓ Calendar and contacts integration — existing
- ✓ CRM features with relationship scoring — existing

### Active

<!-- Next milestone candidates -->

**Performance (v2 candidates):**
- [ ] PERF-01: Add pgvector HNSW index for embedding similarity search
- [ ] PERF-02: Fix N+1 query pattern for folder counts using groupBy
- [ ] PERF-03: Add orphaned embedding cleanup job
- [ ] PERF-04: Add composite indexes to Email table for common queries

**Security (v2 candidates):**
- [ ] SEC-01: Enable S3 server-side encryption for attachments
- [ ] SEC-02: Implement OAuth token revocation on provider disconnect
- [ ] SEC-03: Add automatic log redaction for auth payloads

**Monitoring (v2 candidates):**
- [ ] MON-01: Add Prometheus metrics for sync execution time by provider
- [ ] MON-02: Add alert for cache invalidation failures (GDPR compliance)
- [ ] MON-03: Add DLQ alerting when emails fail to sync

**Tech Debt (from v1 audit):**
- [ ] Wire ConversationAtomicityService to VoltAgent operations
- [ ] Integrate PrismaRetryService (replace inline retry logic)
- [ ] Add removal dates to ~15 legacy DEPRECATED markers

### Out of Scope

- Performance optimizations beyond indexing — profile first
- Major security overhaul — separate security audit
- Frontend changes — backend stability was v1 focus

## Context

**Brownfield project:** This is an existing, working codebase with real users. All changes must maintain backward compatibility.

**v1 Results:**
- 77% reduction in large service file sizes
- 500+ tests passing (zero regressions)
- 6/6 production stress test criteria met
- Documented tech debt for future optimization

**Codebase map:** `.planning/codebase/` contains detailed analysis (STACK.md, ARCHITECTURE.md, CONCERNS.md)

## Constraints

- **File size**: No file >500 lines (cohesion exceptions documented)
- **Backward compatibility**: All existing APIs must continue working
- **Test coverage**: All new code must have tests
- **Atomic commits**: Each change committed separately for easy rollback

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split by responsibility, not by size | Ensures each module has single purpose | ✓ Good |
| Use Redis locks for all folder CRUD | Consistent with existing RC-A1 fix approach | ✓ Good |
| Full test coverage for race conditions | Only way to prove concurrency bugs fixed | ✓ Good |
| Cohesion over arbitrary line limits | 7 services exceed 500 lines with documentation | ✓ Good |
| Two-phase atomicity (Prisma → Memory API) | Clean rollback path for VoltAgent operations | ✓ Good |
| Circuit breaker for LLM calls | Prevents cascade failures on API timeouts | ✓ Good |

---
*Last updated: 2026-02-02 after v1 milestone*
