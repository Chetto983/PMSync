# Project Research Summary

**Project:** MailAgent Stability & Code Quality Refactor
**Domain:** NestJS Backend Refactoring / Email System Stabilization
**Researched:** 2026-01-31
**Confidence:** HIGH

## Executive Summary

This refactoring project addresses critical stability issues and code maintainability problems in a production email sync system handling Gmail, Outlook, and IMAP providers. Research reveals that the primary risks are circular dependency explosions during service splitting, distributed lock misconfigurations causing worse race conditions, and insufficient concurrency testing that misses production failure modes. The recommended approach follows NestJS vertical slice decomposition: split large services (1,300-2,200 lines) by functional capability (connection, folder, message, sync), maintain backward-compatible facades during migration, and wire new modules via dependency injection while preserving existing interfaces.

The seven large service files exhibit clear functional groupings that can be extracted into focused sub-modules under 500 lines each. The build order must respect dependency chains: shared utilities first (retry logic, error handling), then driver internals (connection pools, IDLE subscriptions), then sync orchestration services, and finally AI/RAG modules. Critical guardrails include mandatory pre-split dependency graph analysis to prevent cycles, real-Redis stress tests (not mocks) to prove race condition fixes work, and atomic git commits per extraction to enable rapid rollback.

The highest-impact fixes are: (1) adding distributed locks to folder CRUD operations (RC-A8) to prevent P2002 errors under concurrent load, (2) splitting IMAP driver (2,249 lines) to enable testing of connection pooling in isolation, and (3) consolidating duplicate sanitization logic to eliminate divergent bug fixes. If everything else fails, the race condition fixes must work — data corruption under concurrent sync is an unacceptable outcome for production users.

## Key Findings

### Recommended Stack

NestJS service refactoring in 2025 emphasizes **domain-driven modular decomposition**, using patterns like Factory Method, Facade, and CQRS to split monolithic services into testable units. The key principles are: (1) one service = one responsibility, (2) modules as isolation boundaries, (3) preserve DI through proper exports/imports, and (4) use interfaces to decouple implementations.

**Core refactoring patterns:**
- **Vertical Slice Decomposition**: Split by capability domain (connection, folder ops, message ops, IDLE), not technical layer — For MailAgent's 1,939-line IMAP driver, extract 5 focused services (~200-350 lines each)
- **Facade Pattern**: Keep original driver classes as thin facades delegating to sub-services — Maintains backward compatibility while enabling independent testing
- **CQRS for Complex Operations**: Separate read and write responsibilities when services have >10 methods — Applies to `email-sync` and `knowledge-base` services
- **Shared Module for Cross-Cutting Concerns**: Extract common utilities (retry, locking, error handling) to `common/` module imported by all others — Already present as `CommonModule` with `PrismaRetryService` and `RedisLockService`

**Critical NestJS DI rules:**
- Constructor injection over property injection (explicit dependencies)
- Export from module definitions, not provider arrays (prevents resolution errors)
- Never use `forwardRef()` as first solution (indicates design problem)
- Abstract classes for shared logic, not code duplication

### Expected Features

A well-refactored codebase exhibits three characteristics: **elimination of duplication** (DRY), **removal of dead code**, and **file sizes under 500 lines** for cognitive manageability.

**Must have (table stakes):**
- Zero duplicate code (DRY) — No function appears in >1 file with >80% similarity, consolidate MailAgent's 3 sanitization functions into `sanitize.utils.ts`
- No dead code — Remove all `DEPRECATED TOOLS` blocks, `MEDIUM` model mapping, `extractPlainText` unused function
- File size <500 lines (hard limit) — 7 files currently violate (2,249 to 1,364 lines), all must be split
- Type safety enforcement — Zero TypeScript errors in strict mode, no `any` without justification
- Consistent naming — Files follow `*.service.ts`, `*.controller.ts`, `*.utils.ts` pattern
- Test coverage for refactored code — Every refactored function has at least one unit test, edge cases documented

**Should have (competitive excellence):**
- Cyclomatic complexity <10 — Use ESLint `complexity` rule, extract complex branching to strategy patterns
- Zero ESLint warnings — All warnings resolved or explicitly disabled with explanation
- Single responsibility per module — Each service has one reason to change, dependencies injected not instantiated
- Comprehensive JSDoc on public APIs — Every exported function/class has description, parameters, `@throws`, `@example`
- Atomic commits with focused changes — Each commit does one thing (refactor OR feature OR fix), not mixed "cleanup" commits

