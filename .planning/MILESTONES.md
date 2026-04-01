# Project Milestones: PMSync

## v11.0 Legacy Cleanup, Scalability & Billing Hardening (Shipped: 2026-04-01)

**Phases completed:** 10 phases, 18 plans, 38 tasks

**Key accomplishments:**

- Replaced all 47 @ApiBearerAuth decorators with @ApiCookieAuth across 39 controllers, switched Swagger to cookie auth, deleted dead ES256 key gen script
- All 8 @Cron decorators across 4 service files replaced with BullMQ registerHandler calls for single-instance execution on Railway horizontal scaling
- WebSocket-only Socket.IO transport and explicit pg.Pool config via env vars for Railway multi-replica deployment
- FullCalendar code-split via next/dynamic with ssr:false and Skeleton fallback, removing ~150KB gzip from initial bundle
- Cache-Control headers on 4 read-heavy GET endpoints: labels (60s), folders (30s), pricing public (300s), pricing authenticated (120s)
- Replaced 7 sub-4px spacing tokens (0.5 and 0.25) with valid 4px-multiple values across 4 billing components
- Svix-verified webhook receiver at POST /webhooks/autumn with Redis-based idempotent event routing for plan changes, payment failures, and usage alerts
- cancelAt period-end enforcement in daily lifecycle check + real SendGrid email delivery for billing alerts
- E2E billing validation script exercising 10 test cases (subscription state, entitlement gating, usage tracking, billing portal, attach/cancel flows, webhook rejection, cost protection, pricing table) against Railway/Vercel production
- Documented WORKER_REPLICA_COUNT, AUTUMN_WEBHOOK_SECRET, AUTUMN_PLAN_MAPPING in .env.example and removed dead cancelViaAutumn export

---

## v10.0 Email & Sync Production Validation (Shipped: 2026-03-30)

**Phases completed:** 13 phases, 27 plans, 48 tasks

**Key accomplishments:**

- Gmail validation: 40/40 checks passed
- All three providers validated against production: 110/110 checks passed.
- Incremental sync validation scripts for Gmail (historyId), Outlook (deltaLink map), and IMAP (modseq tokens) — all 19 checks passing against Railway production
- Gmail Pub/Sub + Microsoft Graph webhooks both validated (active subscriptions, sync pipeline wired) — 13/13 quick, 17/18 full (1 transient ECONNRESET)
- Fixed SYNC-13 label sync-back bug via Folder.externalId resolution, added addLabel/removeLabel to Gmail sync paths, and created validation scripts for mark-read/star/move-to-folder roundtrips
- SYNC-12 delete and SYNC-13 label validation added to sync-back script; 26/26 checks pass across IMAP, Outlook, and Gmail on Railway/Vercel production
- Ran email read validation against live Gmail provider, fixed envelope parsing bug, all 5 READ requirements pass
- 35/35 checks passed across Gmail (22) and Outlook (13) — attachment download, on-demand S3 fetch, folder stats, and full-text search all validated against production
- Fixed forward-attachments bug (WRITE-05) by adding StorageService.getObject and wiring original attachment fetch into forwardEmail, plus validation scripts for all 5 WRITE requirements
- Ran validation scripts against Gmail and Outlook, fixed 3 bugs, verified delivery via CDP browser inspection
- Fixed deleteDraft orphan bug (provider-side delete via driver.deleteMessage) and created validation scripts for draft CRUD + all 4 bulk operations
- All 40 validation checks passed (Gmail 18/18, Outlook 16/16, IMAP 6/6 blocked-as-expected) for draft CRUD and bulk operations against live Railway production
- 24/25 folder CRUD checks passing across Gmail (8/8), Outlook (8/8), IMAP (6/7) with system folder protection verified -- only IMAP delete blocked by Libero infrastructure
- All 48 queue and webhook infrastructure checks PASS against live Railway deployment after fixing response envelope unwrapping bug
- 31/31 validation checks pass on Railway — scheduling, signatures, and templates confirmed end-to-end via CDP + automated suite
- Validation scripts for tenant isolation (5 checks), rate tier audit (4 checks), and response envelope (5 checks), plus email-sync destructive-write rate tier fix
- 39/39 validation checks PASS on Railway production for INFRA-06..10, 121-VERIFICATION.md created with per-requirement evidence, human approved
- Aligned REQUIREMENTS.md and ROADMAP.md with actual v10.0 completion state — 10 checkboxes fixed, coverage count corrected 41→50, FOLD-03 IMAP qualifier added, 10 traceability rows updated to Satisfied.

