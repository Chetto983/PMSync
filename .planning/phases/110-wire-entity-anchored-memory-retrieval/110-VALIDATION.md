---
phase: 110
slug: wire-entity-anchored-memory-retrieval
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 110 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="memory.service\|entity-graph" --no-coverage -x` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="memory.service\|entity-graph" --no-coverage -x`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 110-01-01 | 01 | 1 | GRAG-04a | unit | `cd backend && npx jest --testPathPattern="entity-graph.service" -t "externalId" -x` | ❌ W0 | ⬜ pending |
| 110-01-02 | 01 | 1 | GRAG-04b | unit | `cd backend && npx jest --testPathPattern="memory.service" -t "getMemoriesByEntities" -x` | ❌ W0 | ⬜ pending |
| 110-01-03 | 01 | 1 | GRAG-04c | unit | `cd backend && npx jest --testPathPattern="ai-chat.service" -t "entity.*memor" -x` | ❌ W0 | ⬜ pending |
| 110-01-04 | 01 | 1 | GRAG-04d | integration | Manual verification via chat | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `entity-graph.service.spec.ts` — add test for externalId in traverse results
- [ ] `memory.service.spec.ts` — add test for `getMemoriesByEntities()` batch method

*Existing infrastructure covers remaining phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "What do I remember about [contact]?" returns entity-specific memories | GRAG-04d | Requires live AI chat with real database | 1. Open AI chat 2. Ask "What do you remember about [known contact]?" 3. Verify response includes entity-anchored memories, not just semantic hits |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
