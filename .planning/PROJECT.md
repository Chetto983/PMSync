# MailAgent

## What This Is

A comprehensive email sync and AI-powered productivity platform. After v1 backend refactoring, v2 builds the professional email client frontend with performance optimizations and security hardening.

## Core Value

**The best professional AI mail client — fast, intelligent, and secure.**

## Current State

**Version:** v2.0 in progress
**Status:** Milestone started (2026-02-02)
**Base:** v1 backend stable (77% reduction in service file sizes)

**Tech Stack:**
- Backend: NestJS, PostgreSQL, Redis, BullMQ
- Frontend: Next.js, React, TanStack Query, shadcn/ui, Tailwind CSS
- AI: Mistral, pgvector embeddings, VoltAgent
- Editor: TipTap for rich email compose
- Virtualization: VList for 1000+ email performance

## Requirements

### Validated

<!-- Shipped and working -->

**v1 - Stability & Code Quality Refactor (shipped 2026-02-02):**
- ✓ FOUND-01 through FOUND-07: Foundation cleanup (sanitization, dead code, deprecation hook)
- ✓ RACE-01 through RACE-04: Race condition fixes (locks, monitoring, atomicity, timeouts)
- ✓ DRIV-01 through DRIV-04: Driver splits (IMAP, Gmail, Microsoft with facades)
- ✓ SERV-01 through SERV-05: Service splits (folder-sync, emails, base-sync, knowledge-base)
- ✓ TEST-01 through TEST-07: Comprehensive stress testing (isolation, concurrency, recovery)

**Existing capabilities (pre-v1):**
- ✓ Email sync with Gmail, Outlook, and IMAP providers
- ✓ Folder synchronization across all providers
- ✓ VoltAgent AI chat with context management
- ✓ Email embeddings and RAG search
- ✓ Multi-tenant data isolation (architecture)
- ✓ Calendar and contacts integration
- ✓ CRM features with relationship scoring

### Active

<!-- v2.0 scope -->

**Frontend Email Client:**
- [ ] FE-01: Email list view with VList virtualization (1000+ emails smooth)
- [ ] FE-02: Thread display with collapsible messages and animations
- [ ] FE-03: Email composer with TipTap rich text editor
- [ ] FE-04: Folder sidebar with drag-drop and folder management
- [ ] FE-05: Kanban toggle view for workflow-based email management
- [ ] FE-06: Keyboard navigation (Superhuman-style shortcuts)
- [ ] FE-07: Multi-select with bulk actions (archive, delete, move, labels)
- [ ] FE-08: Search with filters (from, to, date, has:attachment)
- [ ] FE-09: Dark mode with system preference detection
- [ ] FE-10: AI compose with subject generation and smart reply

**Performance & Optimization:**
- [ ] PERF-01: Add pgvector HNSW index for embedding similarity search
- [ ] PERF-02: Fix N+1 query pattern for folder counts using groupBy
- [ ] PERF-03: Add orphaned embedding cleanup job
- [ ] PERF-04: Add composite indexes to Email table for common queries
- [ ] PERF-05: Optimistic updates for instant UI feedback
- [ ] PERF-06: Query prefetching for predictable navigation

**Security Hardening:**
- [ ] SEC-01: Enable S3 server-side encryption for attachments
- [ ] SEC-02: Implement OAuth token revocation on provider disconnect
- [ ] SEC-03: Add automatic log redaction for auth payloads
- [ ] SEC-04: CSRF protection for all mutations
- [ ] SEC-05: Rate limiting on frontend API routes

**Tech Debt (carried from v1):**
- [ ] DEBT-01: Wire ConversationAtomicityService to VoltAgent operations
- [ ] DEBT-02: Integrate PrismaRetryService (replace inline retry logic)
- [ ] DEBT-03: Add removal dates to ~15 legacy DEPRECATED markers

### Out of Scope

- Mobile app (web-first, responsive)
- Offline support (requires service worker complexity)
- End-to-end encryption (separate security audit)
- Custom email provider (focus on Gmail, Outlook, IMAP)

## UI Vision

**Design Philosophy:** Professional AI mail client combining enterprise polish with modern speed.

**Inspirations:**
- **Outlook**: Enterprise feel, professional density, three-panel layout
- **Kanmail**: Kanban columns for workflow, keyboard-first navigation
- **Apple Mail**: Clean native feel, contact photos, category tabs
- **Superhuman/Shortwave**: Speed obsession, AI integration, keyboard shortcuts

**Primary Pattern:** Hybrid list with kanban toggle
- Default: Traditional email list (familiar, scannable)
- Toggle: Kanban columns by status (action-oriented workflow)

**Key UI Patterns:**
- VList virtualization for smooth scrolling with 1000+ emails
- Optimistic updates (instant feedback, rollback on error)
- Motion animations for thread navigation
- Command palette for power users
- Resizable three-panel layout (sidebar, list, reading pane)

## Context

**Brownfield project:** This is an existing, working codebase with real users. All changes must maintain backward compatibility.

**v1 Results:**
- 77% reduction in large service file sizes
- 500+ tests passing (zero regressions)
- 6/6 production stress test criteria met
- Documented tech debt for future optimization

**Frontend Base:** Existing Next.js app at `frontend/` with MUI components — will migrate to shadcn/ui for email views while keeping MUI for existing dashboard.

**Codebase map:** `.planning/codebase/` contains detailed analysis (STACK.md, ARCHITECTURE.md, CONCERNS.md)

## Constraints

- **File size**: No file >500 lines (cohesion exceptions documented)
- **Backward compatibility**: All existing APIs must continue working
- **Test coverage**: All new code must have tests
- **Atomic commits**: Each change committed separately for easy rollback
- **Component isolation**: shadcn/ui for new email views, MUI for existing dashboard
- **Performance budget**: <100ms for list scroll, <200ms for thread load

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split by responsibility, not by size | Ensures each module has single purpose | ✓ Good |
| Use Redis locks for all folder CRUD | Consistent with existing RC-A1 fix approach | ✓ Good |
| Full test coverage for race conditions | Only way to prove concurrency bugs fixed | ✓ Good |
| Cohesion over arbitrary line limits | 7 services exceed 500 lines with documentation | ✓ Good |
| Two-phase atomicity (Prisma → Memory API) | Clean rollback path for VoltAgent operations | ✓ Good |
| Circuit breaker for LLM calls | Prevents cascade failures on API timeouts | ✓ Good |
| Hybrid list/kanban view | User preference for familiar + workflow flexibility | v2.0 |
| shadcn/ui + Tailwind for email views | Modern, accessible, matches Zero reference | v2.0 |
| VList for virtualization | Proven performance with 1000+ items | v2.0 |
| TipTap for rich compose | Best-in-class React editor, AI-friendly | v2.0 |

---
*Last updated: 2026-02-02 — v2.0 milestone started*
