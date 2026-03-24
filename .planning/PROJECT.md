# PMSync

## What This Is

A professional AI-powered email and productivity platform with enterprise-grade architecture. Backend built on NestJS/Prisma/BullMQ with standardized API contracts (response envelopes, correlation IDs, unified error handling), httpOnly cookie auth, encrypted fields with HMAC blind indexes, and AI cost observability. Frontend on Next.js/React/TanStack Query/MUI with Lighthouse CI budget enforcement and full PWA support (installable, offline email reading, background sync, push plumbing). AI layer on raw AI SDK v6 with tool orchestration, HITL, and hybrid RAG.

## Core Value

**The best professional AI mail client — fast, intelligent, and secure.**

## Current Milestone: v9.0 AI Intelligence & Platform Hardening

**Goal:** Make the AI agent smarter with graph-aware RAG, ship backend push notifications, harden rate limits, and add explicit HITL approval routing.

**Target features:**
- Push notification backend dispatch (complete the v8.0 plumbing)
- Tiered write-rate limiting per endpoint category
- Explicit HITL approval gates for destructive AI tools
- Graph RAG: query routing, reranking, graph expansion, context assembly, entity graph, memory anchoring, tool consolidation, few-shot examples

## Current State

**Version:** v9.0 in progress (2026-03-24)
**Status:** Phase 107 complete — push notification backend dispatch shipped. Push notifications now deliver to devices.
**Previous:** v7.0 System Audit & Hardening (shipped 2026-03-23, 65/65 requirements)

**v8.0 delivered:** Full PWA transformation — Serwist service worker with precaching and API bypass, offline email reading via TanStack Query persist to IndexedDB, background sync with offline mutation queue, cross-platform install prompts, push notification frontend plumbing (VAPID subscription, SW handlers), and SW update snackbar.

**Tech Stack:**
- Backend: NestJS 11, PostgreSQL, Redis, BullMQ, Prisma 7
- Frontend: Next.js 16, React 19, TanStack Query, MUI, Serwist PWA (SW + IndexedDB persist)
- AI: Mistral via AI SDK v6 (streamText + tool()), assistant-ui chat frontend
- Editor: TipTap for rich email compose
- Virtualization: VList for 1000+ email performance
- Security: httpOnly cookies, AES-256-GCM, HMAC blind indexes, per-tenant HKDF, Argon2id, ES256 JWT, __Host- cookies
- Observability: Prometheus /metrics (prom-client), AiRunLedger (cost/latency telemetry), correlation IDs, Lighthouse CI

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

**v5.0 - better-auth Migration (completed 2026-03-10):**
- ✓ CORE-01..07: better-auth email/password, Google OAuth, email verification, password reset, HIBP, DB sessions
- ✓ NEST-01..06: Global BetterAuthGuard, TenantGuard/RolesGuard compat, WS auth, BullMQ context
- ✓ FEUI-01..04: MUI auth pages, useSession hooks, protected routes with middleware redirect
- ✓ SEC-01..04: TOTP 2FA, passkeys (WebAuthn), backup codes, security settings
- ✓ ORG-01..05: Org create/invite/roles/switch, WS reconnect, API permission enforcement
- ✓ ADM-01..04: User list/search, ban/unban, impersonation, session revocation
- ✓ CLN-01..05: Audit trail hooks, GDPR org coverage, legacy auth deletion, test rewrite
- ✓ SAF-01..10: SQL injection fixes, rate limiting, JWT removal, Swagger lockdown, secrets rotation

**v4.1 - Security Hardening & Debt Reduction (shipped 2026-03-06):**
- ✓ TSEC-01..07: Prisma tenant-scoping (42 models), RolesGuard >50% controllers
- ✓ AUTH-01..05: JWT refresh rotation (15min access tokens), family-based theft detection
- ✓ APIS-01..04: 5 API contract tests, attachment streaming fix
- ✓ QUAL-01..14: Backend 5 god-files + frontend 7 god-files decomposed, all <400 lines
- ✓ DEBT-01..10: forwardRef 24->2, zero madge circular dependencies
- ✓ OBS-01..04: Prometheus /metrics with HTTP histograms, BullMQ depth, AI cost counters
- ✓ INFRA-01..03: WebSocket Redis adapter, tenant-scoped pub/sub
- ✓ CLN-01..06: CSRF fix, dead code removal, CBC->GCM migration, bundle budget
- ✓ P48-01..14: Argon2id, ES256 JWT, HIBP password policy, enumeration hardening, session concurrency, idle timeout, __Host- cookies

