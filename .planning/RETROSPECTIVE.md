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

### Top Lessons (Verified Across Milestones)

1. Milestone audits catch real gaps -- v3.0, v3.1, and v4.0 all benefited from audit-before-ship (run at 80%+ completion)
2. Carry-forward items are fine when scoped explicitly (v3.2->v4.0 worked cleanly)
3. Gap closure phases are the cheapest quality investment (avg 3min vs 11min for planned phases)
4. Facade pattern for god-file splits is the safest refactoring approach -- zero consumer changes across v4.0 and v4.1
5. Plan execution velocity improves with each milestone (v1: 8min, v3.2: 11min, v4.0: 8min, v4.1: 6.5min)
