# MailAgent Stability & Code Quality Refactor

## What This Is

A comprehensive refactoring milestone for the MailAgent codebase. This project addresses technical debt, race conditions, and code quality issues identified in the codebase audit. The goal is to improve maintainability, stability, and testability of the email sync and AI modules.

## Core Value

**Stable, maintainable email sync that doesn't corrupt user data under concurrent load.**

If everything else fails, the race condition fixes must work — folder operations must be atomic and data must remain consistent across all sync scenarios.

## Requirements

### Validated

<!-- Existing capabilities that work and must not regress -->

- Email sync with Gmail, Outlook, and IMAP providers — existing
- Folder synchronization across all providers — existing
- VoltAgent AI chat with context management — existing
- Email embeddings and RAG search — existing
- Multi-tenant data isolation (architecture) — existing
- Calendar and contacts integration — existing
- CRM features with relationship scoring — existing

### Active

<!-- Current scope: stability + code quality refactoring -->

**Race Condition Fixes:**
- [ ] RC-A1: Add monitoring for folder sync lock timeout (>4 min alert)
- [ ] RC-A8: Add distributed locks to all folder CRUD operations
- [ ] Conversation state atomicity: Wrap conversation + context updates in transaction
- [ ] API response timeouts: Add 60s timeout to LLM API calls with partial response fallback

**Large File Splits:**
- [ ] Split `imap.driver.ts` (2,249 lines) into connection, folder-sync, email-sync modules
- [ ] Split `emails.service.ts` (1,705 lines) into CRUD, bulk, cleanup services
- [ ] Split `folder-sync.service.ts` (1,629 lines) by provider
- [ ] Split `microsoft.driver.ts` (1,429 lines) into focused modules
- [ ] Split `google.driver.ts` (1,364 lines) into focused modules
- [ ] Split `base-email-sync.service.ts` (1,382 lines) into orchestration components
- [ ] Split `knowledge-base.service.ts` (1,371 lines) into focused RAG services

**Duplicate Code Consolidation:**
- [ ] Consolidate 3 LLM sanitization functions into single utility

**Dead Code Cleanup:**
- [ ] Remove deprecated Mistral MEDIUM model references
- [ ] Delete deprecated tool creators from all tools/*.ts files
- [ ] Clean up deprecated license check in usage-tracking.service.ts
- [ ] Add pre-commit hook preventing DEPRECATED markers without removal dates

**Test Coverage:**
- [ ] Tests for all race condition fixes (prove they work under concurrency)
- [ ] Tests for each new split module
- [ ] Multi-tenant isolation tests for refactored services

### Out of Scope

- Performance optimizations (N+1 queries, vector indexes) — separate milestone
- Security hardening (S3 encryption, credential rotation) — separate milestone
- New features — this is refactoring only
- Frontend changes — backend only
- Database schema migrations — code-level refactoring only

## Context

**Brownfield project:** This is an existing, working codebase with real users. All refactoring must maintain backward compatibility.

**Codebase map available:** `.planning/codebase/` contains detailed analysis of:
- STACK.md — NestJS, Next.js, PostgreSQL, Redis, BullMQ
- ARCHITECTURE.md — modular architecture with providers pattern
- CONCERNS.md — source of truth for this refactoring work

**Risk areas identified:**
- Email sync is the most critical path (affects all users)
- Race conditions can cause data corruption
- Large files make testing and code review difficult
- Duplicate code means bugs get fixed in one place but not others

**Existing patterns to follow:**
- Services follow NestJS injectable pattern
- Drivers implement provider interfaces
- Tests use Jest with real database (not mocks for critical paths)
- Redis locks via `RedisLockService`

## Constraints

- **File size**: No file >500 lines after refactoring (per CLAUDE.md)
- **Backward compatibility**: All existing APIs must continue working
- **Test coverage**: All refactored code must have tests
- **No feature changes**: Behavior must remain identical, only structure changes
- **Atomic commits**: Each refactoring step committed separately for easy rollback

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split by responsibility, not by size | Ensures each module has single purpose | — Pending |
| Use Redis locks for all folder CRUD | Consistent with existing RC-A1 fix approach | — Pending |
| Full test coverage for race conditions | Only way to prove concurrency bugs fixed | — Pending |
| Delete deprecated code immediately | Prevents confusion, reduces maintenance burden | — Pending |

---
*Last updated: 2026-01-31 after initialization*
