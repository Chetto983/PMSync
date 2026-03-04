# PMSync

## What This Is

A professional AI-powered email and productivity platform evolving toward enterprise CRM capabilities. Backend built on NestJS/Prisma/BullMQ, frontend on Next.js/React/assistant-ui. AI layer rebuilt on raw AI SDK v6 with tool orchestration, HITL, and hybrid RAG. Currently at 58/100 enterprise readiness per full-stack audit — v4.0 targets stabilization and debt reduction to establish enterprise foundations.

## Core Value

**The best professional AI mail client — fast, intelligent, and secure.**

## Current Milestone: v4.0 Enterprise Stabilization

**Goal:** Stabilize architecture for enterprise readiness — break circular dependencies, standardize API contracts, harden auth, fix performance debt, and formalize module boundaries. Based on Enterprise Platform PRD Phase 1 (Stabilization & Debt Reduction) plus v3.2 carry-forward items.

**Target features:**

**Architecture Stabilization (from PRD Phase 1):**
- Break top circular dependencies (15 → ≤5) and formalize domain boundaries
- Standardize API response/error contracts and enforce version policy
- Remove silent frontend API fallbacks that hide backend contract drift
- Migrate frontend token handling off localStorage to secure httpOnly cookies

**Module Boundaries (v3.2 carry-forward):**
- Module boundary enforcement with explicit interface contracts
- AI module decoupled via service contracts (not direct imports)
- Memory profiling under simulated load (no unbounded growth)
- Lazy-loadable AI module (startup time improvement)

**Performance & Debt (v3.2 carry-forward):**
- LCP <2.5s / TTI <3.5s (currently 4.1s)
- ENC-03: Hash-based search indexes on encrypted fields (17+ query sites)
- 7 deferred bugs from v3.1 audit (RC-A1/A8 race conditions, BUG-REPORT items)
- Phase 28 gap closure: chat 403, dead polling cleanup, E2E mobile tests

**Enterprise Prep (PRD immediate recommendations):**
- Define enterprise authorization model (permission taxonomy + policy service contract)
- Stand up AI Run Ledger schema and telemetry contract (explainability foundation)

**Previous:** v3.2 AI Rebuild & Cleanup shipped 2026-03-03 (partial — 20/25 plans, phases 23-28 core complete).

## Current State

**Version:** v3.2 shipped (partial)
**Status:** Starting v4.0 Enterprise Stabilization
**Base:** v3.2 shipped (2026-03-03)

**Tech Stack:**
- Backend: NestJS 11, PostgreSQL, Redis, BullMQ, Prisma 7
- Frontend: Next.js 16, React 19, TanStack Query, shadcn/ui, Tailwind CSS
- AI: Mistral via AI SDK v6 (streamText + tool()), assistant-ui chat frontend
- Editor: TipTap for rich email compose
- Virtualization: VList for 1000+ email performance

## Requirements

### Validated

<!-- Shipped and working -->

**v3.0 - AI Intelligence & Scalability (shipped 2026-02-09):**
- ✓ INFRA-01/02/03: VoltAgent audit, tool consolidation, AI scalability
- ✓ CHAT-01/02/03/04: Vercel AI SDK streaming, contextual prompts, mobile chat, modern UI
- ✓ TRIAGE-01/02/03: Priority scoring, VIP lists, learning from user actions
- ✓ FOLLOW-01/02: Follow-ups refactor with two types, smart timing + NLP
- ✓ LABELS-01: Nested labels tree view with drag-drop
- ✓ CHATUI-01: Chat UI + agent tool on mail
- ✓ TOOL-01: Email tool triage data exposure
- ✓ ARTIFACT-01: Smart tool result renderers
- ✓ REVIEW-01: UI review and visual polish
- ✓ AUDIT-01: AI module audit (dead code, tests, perf)
- ✓ FIX-01/02: ActionExecutor tests, WCAG accessibility

**v2.1 - Optimization & Polish (shipped 2026-02-05):**
- ✓ OPT-01: Code splitting infrastructure (React.lazy for TipTap, @dnd-kit)
- ✓ OPT-02: Lighthouse CI monitoring (LCP/TTI/CLS budgets automated)
- ✓ POLISH-01: iOS viewport-fit=cover with safeArea theme tokens
- ✓ POLISH-02: Search E2E test structure (blocked by pre-existing auth bug)
- ✓ API-01: Folder nesting endpoint (circular reference protection, 12 unit tests)

**v2.0 - Professional Email Client (shipped 2026-02-04):**
- ✓ FE-01 through FE-10: Complete frontend (VList, TipTap, kanban, keyboard nav, search, dark mode)
- ✓ PERF-01 through PERF-06: Performance (HNSW, N+1 fix, prefetch, optimistic updates)
- ✓ SEC-01 through SEC-05: Security (S3 encryption, OAuth revocation, CSRF, rate limiting)
- ✓ DEBT-01 through DEBT-03: Tech debt cleanup (atomicity, retry, deprecation markers)

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