**Defer (anti-features to remove):**
- God files / mega services — Files >500 lines handling multiple concerns (current state, must eliminate)
- Copy-paste programming — Nearly identical code in multiple locations (sanitization functions)
- Zombie code — Deprecated markers without removal dates, commented blocks never executed
- Implicit dependencies — Services instantiating their own dependencies instead of injection
- Magic strings and numbers — Hardcoded values without named constants
- Inconsistent error handling — Mix of thrown errors, returned nulls, silent failures

### Architecture Approach

The 7 large service files (1,300-2,249 lines each) exhibit clear functional groupings that can be extracted into focused sub-modules following NestJS best practices: extract cohesive method groups into dedicated services, maintain backward-compatible facade patterns during migration, and wire new modules via DI. Build order must respect dependency chains: shared utilities first, then drivers, then sync services, finally AI services.

**Major components:**

1. **Driver Files (IMAP, Google, Microsoft)** — Split by vertical capability slice:
   - IMAP: `imap-connection-pool.ts` (~300), `imap-folder.service.ts` (~250), `imap-message.service.ts` (~500), `imap-idle.service.ts` (~350), `imap-send.service.ts` (~300), `imap.driver.ts` facade (~200)
   - Google: `google-folder.service.ts` (~200), `google-message.service.ts` (~400), `google-send.service.ts` (~250), `google-sync.service.ts` (~300), `google.driver.ts` facade (~200)
   - Microsoft: Similar 4-module split with facade pattern

2. **Sync Services (folder-sync, base-sync)** — Split by provider and responsibility:
   - folder-sync: `imap-folder-sync.ts` (~350), `gmail-folder-sync.ts` (~350), `microsoft-folder-sync.ts` (~350), `folder-db.service.ts` (~400), `folder-sync.service.ts` orchestrator (~150)
   - base-sync: `sync-incremental.service.ts` (~400), `sync-full.service.ts` (~300), `sync-token.service.ts` (~200), `base-email-sync.service.ts` abstract (~300)

3. **RAG Services (knowledge-base)** — Split by domain (embedding lifecycle):
   - `embedding-composer.service.ts` (~300) — Content composition, chunking
   - `embedding-crud.service.ts` (~250) — Create/delete/list operations
   - `embedding-search.service.ts` (~350) — Vector search, hydration
   - `embedding-backfill.service.ts` (~200) — Batch orchestration
   - `knowledge-base.service.ts` facade (~200)

**Component boundaries:**
- Public facades (IMAPDriver, GoogleDriver, KnowledgeBaseService) remain unchanged — Controllers/queues call these
- Internal sub-services are module-private (not exported) — Only facade is exported
- Dependency graph flows: common/utils → driver internals → driver factory → sync services → AI services

### Critical Pitfalls

Research identified 14 pitfalls that cause NestJS refactoring projects to fail. Top 5 by severity:

1. **Circular Dependency Hell After Service Splitting** — Services suddenly stop injecting after refactoring with `Error: Nest can't resolve dependencies of X`. Prevention: Map dependencies BEFORE splitting, extract shared logic to common module first, use interface injection for cross-module deps, never use `forwardRef()` as first solution. MailAgent risk: `folder-sync.service.ts` (1,629 lines) calls into `gmail-folder.service.ts` which calls back for normalization — must break cycle before splitting.

2. **Non-Atomic Lock Acquisition** — Intermittent P2002 errors under load, lock appears to work in tests but fails in production. Prevention: NEVER use `SETNX` + `EXPIRE` separately (not atomic), always verify `SET ... NX PX` pattern, test lock under failure (kill process between operations). MailAgent current state: `RedisLockService` correctly uses atomic command (line 115), risk is when developers copy-paste and simplify.

3. **Lock TTL Shorter Than Operation Duration** — Sync completes successfully but database has duplicate/corrupted data, logs show same lock acquired by two processes. Prevention: Lock TTL must exceed MAXIMUM expected operation time (not average), add monitoring for lock duration, use `extendLock()` for long operations. MailAgent-specific: Current 5-minute TTL for folder-sync (line 64) is safe but needs monitoring with >4 min alert (RC-A1).