**v4.0 - Enterprise Stabilization (shipped 2026-03-04):**
- ✓ ARCH-01/02/03: Circular deps 17+ to 5, domain events wired, dependency-cruiser CI enforcement
- ✓ API-01/02/03/04/05: Response envelopes, unified errors, api/v1 prefix, correlation IDs, OpenAPI linting
- ✓ SEC-01/02/03: httpOnly cookie auth, HMAC blind indexes, AES-GCM standardization
- ✓ AIOBS-01/02/03/04: AiRunLedger telemetry, cost endpoints, permission taxonomy
- ✓ PERF-01/02/03/04: LCP/TTI targets, v3.1 bug closure, Phase 28 gaps, silent fallback elimination

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

**v7.0 - System Audit & Hardening (shipped 2026-03-23):**
- ✓ BAPI-01..25: All 25 backend API endpoints verified (auth, email, calendar, contacts, AI, admin, infra)
- ✓ FE-01..20: All 20 frontend pages verified (auth, email, calendar, contacts, AI chat, admin, settings, dashboard, analytics, landing)
- ✓ CLN-01..08: Dead code removed (VoltAgent shims, orphaned renderers, unused deps, console.log, stale assertions)
- ✓ UIPOL-01..07: UI polished (empty states, skeletons, error alerts, mobile, dark mode, keyboard nav, i18n)
- ✓ SEC-01..05: Security verified (auth guards, tenant isolation, CSRF, rate limiting, RBAC)
- ⚠️ UIPOL-08..11: Deferred to v8.0+ (Phase 97 OBSOLETE — chat uses AI SDK, not custom CSS)

**v8.0 - Progressive Web App (shipped 2026-03-24):**
- ✓ FOUND-01..04: Installable PWA with SW, manifest, icons, API bypass, Vercel cache headers — v8.0
- ✓ OFFL-01..04: Offline fallback page, connectivity banner, offline email reading (IndexedDB), app shell cache — v8.0
- ✓ INST-01..03: Cross-platform install prompts (beforeinstallprompt, iOS instructions, standalone detection) — v8.0
- ✓ PUSH-01..04: VAPID subscription UI, SW push/notificationclick handlers, browser support gating — v8.0
- ✓ SYNC-01..04: Offline mutation queue, auto-replay on reconnect, 30-min TTL, logout cleanup — v8.0
- ✓ PLSH-01..02: SW update snackbar, Lighthouse PWA audit — v8.0

### Active

<!-- v9.0 requirements — see REQUIREMENTS.md for full list -->
- [ ] Push notification backend dispatch (event triggers, web-push delivery, per-user preferences)
- [x] Tiered write-rate limiting (endpoint-specific limits replacing flat 30/min) — Validated in Phase 106: Tiered Rate Limiting
- [ ] Explicit HITL approval routing (destructive tool gates, approval UX)
- [ ] Graph RAG pipeline (query router, reranking, graph expansion, context assembly, entity graph, memory anchoring, tool consolidation, few-shot examples)

### Out of Scope

- Mobile app (web-first, PWA provides native-like experience)
- Full offline-first architecture with conflict resolution (beyond current IndexedDB cache + action queue)
- End-to-end encryption (separate security audit)
- Custom email provider (focus on Gmail, Outlook, IMAP)
- Mastra framework (NestJS incompatible -- explicitly no NestJS support)
- Subject field encryption (substring search incompatible with deterministic hashing -- v4.0 ADR)
- Database RLS (Prisma 7 + PostgreSQL RLS interaction problematic; TenantGuard sufficient)
- Full ABAC policy engine (needs CRM object model first; v4.1+ scope)

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

**Brownfield project:** Existing, working codebase with real users. All changes maintain backward compatibility.

**v4.1 Results:**
- 65/66 requirements satisfied (security, code quality, observability, infrastructure)
- 188 commits, 660 files changed, +46.5K/-53K lines (major refactor)
- Circular dependencies: zero (madge --circular clean)
- forwardRef: 24 -> 2 call sites
- All god-files decomposed below 400 lines (backend + frontend)
- Auth: Argon2id, ES256 JWT, session concurrency, idle timeout, __Host- cookies
- Prometheus /metrics with HTTP histograms, BullMQ depth, AI cost counters
- WebSocket Redis adapter for horizontal scaling

**Remaining tech debt:**
- api.generated.ts placeholder (resolves with CI against live DB)
- TEST-05: 50MB attachment memory profiling (manual verification)

**Codebase:** ~33.6K LOC TypeScript across backend + frontend
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