---

## v9.0 AI Intelligence & Platform Hardening (Shipped: 2026-03-25)

**Delivered:** AI intelligence upgrade with graph-aware RAG, full push notification delivery, tiered rate limiting, and explicit HITL approval routing with per-user sensitivity control.

**Phases completed:** 106-111 (6 phases, 14 plans, 31 tasks)

**Key accomplishments:**

- 4-tier rate limiting (@RateTier decorator + tier-aware guard) replacing flat 30/min limit — read 300/min, safe-write 100/min, destructive-write 30/min, send 10/min
- Complete push dispatch pipeline: email.indexed -> BullMQ -> web-push multi-device fan-out, thread grouping via Redis INCR/EXPIRE, stale subscription cleanup on 410/404, per-category preference toggles (email/calendar/AI)
- HITL approval routing: dynamic needsApproval closures per user sensitivity (HIGH_ONLY/ALL_MUTATIONS/NONE), approval card terminal states, GDPR audit trail via logHitlDecision
- Graph RAG pipeline: entity extraction, GraphNode/GraphEdge models, recursive CTE traversal, token-budgeted context assembly (60% graph / 20% memory / 20% few-shot), dynamic few-shot injection
- Entity-anchored memory retrieval wired into live AI chat pipeline (GRAG-04 gap closure)
- All 19 RED test stubs replaced with real assertions across 4 push notification spec files

**Stats:**

- 93 commits, 476 files changed
- +62,798 / -9,491 lines
- 2 days (2026-03-24 → 2026-03-25)
- Requirements: 20/20 satisfied

**Git tag:** `v9.0`

**Known Tech Debt (accepted):**

- Token counting uses Math.ceil(text.length / 4) approximation instead of BPE tokenizer
- @Optional() guards on EntityGraphService/ContextAssemblyService in ai-chat.service.ts
- Phase 107 VAPID_PRIVATE_KEY needed in Railway env for production push delivery
- Audit_logs DB query (SELECT HITL:* events) runtime data check pending

---

## v8.0 Progressive Web App (Shipped: 2026-03-24)

**Delivered:** Full PWA transformation — installable on all platforms with offline email reading via IndexedDB persistence, background sync for queued actions, push notification frontend plumbing, and native-like install experience with platform-specific UX.

**Phases completed:** 100-105 (6 phases, 11 plans)

**Key accomplishments:**

- Serwist service worker with precaching, NetworkOnly /api/ bypass (preserves httpOnly cookie auth), Vercel no-cache headers, and controlled SW updates via SKIP_WAITING message pattern
- Branded offline fallback page with dark/light mode, online/offline connectivity banner with collapse animation, app shell loads from SW cache
- Cross-platform install: beforeinstallprompt for Android/desktop with 30-day dismiss persistence, iOS share instructions with ua-parser-js detection, standalone mode suppression
- Offline email reading: TanStack Query persist to IndexedDB with selective 24h gcTime for email queries, 5-site logout cleanup (IndexedDB + SW caches + push sub + TQ cache + action queue)
- Background sync: Zustand-backed offline mutation queue in IndexedDB, auto-replay on reconnect via online event, BackgroundSync as Chromium-only enhancement, 30-min TTL discard with notification
- Push plumbing: VAPID subscription UI in settings (gated behind browser support), SW push/notificationclick handlers, backend PushSubscription model with multi-tenant upsert

**Stats:**

- 6 phases, 11 plans
- ~121 commits, 254 files changed
- +18,422 / -1,005 lines
- 2 days (2026-03-23 → 2026-03-24)
- Requirements: 21/21 satisfied
- Average plan execution: ~5 min

**Git tag:** `v8.0`

**Known Tech Debt (accepted):**

- Nyquist validation incomplete on all 6 phases (VALIDATION.md drafts, wave_0 not finished)
- `web-push` package installed in backend but unused (dispatch deferred to v9+)
- `NEXT_PUBLIC_VAPID_KEY` not validated at build time (silent subscription failure if unset)
- Pre-existing TypeScript error in locales (consentRequired key missing type)

---

## v7.0 System Audit & Hardening (Shipped: 2026-03-23)

**Delivered:** Full-system verification and hardening — verified all 350+ API endpoints across 16 backend modules, fixed 20+ Gmail parity bugs (folder counts, draft sync, reply recipients, DnD, pagination), removed dead code (VoltAgent shims, orphaned renderers, unused deps), polished all 12 pages with EmptyState/QueryErrorAlert/skeletons, verified security controls (auth guards, tenant isolation, CSRF, rate limiting, RBAC), and deployed hybrid email search.

