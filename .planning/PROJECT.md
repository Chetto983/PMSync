# MailAgent

## What This Is

A comprehensive email sync and AI-powered productivity platform. After v1 backend refactoring, v2 builds the professional email client frontend with performance optimizations and security hardening.

## Core Value

**The best professional AI mail client — fast, intelligent, and secure.**

## Current Milestone: v3.1 GDPR Compliance & Chatbot Enhancement

**Goal:** Full GDPR data privacy compliance with enhanced AI chatbot artifacts for all domains.

**Target features:**

**GDPR & Data Privacy:**
- PII tokenization for AI (extract before LLM, restore on tool/display)
- Database encryption at rest (per-tenant key management)
- Data retention policies + Right to erasure (GDPR Art. 17)
- Consent management (granular per-feature tracking)
- Audit logging (all data access for compliance)
- User data export (GDPR Art. 20 portability)
- DPA documentation support
- Terms of Service + Privacy Policy (user acceptance flow)

**AI Chatbot Improvements:**
- Rich artifacts for emails, calendar, contacts, daily briefing, follow-ups, CRM
- Nested label triage (AI assigns to label hierarchy)
- Bulk triage (batch labels, batch follow-ups)
- Full AI draft generation for replies

**Previous:** v3.0 AI Intelligence & Scalability shipped 2026-02-09 with 19/19 requirements satisfied.

## Current State

**Version:** v3.0 shipped
**Status:** Milestone complete, v3.1 planning
**Base:** v3.0 shipped (2026-02-09)

**Tech Stack:**
- Backend: NestJS, PostgreSQL, Redis, BullMQ
- Frontend: Next.js, React, TanStack Query, shadcn/ui, Tailwind CSS
- AI: Mistral, pgvector embeddings, VoltAgent
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

### Active

<!-- v3.1 GDPR Compliance & Chatbot Enhancement -->

**GDPR & Data Privacy:**
- [ ] PII tokenization for AI calls
- [ ] Database encryption at rest (per-tenant)
- [ ] Data retention policies + Right to erasure
- [ ] Consent management (granular tracking)
- [ ] Audit logging (all data access)
- [ ] User data export (GDPR Art. 20)
- [ ] DPA documentation
- [ ] Terms of Service + Privacy Policy

**AI Chatbot Improvements:**
- [ ] Rich artifacts for all domains (email, calendar, contacts, briefing, follow-ups, CRM)
- [ ] Nested label triage
- [ ] Bulk triage (batch labels, batch follow-ups)
- [ ] Full draft generation

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
*Last updated: 2026-02-09 — v3.1 milestone started*
