# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v4.0 -- Enterprise Stabilization

**Shipped:** 2026-03-04
**Phases:** 11 | **Plans:** 22

### What Was Built
- Architecture decoupled: 17+ forwardRef to 5, ToolRegistryModule, domain events, dependency-cruiser CI
- API contracts standardized: response envelopes, unified error filter, correlation IDs, OpenAPI linting
- Auth hardened: httpOnly cookies, AES-GCM encryption, WebSocket cookie auth
- AI observability: AiRunLedger across all call paths, cost reporting endpoints, permission taxonomy
- Encrypted search: HMAC blind indexes on `from` field with per-tenant HKDF
- Performance debt closed: dynamic imports, 7 v3.1 bugs resolved, Lighthouse CI gates

### What Worked
- Sequential dependency chain (31->32->33->34) with parallel workstreams (35/36/37) maximized throughput
- Milestone audit caught real integration gaps (attachment proxy, CI regressions) before shipping
- Gap closure phases (38-41) were surgical and fast (1-9 min each)
- Fire-and-forget pattern for AiRunLedger kept zero latency impact

### What Was Inefficient
- Commit 4a911f38 silently reverted 3 Phase 39 fixes, requiring Phase 40 to re-fix -- need better commit hygiene on large PRD docs
- Phase 39 plan count shows 0/1 in roadmap despite being complete (SUMMARY.md exists but roadmap checkbox not ticked)
- Migration drift (direct SQL for AiRunLedger) created tech debt that Phase 41 had to address
- Re-audit was needed because first audit missed the 4a911f38 regressions

### Patterns Established
- ToolRegistryModule + OnModuleInit self-registration as standard for cross-module service discovery
- ResponseEnvelopeInterceptor + @SkipEnvelope for streaming endpoints
- httpOnly cookie + withCredentials as the only auth pattern (no more localStorage)
- HMAC blind index pattern for encrypted field search (per-tenant HKDF key derivation)
- Milestone audit -> gap closure phases -> re-audit cycle as quality gate

### Key Lessons
1. Large documentation commits can silently revert code changes -- always diff carefully before pushing
2. Gap closure phases are cheap (1-9 min) and high-value -- don't skip the audit step
3. Sequential dependency chains should be validated at each boundary (not just at the end)
4. Direct SQL migrations create drift -- prefer `prisma migrate dev` even when shadow DB is problematic