**Phases completed:** 89-99 (10 active + 1 obsolete, 35 plans)

**Key accomplishments:**

- Verified all auth flows, email operations, calendar/contacts/reminders, AI chat, admin/settings, and infrastructure pages end-to-end with Playwright and live Railway/Vercel validation
- Fixed 20+ Gmail parity bugs: Inbox aggregation, folder/label counts, draft sync through provider, reply recipient resolution, DnD isolation, pagination double-fetch, folder reparenting
- Removed dead code: VoltAgent shims (voltAgentApi, multiAgentApi), PendingAction types, orphaned renderers (bulk_email_actions, TriageToolUI), unused dependencies, console.log statements
- Polished all 12 pages: EmptyState with illustrations, QueryErrorAlert with retry, loading skeletons, mobile responsiveness (375px+), dark mode audit (zero violations), complete Italian translation
- Security verification scripts: auth guard enumeration via Swagger, tenant isolation, CSRF, rate limiting (write-tier 30/min identified), RBAC enforcement including super-admin bypass
- Deployed hybrid_email_search SQL function to Railway, split OrgAdminPage under 500-line limit, closed all milestone audit tech debt gaps

**Stats:**

- 10 phases (+ 1 obsolete), 35 plans
- 268 commits, 505 files changed
- +50,785 / -32,097 lines
- 4 days (2026-03-20 → 2026-03-23)
- Requirements: 65/65 satisfied (4 UIPOL-08..11 deferred to v8.0+ as Phase 97 OBSOLETE)

**Git tag:** `v7.0`

**Known Tech Debt (accepted):**

- INT-01: HITL approval routing is implicit (destructive tools surface via FallbackToolRenderer, not explicit check)
- P96: follow-ups.tsx returns null during auth check instead of skeleton; Tasks.tsx/RemindersBoard.tsx pass error={null} to QueryErrorAlert
- P95: TriageToolUI.tsx orphaned file on disk
- P92/94/98: Verification scripts compiled but not all live-executed (Railway availability gaps)
- P89: Onboarding MFA mandatory behavior needs product owner confirmation

---

## v4.1 Security Hardening & Debt Reduction (Shipped: 2026-03-06)

**Delivered:** Security hardening and structural debt reduction -- tenant isolation with Prisma scoping, auth upgraded to 2026 best practices (Argon2id, ES256 JWT, session concurrency), all god-files decomposed below 400 lines, zero circular dependencies achieved, Prometheus observability added, WebSocket horizontal scaling enabled.

**Phases completed:** 42-49 (8 phases, 28 plans)

**Key accomplishments:**

- Prisma tenant-scoping on 42 models in enforce mode, RolesGuard on 15/33 controllers (>50%), JWT refresh token rotation with 15min access tokens and family-based theft detection
- 5 backend god-files (1000+ lines each) split into 22 focused sub-services; 7 frontend god-files split into 30+ components; all resulting files under 400 lines
- Auth upgraded to 2026 best practices: Argon2id with transparent bcrypt migration, ES256 asymmetric JWT, NIST password policy with HIBP breach check, enumeration hardening, session concurrency, idle timeout, __Host- cookie prefix
- All 14 madge --circular chains eliminated via type extraction, interface tokens, and @Global() module patterns; forwardRef reduced from 24 to 2 call sites
- Prometheus /metrics endpoint with HTTP latency histograms, BullMQ queue depth gauges, AI cost/token counters
- WebSocket Redis adapter for horizontal scaling, CSRF error surfacing with auto-retry, CBC-to-GCM re-encryption, dead code/dependency cleanup with CI bundle budget

**Stats:**

- 8 phases, 28 plans
- 188 commits, 660 files changed
- +46,490 / -52,992 lines (major refactor)
- 3 days (2026-03-04 -> 2026-03-06)
- Requirements: 65/66 satisfied (TEST-05 manual verification only)

**Git tag:** `v4.1`

**Known Gaps:**

- TEST-05: 50MB attachment memory profiling is manual verification (automated test verifies streaming mechanism)

---

## v4.0 Enterprise Stabilization (Shipped: 2026-03-04)

**Delivered:** Enterprise-grade stabilization -- broke circular dependencies (17+ to 5), standardized all API contracts with response envelopes and correlation IDs, migrated auth to httpOnly cookies, added AI cost observability, enabled encrypted sender search via HMAC blind indexes, and closed all performance debt.

**Phases completed:** 31-41 (11 phases, 22 plans)

**Key accomplishments:**

