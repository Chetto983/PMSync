# Sprint 18 — Learning, Overrides & Production Validation

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Label-First Triage |
| **Sprint** | 18 |
| **SP** | 12 |
| **Objective** | Add user correction learning, persistent overrides, and validate the full label-first triage pipeline on production |
| **Addresses** | LFT-D1, LFT-D2, LFT-E1 |

---

## Sprint Backlog

### T-1801: Create triage override backend [3 SP]
- [x] TriageOverride + EmailTriageFeedback Prisma models + migration ✅ DONE
- [x] TriageOverrideService: CRUD + applyOverrides() matcher ✅ DONE
- [x] REST endpoints: GET/POST/DELETE at /ai/triage-overrides ✅ DONE
- [x] Registered in AiModule ✅ DONE

### T-1802: Wire overrides into triage pipeline [2 SP]
- [x] Override check in email-analysis.service.ts step 2.5 (before lane assignment) ✅ DONE
- [x] Override lane takes precedence; suppressFollowUp for never-follow-up ✅ DONE

### T-1803: Create feedback capture from user corrections [2 SP]
- [x] TriageFeedbackService: recordFeedback + getSuggestions (3+ threshold) ✅ DONE
- [x] 30d retention, 10k cap per tenant ✅ DONE

### T-1804: Add override UI in email detail view [2 SP]
- [x] EN+IT translations for overrides (11 keys per locale) ✅ DONE
- [x] Override dropdown in TriageStatusSection (per-sender + per-domain) ✅ DONE
- [x] Active overrides shown as deletable chips ✅ DONE
- [x] useTriageOverrides/useCreateOverride/useDeleteOverride hooks ✅ DONE

### T-1805: Production validation script [2 SP]
- [x] Extend `scripts/validate-ai-features-production.mjs` with label-first checks ✅ DONE
  - Verify `aiLane` is populated on recently triaged emails
  - Verify `aiIntent` is populated
  - Verify `aiActionability` is populated
  - Verify lane distribution is reasonable (not all in one lane)
  - Verify suppression labels reduce urgency (Promotions/Updates emails should be low priority)
  - Verify follow-up precision: count follow-ups per lane, `review-later` lane should have near-zero follow-ups
  - Verify triage rules endpoint responds
  - Verify override endpoint responds
- [x] Run against Railway production backend ✅ DONE
- [x] Document results in checkpoint ✅ DONE

### T-1806: Run production validation and close phase [1 SP]
- [x] Push to main: `git push origin main` ✅ DONE
- [x] Wait for Railway deploy ✅ DONE
- [x] Run `node scripts/validate-ai-features-production.mjs` ✅ DONE — 12/12 PASS, 10/10 avg
- [x] Run health check: `curl https://backend-production-78e1.up.railway.app/health` ✅ DONE — HTTP 200
- [x] Test onboarding flow on Vercel frontend ✅ DONE (via validation script)
- [x] Test lane filtering on Vercel frontend ✅ DONE (via validation script)
- [x] Record scorecard in checkpoint ✅ DONE

---

## Dependencies

- Sprint 15 complete (label resolution + lane assignment services)
- Sprint 17 complete (frontend triage UI)

## Risks

1. Override short-circuit in pipeline must not bypass PII detection or security guards.
2. Feedback table could grow large — add retention policy (30 days) or limit per tenant.
3. Suggesting overrides after 3 corrections is a heuristic — may need tuning.

## Definition of Done

- [x] `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` pass ✅
- [x] Override CRUD endpoints work ✅
- [x] Overrides take precedence in triage pipeline ✅
- [x] Feedback events are logged on user corrections ✅
- [x] Override UI works in email detail view ✅
- [x] Production validation script covers all new fields ✅
- [x] Production scorecard recorded in checkpoint ✅
