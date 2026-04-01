# Sprint 13 — E2E Production Validation

| Campo | Valore |
|-------|--------|
| **Phase** | 9 — Production Validation |
| **Sprint** | 13 |
| **SP** | 13 |
| **Objective** | API validation, browser E2E, data consistency checks, update production scorecard |
| **Addresses** | All — production verification of S01-S12 fixes |

---

## Sprint Backlog

### T-1301: API endpoint validation on Railway [3 SP] ✅ DONE
- [x] Test all AI endpoints respond (auth-gated = 401 is "working"):
  - `GET /api/v1/ai/health` → 200 ✅
  - `GET /api/v1/ai/health/detailed` → 401 ✅
  - `POST /api/v1/ai/chat` → 403 CSRF ✅
  - `GET /api/v1/ai/chat/conversations` → 401 ✅ (note: route is `conversations` not `sessions`)
  - `POST /api/v1/ai/summarize/:emailId` → 403 CSRF ✅
  - `POST /api/v1/ai/smart-reply/:emailId` → 403 CSRF ✅
  - `POST /api/v1/ai/compose` → 403 CSRF ✅
  - `GET /api/v1/ai/runs` → 401 ✅
  - `GET /api/v1/ai/runs/cost-summary` → 401 ✅
  - `POST /api/v1/ai/knowledge-base/search` → 403 CSRF ✅
  - `GET /api/v1/ai/knowledge-base/embeddings` → 401 ✅
- [x] Verify `/api/v1/ai/health` returns minimal response (only `status` key, no circuit breaker details) ✅
- [x] Check `/metrics` endpoint accessible → 401 (auth-gated, excluded from api/v1 prefix) ✅

### T-1302: Browser E2E — AI Chat flow [3 SP]
- [ ] Create validation script: `scripts/validate-ai-features-production.mjs`
- [ ] Test via Edge CDP (port 9222):
  - Dashboard loads AI widgets (triage, briefing, follow-ups)
  - AI chat page accessible via sidebar navigation
  - Chat input accepts text and submits
  - Tool results render without crashes
  - Command palette opens with Ctrl+K and closes with Escape
  - AI compose menu appears in email composer
  - HITL approval card renders (if pending actions exist)

### T-1303: Browser E2E — CRM AI features [2 SP]
- [ ] Test via Edge CDP:
  - Forecast dashboard loads with chart
  - AI Governance tabs switch correctly (not truncated on mobile)
  - Lead score badges appear on deal list
  - NBA section shows recommendations or empty state (not blank)

### T-1304: Data consistency validation [3 SP]
- [ ] Create/update validation script: `scripts/audit/validate-ai-data-consistency.mjs`
- [ ] Checks:
  - No orphan embeddings (emailId/contactId references exist)
  - No stale embedding versions (all match current model)
  - AiRunLedger has recent entries (AI is actually being used)
  - ChatSession records have valid tenantId
  - No duplicate embedding jobs in queue
  - No stale semaphore slots in Redis
  - Circuit breaker in closed state
- [ ] Report any issues found

### T-1305: Update production scorecard [2 SP]
- [ ] Collect all sprint results (S01-S12)
- [ ] Update `02-PRODUCTION-SCORECARD.md` with after scores
- [ ] Update findings resolution counts
- [ ] Calculate overall score improvement
- [ ] Document any remaining issues or deferred items

---

## Dependencies

- All sprints S01-S12 complete and deployed

## Risks

1. **T-1302/T-1303** — Browser tests depend on Edge CDP being available and app being logged in.
2. **T-1304** — Data consistency checks may reveal issues not covered by S01-S12. Add findings to backlog.

## Definition of Done

- [ ] All AI endpoints respond correctly (200 for public, 401 for auth-gated)
- [ ] AI health endpoint returns minimal public info
- [ ] Browser E2E: AI chat, compose, widgets, CRM AI all functional
- [ ] Data consistency: 0 orphan embeddings, 0 stale versions, 0 stale locks
- [ ] Production scorecard updated with final scores
- [ ] Overall score >= 9.0/10
- [ ] `npx tsc --noEmit` passes on both backend and frontend