- Circular dependencies reduced from 17+ forwardRef to 5 (Email core cluster only), ToolRegistryModule for decoupled AI tool discovery, domain events wired, dependency-cruiser CI enforcement
- Global ResponseEnvelopeInterceptor + ApiExceptionFilter + setGlobalPrefix('api/v1') + CorrelationInterceptor with BullMQ propagation
- httpOnly cookie auth migration (localStorage JWT eliminated), WebSocket cookie extraction, AES-GCM encryption standardization
- AiRunLedger telemetry across all 6 AI call paths, cost reporting endpoints, permission taxonomy (21 entries) for v4.1 RBAC
- HMAC-SHA256 blind indexes on `from` field with per-tenant HKDF key derivation, dual-path HashSearchService
- Dynamic imports for email page dialogs, 7 deferred v3.1 bugs resolved, Lighthouse CI budget gates enforced
- Gap closure: attachment proxy /api/v1 fix, email.tsx split (1035 -> 360 lines), CI regression reverts, dead scaffolding removal

**Stats:**

- 11 phases, 22 plans
- 100 commits, 359 files changed
- +24,804 / -3,287 lines
- 2 days (2026-03-03 -> 2026-03-04)
- Requirements: 19/19 satisfied

**Git tag:** `v4.0`

**Known Tech Debt (accepted):**

- 5 forwardRef in Email/EmailSync core cluster (true bidirectional dependency)
- `api.generated.ts` placeholder (resolves when CI runs against live DB)
- `IPolicyService`/`Permission` enum zero consumers (v4.1 RBAC scaffolding)

---

## v3.2 AI Rebuild & Cleanup (Shipped: 2026-03-03, partial)

**Delivered:** Complete AI layer rebuild — dropped VoltAgent framework (167 files, 33K LOC), rewrote AI backend on raw AI SDK v6, rebuilt chat frontend with assistant-ui, added comprehensive E2E testing. Phases 29-30 (module boundaries, performance, encrypted search) carried forward to v4.0.

**Phases completed:** 23-28 (20 plans total)

**Key accomplishments:**

- Dropped `@voltagent/core` entirely, consolidated all LLM calls to `@ai-sdk/mistral`
- New AiChatService with streamText, conversation persistence via Prisma, HITL approval
- ~20 tools as @Injectable ToolsService classes with intent-based routing
- Non-chat AI (briefing, follow-ups, drafts) via generateText + Output.object()
- Hybrid RAG preserved (vector + keyword with RRF fusion)
- assistant-ui chat frontend with tool renderers, HITL inline, mobile layout
- 167 VoltAgent files deleted (33K LOC removed)
- Playwright E2E for chat frontend

**Stats:**

- 6 phases, 20 plans
- 227min total execution time, 11min average per plan
- 25/33 requirements satisfied (8 carried forward to v4.0)

**Git tag:** —

**Notes:** Phases 29-30 (architecture hardening, performance & debt) carried forward to v4.0 Enterprise Stabilization as ARCH-01/02/03 and PERF-01/02. Phase 28 gap closure (chat 403, dead polling, E2E mobile) also carried forward.

---

## v3.1 GDPR Compliance & Chatbot Enhancement (Shipped: 2026-02-27)

**Delivered:** Full GDPR data privacy compliance (PII tokenization, database encryption at rest, consent management, audit logging, data rights, legal acceptance) plus enhanced AI chatbot with rich artifacts, AI triage, and writing-style-aware draft generation.

**Phases completed:** 13-22 (34 plans total)

**Key accomplishments:**

- PII tokenization for all AI calls (detect, tokenize, restore pipeline)
- AES-256-GCM database encryption at rest with per-tenant HKDF key derivation
- GDPR consent management (granular per-feature toggles, versioned audit trail)
- Audit logging for all data access + AI tool executions (3-year retention)
- Data export (GDPR Art. 20) and right to erasure (Art. 17) with 30-day grace period
- Terms of Service + Privacy Policy acceptance flow with version-pinned guards
- 6 rich interactive artifact renderers (email, calendar, contacts, follow-ups, briefing, CRM)
- AI triage: nested label assignment, bulk operations (batch labels + follow-ups)
- AI draft generation with per-provider writing style learning
- Comprehensive bug audit (47 bugs: 30 fixed, 7 deferred, 7 documented, 3 accepted risk)

**Stats:**

- 10 phases, 34 plans
- 31/32 requirements satisfied (ENC-03 deferred to v3.2)
- ~17 days from start to ship (2026-02-09 → 2026-02-27)

