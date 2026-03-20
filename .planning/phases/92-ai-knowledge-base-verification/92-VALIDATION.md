---
phase: 92
slug: ai-knowledge-base-verification
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-20
---

# Phase 92 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (backend integration) + Manual E2E (deployed system) |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd backend && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd backend && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 92-01-01 | 01 | 1 | BAPI-13 | manual API | curl /ai/compose, /ai/summarize/:id, etc. | N/A (manual) | ⬜ pending |
| 92-01-02 | 01 | 1 | BAPI-13 | existing unit | `cd backend && npx vitest run --reporter=verbose` | ✅ | ⬜ pending |
| 92-01-03 | 01 | 1 | BAPI-15, BAPI-16 | manual API | curl /ai/knowledge-base/*, /ai/runs, /ai/runs/cost-summary | N/A (manual) | ⬜ pending |
| 92-01-04 | 01 | 1 | BAPI-16 | existing test | `cd backend && npx vitest run ai-observability --reporter=verbose` | ✅ | ⬜ pending |
| 92-02-01 | 02 | 1 | BAPI-14 | manual E2E | POST /ai/chat (SSE), conversation CRUD | N/A (manual) | ⬜ pending |
| 92-02-02 | 02 | 1 | BAPI-14 | existing test | `cd backend && npx vitest run ai-chat --reporter=verbose` | ✅ | ⬜ pending |
| 92-03-01 | 03 | 2 | FE-06 | existing type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 92-03-02 | 03 | 2 | FE-06 | manual browser | Load chat, send message, verify streaming + HITL | N/A (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test stubs needed — this is a verification-only phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Non-chat AI endpoints return valid responses | BAPI-13 | Requires real Mistral API + actual email data | curl each endpoint with valid emailId, verify response shape matches expected JSON |
| Chat SSE streaming works end-to-end | BAPI-14 | Requires live SSE connection + real LLM response | POST /ai/chat with message, verify stream events arrive |
| HITL approval flow completes | BAPI-14 | Requires interactive approval in browser UI | Ask AI to send email, verify HitlApprovalCard renders, click approve/deny |
| Knowledge base search returns relevant results | BAPI-15 | Requires backfilled embeddings + real vector similarity | Backfill first, then search; verify semantic relevance |
| AI observability shows run history | BAPI-16 | Requires prior AI operations to populate ledger | Run some AI calls, then GET /ai/runs |
| Chat frontend renders and streams | FE-06 | Requires browser + deployed frontend | Load /chat, send message, verify markdown streaming |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