**v3.2 - AI Rebuild & Cleanup (shipped 2026-03-03, partial):**
- ✓ VoltAgent dropped, AI layer rebuilt on raw AI SDK v6 streamText + tool()
- ✓ AiChatService with conversation persistence, HITL, PII tokenization, rate limiting
- ✓ ~20 tools as @Injectable ToolsService classes with intent routing
- ✓ Hybrid RAG preserved (vector + keyword with RRF fusion)
- ✓ Non-chat AI (briefing, follow-ups, drafts) via generateText + Output.object()
- ✓ assistant-ui chat frontend with tool renderers and HITL inline
- ✓ Old VoltAgent code deleted (167 files, 33K LOC)
- ✓ Playwright E2E for chat frontend
- ⚠️ Module boundaries, performance, ENC-03, deferred bugs carried to v4.0

**v3.1 - GDPR Compliance & Chatbot Enhancement (shipped 2026-02-27):**
- ✓ PII-01/02/03/04: PII tokenization for AI calls
- ✓ ENC-01/02/04/05: Database encryption at rest, per-tenant HKDF, migration, key rotation
- ✓ CONS-01/02/03: Consent management with granular tracking
- ✓ AUDIT-01/02/03: Audit logging for all data access + AI tools
- ✓ DATA-01/02/03: Data export (GDPR Art. 20) + Right to erasure (Art. 17)
- ✓ LEGAL-01/02: Terms of Service + Privacy Policy acceptance flow
- ✓ ARTIFACT-01/02/03/04/05/06: Rich artifacts for all domains
- ✓ TRIAGE-01/02, BULK-01/02: Nested label triage + bulk operations
- ✓ DRAFT-01/02: Full AI draft generation with writing style learning
- ⚠️ ENC-03 deferred: Hash-based search on encrypted fields (17+ query sites)

### Active

<!-- v4.0 Enterprise Stabilization -->

**Architecture Stabilization:**
- [ ] Break circular dependencies (15 → ≤5)
- [ ] Formalize domain boundaries with event contracts + interfaces
- [ ] Standardize API response/error contracts globally
- [ ] Enforce API versioning policy across all controllers
- [ ] Remove silent frontend API fallbacks

**Auth & Security Hardening:**
- [ ] Migrate frontend auth off localStorage to httpOnly cookies
- [ ] Standardize all encryption to AES-GCM with rotation policy

**Module Boundaries (v3.2 carry-forward):**
- [ ] Module boundary enforcement with explicit interface contracts
- [ ] AI module decoupled via service contracts
- [ ] Memory profiling (no unbounded cache growth under load)
- [ ] Lazy-loadable AI module

**Performance & Debt (v3.2 carry-forward):**
- [ ] LCP <2.5s / TTI <3.5s
- [ ] ENC-03: Hash-based search on encrypted fields (17+ sites)
- [ ] Fix 7 deferred bugs from v3.1 audit
- [ ] Phase 28 gap closure (chat 403, dead polling, E2E mobile)

**Enterprise Prep:**
- [ ] Define permission taxonomy and policy service contract
- [ ] Stand up AI Run Ledger schema + telemetry contract

### Out of Scope

- Mobile app (web-first, responsive)
- Offline support (requires service worker complexity)
- End-to-end encryption (separate security audit)
- Zero-knowledge architecture (deferred to v4.0+)
- Custom email provider (focus on Gmail, Outlook, IMAP)
- Mastra framework (NestJS incompatible — explicitly no NestJS support)

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

| prisma-field-encryption for DB at rest | Self-hosted, Prisma-native, no cloud deps | ✓ Good |
| Per-tenant HKDF key derivation | Crypto isolation without external KMS | ✓ Good |
| CipherStash Protect rejected | Cloud dependency on ZeroKMS unacceptable | ✓ Good |
| Drop VoltAgent for raw AI SDK v6 | VoltAgent adds framework weight without proportional value; AI SDK v6 ToolLoopAgent covers our use case natively | v3.2 |
| Mastra rejected | Explicitly no NestJS support (GitHub #5081, #5880, #3301); Hono-coupled, ESM-only | v3.2 |
| Nanobot as design inspiration only | Different problem (single-user agent vs multi-tenant email client); design discipline is the lesson, not the architecture | v3.2 |
| generateObject for non-chat AI | Direct LLM call with pre-fetched data is faster, cheaper, more reliable than agent loop for briefing/follow-ups | v3.2 |

| v4.0 milestone scoped from Enterprise Platform PRD | PRD audit scored 58/100 enterprise readiness; Phase 1 (stabilization) is prerequisite for all enterprise features | v4.0 |
| v3.2 closed partial (20/25 plans) | Core AI rebuild complete; carry-forward items (perf, modules, debt) fit naturally into enterprise stabilization | v4.0 |

---
*Last updated: 2026-03-03 — v4.0 started: Enterprise Stabilization*