**Git tag:** `v3.1`

**Notes:** ENC-03 (hash-based search indexes on encrypted fields) deferred — requires search infrastructure redesign across 17+ query sites. Addressed in v3.2+.

---

## v3.0 AI Intelligence & Scalability (Shipped: 2026-02-09)

**Delivered:** Complete AI infrastructure overhaul with streaming chat, auto-triage priority scoring, smart follow-ups, and visual polish.

**Phases completed:** 01-12 (42 plans total)

**Key accomplishments:**

- Modern AI chat experience (954-line monolith split into 6 files, Vercel AI SDK streaming)
- Auto-triage priority scoring (VIP-aware, implicit learning, nightly recalculation)
- Smart tool renderers (10 custom React components replacing raw JSON)
- Nested labels tree view with drag-drop and context menu
- AI module cleanup (1,618 lines dead code removed, TTL pools, RAG timeout)
- WCAG accessibility and visual polish (Lucide icons, theme parity, micro-interactions)

**Stats:**

- 12 phases, 42 plans
- 206 commits, 326 files changed
- +47,644 / -13,903 lines (net +33,741)
- 4 days from start to ship (2026-02-05 → 2026-02-09)

**Git tag:** `v3.0`

**Notes:** 19/19 requirements satisfied. 10 tech debt items deferred (non-blocking documentation and human verification).

---

## v2.1 Optimization & Polish (Shipped: 2026-02-05)

**Delivered:** Performance infrastructure (code splitting + Lighthouse CI), iOS safe area support, and folder nesting API.

**Phases completed:** 01-03 (5 plans total)

**Key accomplishments:**

- React.lazy code splitting for TipTap (~40 packages) and @dnd-kit
- Lighthouse CI integrated into GitHub Actions with performance budgets (LCP 2.5s, TTI 3.5s, CLS 0.1)
- iOS viewport-fit=cover with centralized safeArea theme tokens
- Landscape mode support on all mobile components
- PATCH /api/folders/:id { parentId } endpoint with circular reference protection
- 12 unit tests for folder move operations

**Stats:**

- 3 phases, 5 plans
- 1 day from start to ship (2026-02-04 → 2026-02-05)

**Git tag:** `v2.1`

**Notes:** LCP/TTI targets monitored but not yet met. E2E test structure complete but blocked by pre-existing auth mock issue.

---

## v2.0 Professional Email Client (Shipped: 2026-02-04)

**Delivered:** Best-in-class AI email client with enterprise polish and modern speed.

**Phases completed:** 1-8 (21 plans total)

**Key accomplishments:**

- 24/24 requirements satisfied (FE: 10, PERF: 6, SEC: 5, DEBT: 3)
- VList virtualization for 1000+ emails with 60fps scroll
- TipTap rich composer with AI integration (Cmd+J shortcut)
- Kanban toggle view with DnD columns
- Keyboard navigation (Superhuman-style j/k/e/#/r/f//)
- Multi-select with Shift+click range selection
- Search with filter parsing (from:, to:, has:attachment)
- Dark mode with system preference detection
- pgvector HNSW index (<50ms similarity search)
- S3 AES256 encryption + OAuth revocation + CSRF protection
- 200 E2E tests across 5 browsers (Chromium, Firefox, WebKit, mobile)
- 92/100 integration score

**Stats:**

- 8 phases, 21 plans
- 2 days from start to ship (2026-02-02 → 2026-02-04)

**Git tag:** `v2.0`

---

## v1 Stability & Code Quality Refactor (Shipped: 2026-02-02)

**Delivered:** Comprehensive refactoring of email sync and AI modules - 77% reduction in large service file sizes with zero regressions and full production stress testing.

**Phases completed:** 1-8 (40 plans total)

**Key accomplishments:**

- 77% reduction in large service file sizes (11,129 → 2,512 lines across 7 critical services)
- Race condition protection with Redis locks + 4-minute alerting for folder operations
- Vertical slice architecture for IMAP, Gmail, Microsoft drivers split into focused modules
- 500+ tests passing (329 existing + 170+ new, zero regressions)
- Production stress tests passing (10-tenant isolation, 20-worker lock contention, P2034 recovery)
- LLM circuit breaker with 60s timeout and graceful fallback

**Stats:**

- 84 commits (feat/docs/test)
- ~5h 30min total execution time
- 8 phases, 40 plans, ~8 min average per plan
- 3 days from start to ship (2026-01-31 → 2026-02-02)

**Git tag:** `v1`

---

*Milestones log updated: 2026-03-24*
