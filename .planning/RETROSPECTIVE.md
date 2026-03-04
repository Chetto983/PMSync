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

### Top Lessons (Verified Across Milestones)

1. Milestone audits catch real gaps -- v3.0, v3.1, and v4.0 all benefited from audit-before-ship
2. Carry-forward items are fine when scoped explicitly (v3.2->v4.0 worked cleanly)
3. Gap closure phases are the cheapest quality investment (avg 3min vs 11min for planned phases)
