---
phase: 109
slug: graph-rag-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 109 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx tsc --noEmit && npm run lint:win` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx tsc --noEmit && npm run lint:win`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated after planning* | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (jest, Prisma, NestJS testing utils already in place).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI responses include graph-expanded context for relationship queries | GRAG-01 | Requires live LLM + seeded data | Ask "What did [contact] say about [topic]?" and verify response includes related threads |
| Token usage 40-60% lower than raw injection | GRAG-03 | Requires AiRunLedger comparison with baseline | Compare assembled_context_tokens vs raw_context_tokens in ledger entries |
| Entity-anchored memory retrieval | GRAG-04 | Requires live memory + graph data | Ask "What do I remember about [contact]?" and verify entity-anchored results |
| Multi-hop queries trigger few-shot guided chains | GRAG-05 | Requires live LLM with few-shot injection | Ask multi-hop question and verify tool chain execution |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