| v4.0 milestone scoped from Enterprise Platform PRD | PRD audit scored 58/100 enterprise readiness; Phase 1 (stabilization) is prerequisite for all enterprise features | ✓ Good |
| v3.2 closed partial (20/25 plans) | Core AI rebuild complete; carry-forward items (perf, modules, debt) fit naturally into enterprise stabilization | ✓ Good |
| ToolRegistryModule for AI tool discovery | Decouples AiChatModule from domain modules; tools self-register via OnModuleInit | ✓ Good |
| Domain events via EventEmitter2 | Replaces 12+ direct cross-module imports with typed async events | ✓ Good |
| ResponseEnvelopeInterceptor + ApiExceptionFilter | 3 filters consolidated to 1; uniform response/error shape across all endpoints | ✓ Good |
| httpOnly cookie auth (sameSite=lax) | Eliminates localStorage XSS vector; lax preserves OAuth callback flows | ✓ Good |
| AES-GCM with CBC fallback decryption | No data migration needed; transparent upgrade on read | ✓ Good |
| HMAC blind index on `from` only (not `subject`) | Substring search incompatible with deterministic hashing; exact-match sufficient for sender lookup | ✓ Good |
| AiRunLedger fire-and-forget telemetry | Never affects user response latency; per-retry entries for accurate cost tracking | ✓ Good |
| 5 forwardRef accepted in Email core cluster | True bidirectional dependency; forced extraction would split natural cohesion | ✓ Good |
| forwardRef burn-down: 18→2 actual call sites | Symbol tokens for AI embedding, @Global TransactionalEmailModule, domain events for cross-module decoupling | ✓ Good |
| TransactionalEmailModule as @Global | Breaks auth→email forwardRef; nodemailer is infrastructure, not domain | ✓ Good |
| Domain events for embedding triggers | EmailIndexedEvent replaces direct AiModule import from email-sync | ✓ Good |
| Argon2id with transparent bcrypt migration | OWASP 2025 recommended; dual-algo verify on login rehashes automatically | ✓ Good |
| ES256 asymmetric JWT with dual-algo grace | P-256 ECDSA; HS256 accepted during migration; key rotation script provided | ✓ Good |
| @Global() StorageModule | Breaks EmailModule<->EmailSyncModule forwardRef cycle; storage is infrastructure | ✓ Good |
| @Global() MetricsModule with @Optional() inject | Test-safe Prometheus injection without per-module imports | ✓ Good |
| Facade pattern for god-file splits | Keep same class name, zero consumer changes, sub-services via DI | ✓ Good |
| Zustand domain slices for email-ui-store | (set, get) => state+actions; clean separation without store fragmentation | ✓ Good |
| Type extraction for circular dependency breaks | Shared interface to types/ dir with re-export from original; zero runtime impact | ✓ Good |

| Global BetterAuthGuard + @Public() opt-out | All routes authenticated by default; opt-out is explicit and auditable | ✓ Good |
| TenantGuard/RolesGuard zero-change compat | BetterAuthGuard maps session to identical request.user shape | ✓ Good |
| Untyped createAuthClient (no generic) | Type inference fails across client/server boundary; manual SessionUser interface | ✓ Good |
| 401 interceptor simplified to signOut+redirect | No JWT refresh queue needed; better-auth manages sessions via cookies | ✓ Good |
| WS auth via Phase 52 (no new code for Phase 54) | Handshake already uses auth.api.getSession with cookie validation | ✓ Good |

| Frontend session validation via HTTP fetch | Frontend API routes validate sessions via backend HTTP call, not local auth instance | ✓ Good |
| cookieCache compact with 300s maxAge | Reduces DB session lookups; 5-min cache with compact strategy | ✓ Good |
| v7.0: Verify before build | Test every endpoint before adding features; testing phases (89-94) before cleanup (95) to identify real dead code | ✓ Good |
| v7.0: Gmail label membership for folder queries | Folder/list parity follows label membership, not only email.folder, for Google providers | ✓ Good |
| v7.0: Two-step RSVP via source email lookup | Avoids duplicating ICS generation in calendar module | ✓ Good |
| v7.0: Security scripts with Swagger enumeration | Auth guard script dynamically enumerates routes from Swagger JSON | ✓ Good |
| v7.0: Phase 97 OBSOLETE | Chat UI rebuilt with AI SDK components; custom CSS migration unnecessary | ✓ Good |
| v7.0: Write-tier rate limit 30/min | Identified as cause of user-reported 429s; documented for future tuning | ⚠️ Revisit |
| v8.0: Serwist over next-pwa | Active maintenance, Workbox 7 compatible, Pages Router support | ✓ Good |
| v8.0: TQ persist to IndexedDB (not SW API caching) | httpOnly cookies make SW fetch interception a credential hazard | ✓ Good |
| v8.0: Online event primary, BackgroundSync enhancement | Safari has zero BackgroundSync support; online event is universal | ✓ Good |
| v8.0: Controlled SW updates via SKIP_WAITING message | User controls reload timing; no surprise page refreshes | ✓ Good |
| v8.0: Separate IndexedDB stores per concern | pmsync-query-cache vs pmsync-action-queue prevent cross-contamination | ✓ Good |
| v8.0: Frontend-only push scope | Backend push dispatch deferred to v9+; web-push package unused | ✓ Good |

---
*Last updated: 2026-03-24 after Phase 107 complete*