### Cost Observations
- Model mix: predominantly opus for planning, haiku for research/exploration
- 22 plans completed in ~2 days (estimated 180min total execution)
- Average plan execution: ~8min (faster than v3.2's 11min average)
- Gap closure phases (38-41) averaged 3min each

---

## Milestone: v4.1 -- Security Hardening & Debt Reduction

**Shipped:** 2026-03-06
**Phases:** 8 | **Plans:** 28

### What Was Built
- Tenant isolation: Prisma scoping on 42 models, RolesGuard on 15/33 controllers, JWT refresh rotation (15min)
- God-file decomposition: 5 backend + 7 frontend files split into 50+ focused modules, all under 400 lines
- Auth 2026 upgrade: Argon2id, ES256 JWT, HIBP password policy, enumeration hardening, session concurrency, idle timeout, __Host- cookies
- Zero circular deps: all 14 madge chains eliminated, forwardRef 24->2 call sites
- Prometheus observability: /metrics with HTTP histograms, BullMQ depth, AI cost counters
- Infrastructure: WebSocket Redis adapter, CSRF error surfacing, CBC->GCM migration, bundle budget

### What Worked
- Parallel wave execution: independent phases (44/45, 46/47/48/49) ran in overlapping waves for maximum throughput
- Facade pattern for god-file splits: zero consumer changes, characterization tests before/after
- Type extraction pattern for circular dependency breaks: minimal code change, maximum structural improvement
- @Global() module pattern (Storage, Metrics, Transactional) cleanly broke infrastructure cycles
- Stale audit from mid-milestone didn't block completion -- all requirements verified via REQUIREMENTS.md traceability

### What Was Inefficient
- Audit was run at phase 43 completion (3/8 phases done) -- too early, produced stale gaps_found status
- STATE.md accumulated 4 YAML frontmatter blocks instead of being cleanly overwritten
- Some SUMMARY.md files lacked one_liner field, requiring manual extraction during milestone completion
- Phase ordering in ROADMAP.md (48 before 44-47) caused confusion -- should maintain numeric order

### Patterns Established
- Facade split pattern: keep class name, DI sub-services, zero consumer changes (backend + frontend)
- Zustand domain slices: (set, get) => state+actions for store decomposition without fragmentation
- @Global() for infrastructure modules (Storage, Metrics, Transactional) to avoid forwardRef
- Type extraction to types/ dir with re-export for backward compatibility
- @Optional() @InjectMetric for test-safe Prometheus injection
- Symbol token + useExisting for interface-based DI without duplicate instances

### Key Lessons
1. Run milestone audits at 80%+ completion, not mid-milestone -- stale audits add confusion
2. God-file splits are mechanical and fast (~6min avg) when using facade pattern with characterization tests
3. Circular dependency elimination is best done in 3 passes: type extraction -> interface tokens -> module restructuring
4. Auth hardening is high-impact work that benefits from dedicated phases (not mixed with other concerns)
5. Prometheus @Global() pattern avoids the per-module import explosion that plagues cross-cutting concerns

### Cost Observations
- Model mix: quality profile (opus) for all phases
- 28 plans completed in 3 days (~180min total execution)
- Average plan execution: ~6.5min (fastest milestone yet, down from v4.0's 8min)
- Phase 45/49 (structural refactoring) averaged 7min; Phase 46 (observability) averaged 4min

---

## Milestone: v7.0 -- System Audit & Hardening

**Shipped:** 2026-03-23
**Phases:** 10 (+ 1 obsolete) | **Plans:** 35

### What Was Built
- Full-system verification: all 350+ API endpoints across 16 backend modules tested with auth, tenant isolation, error handling
- Gmail parity fixes: 20+ bugs fixed (Inbox aggregation, folder/label counts, draft sync, reply recipients, DnD isolation, pagination)
- Dead code removal: VoltAgent shims, PendingAction types, orphaned renderers, unused deps, console.log statements, stale test assertions
- UI/UX polish: EmptyState with illustrations, QueryErrorAlert with retry, loading skeletons on all 12 pages, mobile 375px+, dark mode audit
- Security verification: auth guard enumeration via Swagger, tenant isolation, CSRF, rate limiting, RBAC including super-admin bypass
- Tech debt closure: hybrid_email_search SQL deployed, OrgAdminPage split, milestone audit gaps closed

### What Worked
- Phase ordering (verify → clean → polish → secure → close) was the right sequence — testing phases revealed what to clean
- Live Railway/Vercel validation caught real production bugs that code review alone would have missed (Phase 90 Gmail parity)
- Milestone audit at ~80% completion surfaced tech debt items without blocking shipment
- Phase 97 marked OBSOLETE early, saving wasted effort on CSS migration that AI SDK already solved
- Gap closure phase (99) was surgical — 2 plans, 6 minutes total, closed real audit gaps

### What Was Inefficient
- Railway unavailability during P92/P93 forced code-review-only verification — some endpoints never tested live
- Phase 90 was marked "complete" prematurely, then reopened after live Gmail audit exposed 20+ bugs — live validation should happen earlier
- SUMMARY.md files lack one_liner fields, making automated accomplishment extraction fail (same issue as v4.1)
- Security verification scripts (P98) compiled but some never live-executed — value without live execution is partial

### Patterns Established
- Swagger-based route enumeration for auth guard verification (dynamic, not hardcoded)
- EmptyState + QueryErrorAlert + Skeleton as the standard trio for every page
- Security verification as reusable scripts (not one-off curl commands) — can re-run in CI
- Milestone audit → gap closure phase → completion as the standard quality gate

### Key Lessons
1. Live validation is non-negotiable — code review catches structure bugs, live testing catches behavioral bugs (Phase 90 proved this hard)
2. Mark phases as "verified" only after live validation, not after code review alone
3. SUMMARY.md should always include a one_liner field — automate this in plan templates
4. Obsoleting phases early (Phase 97) is better than executing unnecessary work
5. Rate limit tuning needs real traffic analysis — write-tier 30/min is too aggressive for normal use

### Cost Observations
- Model mix: quality profile (opus) for all phases
- 35 plans completed in 4 days
- Average plan execution: ~7min (comparable to v4.0/v4.1)
- Gap closure (P99): 3min average — consistently the cheapest phase type

---

## Milestone: v8.0 -- Progressive Web App

**Shipped:** 2026-03-24
**Phases:** 6 | **Plans:** 11

### What Was Built
- PWA foundation: Serwist service worker with precaching, NetworkOnly /api/ bypass, Vercel no-cache headers
- Offline experience: branded offline fallback page, online/offline connectivity banner, app shell cache
- Cross-platform install: beforeinstallprompt hook with 30-day dismiss, iOS instructions with ua-parser-js, standalone detection
- Offline email reading: TanStack Query persist to IndexedDB with selective 24h gcTime, 5-site logout cleanup
- Background sync: Zustand offline mutation queue in IndexedDB, auto-replay on reconnect, 30-min TTL discard, BackgroundSync enhancement
- Push plumbing: VAPID subscription UI in settings, SW push/notificationclick handlers, backend PushSubscription model, SW update snackbar

### What Worked
- Phase dependency chain (100→101→102→103→104→105) was clean — each phase built on the previous without conflicts
- All phases executed in 2 days — fastest milestone by wall-clock time
- SW handler aggregation worked cleanly (precache + fallback + sync + push + SKIP_WAITING in one sw.ts) with no ordering conflicts
- Logout cleanup module centralized 5 different data cleanup sites (IndexedDB, SW caches, push sub, TQ cache, action queue)
- IndexedDB store isolation (separate databases per concern) prevented cross-contamination between query cache and action queue

### What Was Inefficient
- Nyquist validation was left incomplete on all 6 phases — should have been part of plan execution, not post-hoc
- SUMMARY.md files still lack one_liner fields (same issue since v4.1) — template not updated
- `web-push` package was installed in Phase 105 backend but never imported — should have been deferred to v9 entirely
- NEXT_PUBLIC_VAPID_KEY unvalidated at build time — should have been added to env validation during the phase

### Patterns Established
- useSyncExternalStore for all browser API subscriptions (online status, install prompt, push support)
- Separate IndexedDB stores per concern (pmsync-query-cache, pmsync-action-queue) — prevents cross-contamination
- SW postMessage relay pattern for actions requiring httpOnly cookie auth (sync handler → client → API)
- Controlled SW updates via SKIP_WAITING message (no auto-skipWaiting, user controls reload timing)
- Module-level replay lock for preventing double-replay from simultaneous online+sync events
- _resetForTesting() pattern for module-state hooks (avoids jest.isolateModules React duplication)

### Key Lessons
1. PWA is frontend-heavy work — 254 files changed but mostly in frontend/ with minimal backend surface
2. httpOnly cookie auth constrains SW capabilities — cannot make authenticated fetch() from SW, must relay via postMessage
3. iOS/Safari divergence is significant: no beforeinstallprompt, no BackgroundSync, push only in standalone mode — plan for separate code paths
4. Nyquist validation should be integrated into plan execution, not deferred as a separate step
5. 5-min average plan execution proves that well-scoped plans with clear tasks are consistently fast

### Cost Observations
- Model mix: quality profile (opus) for all phases
- 11 plans completed in 2 days (~55min total execution)
- Average plan execution: ~5min (fastest per-plan velocity across all milestones)
- Fastest milestone by wall-clock time (2 days)

---

## Milestone: v9.0 -- AI Intelligence & Platform Hardening

**Shipped:** 2026-03-25
**Phases:** 6 | **Plans:** 14

### What Was Built
- Tiered rate limiting: 4-tier ThrottlerModule (read 300/min, safe-write 100/min, destructive-write 30/min, send 10/min) with @RateTier decorator and tier-aware guard
- Push notification backend dispatch: email.indexed -> BullMQ -> web-push multi-device fan-out, thread grouping via Redis INCR/EXPIRE, stale subscription cleanup, per-category preference toggles
- HITL approval routing: dynamic needsApproval closures per user sensitivity (HIGH_ONLY/ALL_MUTATIONS/NONE), approval card terminal states, GDPR audit trail
- Graph RAG pipeline: entity extraction, GraphNode/GraphEdge models, recursive CTE traversal, token-budgeted context assembly (60/20/20 split), dynamic few-shot injection
- Entity-anchored memory retrieval wired into live AI chat pipeline (GRAG-04 gap closure)
- All 19 RED test stubs replaced with real assertions across 4 push notification spec files

### What Worked
- Milestone audit mid-stream identified GRAG-04 gap (getMemoriesByEntity orphaned) and test debt (19 RED stubs) -- spawned Phases 110-111 to close them
- Phase 109 (Graph RAG) decomposed well into 3 plans: schema, services, integration -- each independently testable
- Redis INCR/EXPIRE for thread grouping was simpler and more reliable than alternatives (no new dependencies)
- Wave 0 test stub pattern (107-00) ensured test debt was visible and tracked from day one
- 2-day milestone with 20/20 requirements -- fastest feature-rich milestone by time/requirement ratio

### What Was Inefficient
- Phase 109 plan tracking shows "1/3" complete in roadmap despite all 3 plans having SUMMARY.md -- checkbox drift persists
- SUMMARY.md files still lack one_liner fields (same issue since v4.1, 5th milestone in a row)
- Nyquist validation remains incomplete -- marked as "PARTIAL" in audit, never fully addressed
- @Optional() guards on EntityGraphService/ContextAssemblyService are backward-compat safety that may never be needed (both are registered)
- Token counting approximation (text.length / 4) shipped instead of using installed gpt-tokenizer -- technical debt acknowledged but not fixed

### Patterns Established
- @RateTier decorator + tier-aware guard for per-endpoint rate limit classification
- Redis INCR/EXPIRE atomic pattern for short-lived deduplication windows (push thread grouping)
- Dynamic needsApproval closures injected per-request from user preferences (no per-tool DB lookup)
- Recursive CTE with Prisma.sql for graph traversal (parameterized, injectable)
- Token budget split pattern: percentage-based allocation across context categories
- Entity-first dedup: FK-anchored results take priority over vector search results in merge
- Direct instantiation over TestingModule for simple unit tests without DI

### Key Lessons
1. Milestone audit -> gap closure phases continues to be the highest-value quality pattern (GRAG-04 gap would have shipped unwired without it)
2. Wave 0 test stub pattern works well for tracking test debt -- but stubs must be replaced in the same milestone (Phase 111 proved this)
3. Graph RAG is mostly a backend concern -- no frontend changes needed, just better system prompts and context assembly
4. Entity-anchored memory retrieval is fundamentally different from semantic search -- both paths needed independently
5. Per-user preference injection at request time (HITL sensitivity) is cleaner than per-tool configuration

### Cost Observations
- Model mix: quality profile (opus) for all phases
- 14 plans completed in 2 days (~93 commits)
- Average plan execution: ~7min (comparable to v7.0, slower than v8.0's 5min due to Graph RAG complexity)
- Gap closure phases (110, 111): Phase 110 was 1 plan/~5min, Phase 111 was 2 plans/~10min -- still the cheapest quality investment

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 8 | 40 | First structured milestone |
| v2.0 | 8 | 21 | Frontend-heavy, parallel execution |
| v2.1 | 3 | 5 | Small polish milestone |
| v3.0 | 12 | 42 | AI-heavy, largest scope |
| v3.1 | 10 | 34 | GDPR compliance, bug audit |
| v3.2 | 6 | 20 | Partial ship, carry-forward pattern |
| v4.0 | 11 | 22 | Audit-driven gap closure, enterprise prep |
| v4.1 | 8 | 28 | Security + debt, facade splits, zero circular deps |
| v5.0 | 15 | 34 | better-auth migration, org model |
| v5.1 | 11 | 30 | Test coverage, polish |
| v6.0 | 12 | - | Partial ship, enterprise features deferred |
| v7.0 | 10 | 35 | Full-system verification, audit-driven, live validation |
| v8.0 | 6 | 11 | PWA, fastest milestone (2 days, 5min/plan avg) |
| v9.0 | 6 | 14 | AI intelligence, audit-driven gap closure (Phases 110-111) |

### Top Lessons (Verified Across Milestones)

1. Milestone audits catch real gaps -- v3.0, v3.1, v4.0, v7.0, and v9.0 all benefited from audit-before-ship (run at 80%+ completion)
2. Carry-forward items are fine when scoped explicitly (v3.2->v4.0 worked cleanly)
3. Gap closure phases are the cheapest quality investment (avg 3-5min vs 7-11min for planned phases) -- confirmed in v9.0 P110/P111
4. Facade pattern for god-file splits is the safest refactoring approach -- zero consumer changes across v4.0 and v4.1
5. Plan execution velocity stabilizes around 5-7min for well-scoped plans (v8.0: 5min, v9.0: 7min)
6. Live validation is non-negotiable -- v7.0 Phase 90 proved that code review alone misses behavioral bugs (20+ Gmail parity bugs)
7. SUMMARY.md one_liner fields are still missing after 5 milestones -- fix the template, not the downstream extraction
8. Wave 0 test stub pattern works but stubs MUST be replaced in the same milestone -- v9.0 proved this with Phase 111