4. **Testing Refactored Code with Mocks Instead of Real Concurrency** — Tests pass but production has race conditions, "works on my machine" for concurrent scenarios. Prevention: Race condition tests MUST use real Redis and real database, use stress test scripts for production scenarios (MailAgent's `stress-test-production-scenarios.ts`), test failure modes not just success. Required for Phase RC-A1/RC-A8 before merging.

5. **Missing P2002/P2034 Retry Logic in New Code** — Unique constraint violations crash operation instead of retrying, transaction deadlocks cause request failures. Prevention: All upsert operations must use `PrismaRetryService`, verify retry wrapper on all `prisma.` calls in new code, use `RepeatableRead` or `Serializable` isolation for bulk operations. MailAgent current state: Service exists but adoption is inconsistent.

**Additional critical pitfalls:**
- Exported service not registered in module (missing from `providers` or `exports` array)
- Interface injection without token (interfaces don't exist at runtime, use symbols)
- Scope mismatch (singleton injecting REQUEST-scoped service causes data leaks)
- Lock scope too wide/narrow (serializes parallel operations or doesn't prevent race)
- Transaction + lock ordering mismatch (lock must wrap transaction, not inside)

## Implications for Roadmap

Based on research, suggested phase structure respects dependency chains and groups high-risk changes for isolated testing:

### Phase 1: Foundation - Shared Utilities Extraction
**Rationale:** Must extract cross-cutting concerns BEFORE splitting services to prevent circular dependencies. Services depend on common utilities, not vice versa.

**Delivers:**
- `common/utils/sanitize.utils.ts` — Consolidated LLM sanitization (eliminates 3 duplicate implementations)
- `common/services/prisma-retry.service.ts` — Enhanced with P2034 deadlock retry (currently missing)
- Dead code cleanup — Remove deprecated tools, Mistral MEDIUM model, `extractPlainText` function

**Addresses (from FEATURES.md):**
- Zero duplicate code (table stakes)
- No dead code (table stakes)

**Avoids (from PITFALLS.md):**
- Pitfall 1: Circular dependencies — Extracting shared utilities first breaks potential cycles
- Pitfall 13: Missing P2002/P2034 retry logic — Fix foundation before widespread use

**Research flag:** Skip research-phase (well-documented NestJS patterns)

---

### Phase 2: Driver Internals - IMAP Split
**Rationale:** IMAP is most complex driver (2,249 lines, most features). Split this first to prove the pattern works, then replicate for Google/Microsoft. Connection pooling and IDLE subscriptions are high-risk extractions requiring real concurrency tests.

**Delivers:**
- `imap-connection-pool.service.ts` (~300 lines) — Semaphore-based pooling, cleanup logic
- `imap-idle.service.ts` (~350 lines) — IDLE subscriptions, reconnection, event handlers
- `imap-folder.service.ts` (~250 lines) — Folder CRUD, canonical mapping
- `imap-message.service.ts` (~500 lines) — Message fetch, parse, batch operations
- `imap-send.service.ts` (~300 lines) — SMTP send, draft, reply
- `imap.driver.ts` facade (~200 lines) — Delegates to sub-services, maintains `IEmailDriver` interface

**Addresses (from FEATURES.md):**
- File size <500 lines (table stakes) — Splits largest file
- Single responsibility per module (excellence) — Each service has one concern

**Avoids (from PITFALLS.md):**
- Pitfall 1: Circular dependencies — Dependency graph shows one-way flow (pool → folder/message/idle)
- Pitfall 2: Exported service not registered — Module checklist required in PR template
- Pitfall 10: Mocked tests missing race conditions — IDLE subscription requires real IMAP server test

**Uses (from STACK.md):**
- Vertical Slice Decomposition pattern
- Facade Pattern for backward compatibility
- Factory Method Pattern for per-account instances

**Research flag:** Skip research-phase (IMAP RFC standards, existing patterns in codebase)

---

### Phase 3: Race Condition Fixes - Folder Operations Atomicity
**Rationale:** Must fix before splitting folder-sync service. Race conditions in current code could be hidden by large file size; extraction makes them more visible and testable.

**Delivers:**
- RC-A1: Monitoring for folder sync lock timeout (>4 min alert via Prometheus/logging)
- RC-A8: Distributed locks on all folder CRUD operations (create, update, delete, rename)
- Lock scope design: `folder:crud:{providerId}:{folderId}` (folder-level granularity)
- Stress tests: 10 concurrent folder syncs, folder rename during sync, P2034 deadlock recovery

**Addresses (from FEATURES.md):**
- Test coverage for refactored code (table stakes) — Stress tests prove concurrency safety

**Avoids (from PITFALLS.md):**
- Pitfall 5: Non-atomic lock acquisition — Use existing `RedisLockService.withLock()`
- Pitfall 6: Lock TTL shorter than operation — 5-minute TTL verified, monitoring added
- Pitfall 7: Releasing someone else's lock — Lua script check-and-delete pattern enforced
- Pitfall 8: Lock scope too wide/narrow — Folder-level granularity allows parallel provider syncs
- Pitfall 9: Transaction + lock ordering mismatch — Lock wraps Prisma transaction

**Implements (from ARCHITECTURE.md):**
- Shared locking pattern across all folder operations

**Research flag:** Needs research-phase (distributed lock patterns for NestJS, Redlock vs single-node Redis, monitoring setup)

---

### Phase 4: Sync Services - Folder Sync Split
**Rationale:** After race conditions fixed and IMAP pattern proven, split folder-sync (1,629 lines) by provider. Each provider's sync logic is self-contained (~350 lines), natural vertical slice.

**Delivers:**
- `imap-folder-sync.service.ts` (~350 lines) — IMAP-specific folder sync
- `gmail-folder-sync.service.ts` (~350 lines) — Gmail label sync
- `microsoft-folder-sync.service.ts` (~350 lines) — Microsoft folder sync
- `folder-db.service.ts` (~400 lines) — Prisma operations, count updates (shared by all providers)
- `folder-sync.service.ts` orchestrator (~150 lines) — Provider routing, public API

**Addresses (from FEATURES.md):**
- File size <500 lines (table stakes)
- Single responsibility per module (excellence)

**Avoids (from PITFALLS.md):**
- Pitfall 1: Circular dependencies — Provider-specific syncs are independent, no cross-calls
- Pitfall 13: Missing retry logic — All Prisma calls use `PrismaRetryService` wrapper

**Implements (from ARCHITECTURE.md):**
- Provider-specific extraction pattern (replicable to base-sync later)

**Research flag:** Skip research-phase (pattern established in Phase 2, provider APIs already known)

---

### Phase 5: Remaining Drivers - Google & Microsoft Splits
**Rationale:** Replicate IMAP split pattern proven in Phase 2. Lower risk because pattern is established and these drivers have fewer features (~1,400 lines vs 2,249).

**Delivers:**
- Google: `google-folder.service.ts`, `google-message.service.ts`, `google-send.service.ts`, `google-sync.service.ts`, `google.driver.ts` facade
- Microsoft: `microsoft-folder.service.ts`, `microsoft-message.service.ts`, `microsoft-send.service.ts`, `microsoft-sync.service.ts`, `microsoft.driver.ts` facade

**Addresses (from FEATURES.md):**
- File size <500 lines (table stakes) — Eliminates remaining large driver files

**Avoids (from PITFALLS.md):**
- Same pitfalls as Phase 2, but lower risk due to established pattern

**Research flag:** Skip research-phase (replicating proven pattern)

---

### Phase 6: Base Sync Service - Abstract Extraction
**Rationale:** After all drivers split and working, refactor base-sync (1,382 lines) shared orchestration. Abstract classes are harder to test in isolation, so do this after concrete implementations proven.

**Delivers:**
- `sync-incremental.service.ts` (~400 lines) — Delta/incremental sync logic
- `sync-full.service.ts` (~300 lines) — Full sync logic
- `sync-token.service.ts` (~200 lines) — Token refresh, validation
- `base-email-sync.service.ts` abstract (~300 lines) — Public API, delegates to above

**Addresses (from FEATURES.md):**
- File size <500 lines (table stakes)
- Single responsibility per module (excellence)

**Avoids (from PITFALLS.md):**
- Pitfall 1: Circular dependencies — Abstract base only depends on injected services, not concrete implementations
- Pitfall 4: Scope mismatch — Document scope of all services before extraction

**Implements (from ARCHITECTURE.md):**
- CQRS separation (incremental vs full sync as separate concerns)

**Research flag:** Skip research-phase (NestJS abstract class patterns documented)

---

### Phase 7: AI Services - Knowledge Base RAG Split
**Rationale:** Last to split because AI services depend on email sync stability. RAG operations are isolated from sync, can be refactored independently.

**Delivers:**
- `embedding-composer.service.ts` (~300 lines) — Content composition, chunking
- `embedding-crud.service.ts` (~250 lines) — Create/delete/list embeddings
- `embedding-search.service.ts` (~350 lines) — Vector search, hydration
- `embedding-backfill.service.ts` (~200 lines) — Batch backfill orchestration
- `knowledge-base.service.ts` facade (~200 lines)

**Addresses (from FEATURES.md):**
- File size <500 lines (table stakes) — Last large file eliminated

**Avoids (from PITFALLS.md):**
- Pitfall 12: Test coverage doesn't cover multi-tenant isolation — Embedding queries must verify tenant isolation

**Implements (from ARCHITECTURE.md):**
- Domain-based extraction (embedding lifecycle stages)

**Research flag:** Skip research-phase (RAG patterns well-documented, pgvector queries already implemented)

---

### Phase 8: Testing & Validation
**Rationale:** After all splits complete, comprehensive integration and stress testing to prove stability under production scenarios.

**Delivers:**
- Multi-tenant concurrent sync tests (10 syncs at same second)
- Folder rename during sync tests (race between sync and folder ops)
- P2034 deadlock recovery tests (actual deadlock creation)
- System folder protection tests (isSystem flag enforcement)
- Redis lock contention tests (20 workers compete for lock)
- Large batch operation tests (1000+ emails at once)
- Token expiry mid-sync tests (OAuth expires during sync)

**Addresses (from FEATURES.md):**
- Test coverage for refactored code (table stakes) — Comprehensive production scenario coverage

**Avoids (from PITFALLS.md):**
- Pitfall 10: Testing with mocks instead of real concurrency — All tests use real Redis and PostgreSQL
- Pitfall 12: Missing multi-tenant isolation — Explicit tenant isolation tests

**Research flag:** Needs research-phase (production stress test patterns, chaos engineering for NestJS)

---

### Phase Ordering Rationale

**Dependency chain respected:**
```
Phase 1 (utilities) → Phase 2 (IMAP driver) → Phase 3 (race fixes) → Phase 4 (folder-sync)
                           ↓                         ↓
                    Phase 5 (other drivers)  →  Phase 6 (base-sync)
                                                     ↓
                                              Phase 7 (AI/RAG)
                                                     ↓
                                              Phase 8 (testing)
```

**Risk mitigation through grouping:**
- High-risk extractions (IMAP connection pool, IDLE subscriptions) in Phase 2 with dedicated concurrency tests
- Race condition fixes in Phase 3 BEFORE splitting services that could hide them
- Pattern establishment (IMAP) before replication (Google, Microsoft)
- Abstract class refactoring (base-sync) AFTER concrete implementations proven

**Backward compatibility maintained:**
- Each phase preserves public APIs via facade pattern
- Existing tests pass without modification until Phase 8
- Atomic git commits per extraction enable rapid rollback
- Feature flags not required (facades guarantee compatibility)

**Avoid pitfalls through ordering:**
- Phase 1 breaks circular dependencies before they form (shared utilities extracted first)
- Phase 3 fixes race conditions before splitting exposes them
- Phase 6 deferred until concrete implementations proven (abstract classes harder to test)
- Phase 8 validates entire refactoring with production scenarios

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (Race Condition Fixes):** Distributed lock patterns for NestJS, Redlock vs single-node Redis, monitoring setup (Prometheus vs logging), lock contention metrics
- **Phase 8 (Testing & Validation):** Production stress test patterns, chaos engineering for NestJS, multi-tenant data leak detection, performance regression baselines

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Utilities):** Well-documented NestJS module patterns, DRY consolidation is standard refactoring
- **Phase 2 (IMAP Driver):** IMAP RFC standards, existing patterns in codebase, vertical slice decomposition established
- **Phase 4 (Folder Sync):** Pattern established in Phase 2, provider APIs already known
- **Phase 5 (Other Drivers):** Replicating proven IMAP pattern
- **Phase 6 (Base Sync):** NestJS abstract class patterns documented
- **Phase 7 (Knowledge Base):** RAG patterns well-documented, pgvector queries already implemented

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official NestJS docs, established refactoring patterns (vertical slice, facade, CQRS), existing MailAgent codebase follows these patterns |
| Features | HIGH | Clear industry standards (DRY, no dead code, <500 lines), MailAgent's CONCERNS.md provides measurable baseline, automated metrics available (jscpd, ts-prune, wc -l) |
| Architecture | HIGH | Dependency graph analysis from existing codebase, phase ordering validated against real file line counts, facade pattern proven in NestJS at scale |
| Pitfalls | HIGH | Multiple authoritative sources (NestJS docs, Redis official docs, Prisma error reference), MailAgent's existing lock/retry services demonstrate awareness of these pitfalls, production stress test scripts exist as templates |

**Overall confidence:** HIGH

Research is based on official documentation, established industry patterns, and analysis of the actual MailAgent codebase. The refactoring approach (vertical slice decomposition, facade pattern) is proven at scale in production NestJS applications. The main uncertainty is not "what to do" but "execution risk" — maintaining discipline during each split to prevent cycles and ensure testing.

### Gaps to Address

**Lock monitoring strategy:** Research identified need for lock timeout alerts (>4 min for folder sync) but didn't specify monitoring tooling. During Phase 3 planning, must decide: Prometheus metrics + Grafana alerts vs structured logging + log aggregation. Recommendation: Use existing MailAgent observability stack (verify in STACK.md).

**Multi-tenant test data generation:** Stress tests require realistic multi-tenant workloads (10+ tenants, 1000+ folders each). No research on test data generation strategy. During Phase 8 planning, consider: Faker.js for synthetic data vs anonymized production dump. Recommendation: Start with Faker.js, graduate to production-like data if patterns aren't realistic.

**Rollback procedure documentation:** Research identified rollback strategies (immediate revert, gradual feature flag) but didn't document MailAgent-specific procedure. During Phase 1, create `ROLLBACK.md` with: deployment pipeline commands, feature flag locations, health check verification steps.

**Cyclomatic complexity baseline:** FEATURES.md recommends <10 complexity but didn't measure current state. During Phase 1, run `eslint --plugin complexity` on all 7 target files to establish baseline. Track complexity reduction as success metric.

**Lock contention thresholds:** Research recommends monitoring lock duration but didn't specify alert thresholds. During Phase 3, analyze production logs to determine: P50/P95/P99 folder sync duration, then set alert at P99 + 20% buffer. Example: If P99 = 3 minutes, alert at 3.6 minutes (before 5-minute TTL).

## Sources

### Primary (HIGH confidence)
- [NestJS Modules Documentation](https://docs.nestjs.com/modules) — Module system, dependency injection, exports
- [NestJS CQRS Recipe](https://docs.nestjs.com/recipes/cqrs) — Command/Query separation pattern
- [Redis Official: Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) — Atomic lock acquisition, release verification
- [Prisma Error Reference](https://www.prisma.io/docs/orm/reference/error-reference) — P2002, P2034 error codes and retry strategies
- [Prisma Transactions Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) — Transaction isolation levels, batch queries
- MailAgent Codebase: `.planning/codebase/CONCERNS.md` — Source of truth for line counts, duplicate code locations
- MailAgent Codebase: `backend/src/common/services/redis-lock.service.ts` — Existing atomic lock pattern
- MailAgent Codebase: `backend/scripts/stress-test-production-scenarios.ts` — Production test template

### Secondary (MEDIUM confidence)
- [NestJS and Modular Architecture - Level Up Coding](https://levelup.gitconnected.com/nest-js-and-modular-architecture-principles-and-best-practices-806c2cb008d5) — Vertical slice decomposition
- [NestJS Factory Method Pattern - Michael Guay](https://michaelguay.dev/nestjs-factory-method-pattern/) — Per-account driver instances
- [CQRS with NestJS - Startup House](https://startup-house.com/blog/cqrs-with-nestjs) — When to split commands/queries
- [Mastering Dependency Injection in NestJS - Medium](https://vitiya99.medium.com/mastering-dependency-injection-in-nestjs-advanced-patterns-for-scalable-applications-5de82ee84601) — Advanced DI patterns
- [How to Avoid Circular Dependencies in NestJS - LogRocket](https://blog.logrocket.com/avoid-circular-dependencies-nestjs/) — Circular dependency detection and fixes
- [Redis Distributed Locks: 10 Common Mistakes - Leapcell](https://leapcell.io/blog/redis-distributed-locks-10-common-mistakes) — Lock TTL, scope, release patterns

### Tertiary (LOW confidence)
- [Best Practices for Structuring NestJS Application - Medium](https://arnab-k.medium.com/best-practices-for-structuring-a-nestjs-application-b3f627548220) — Directory structure opinions (validate against MailAgent conventions)
- [NestJS Layered Architecture Template - GitHub](https://github.com/benedya/nestjs-layered-architecture) — Example project (verify patterns against official docs)
- [10 Prisma Transaction Patterns That Avoid Deadlocks - Medium](https://medium.com/@connect.hashblock/10-prisma-transaction-patterns-that-avoid-deadlocks-4f52a174760b) — Community patterns (validate against Prisma docs)

**Source quality note:** All critical patterns (vertical slice, facade, atomic locks, retry logic) verified against official documentation from NestJS, Redis, and Prisma. Community sources used only for implementation examples, not as primary guidance.

---
*Research completed: 2026-01-31*
*Ready for roadmap: yes*
