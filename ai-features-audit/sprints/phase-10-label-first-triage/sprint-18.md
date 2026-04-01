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
- [ ] Create `backend/src/modules/ai/services/triage-override.service.ts` (max 200 lines)
- [ ] Add `TriageOverride` model to Prisma schema:
  ```prisma
  model TriageOverride {
    id        String   @id @default(cuid())
    tenantId  String
    type      String   // 'sender' | 'domain' | 'thread'
    pattern   String   // e.g. "boss@company.com", "acme.com", thread ID
    action    String   // 'always-important' | 'always-review-later' | 'always-system-alert' | 'never-follow-up' | 'always-customer-vip'
    createdAt DateTime @default(now())
    tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    @@unique([tenantId, type, pattern])
    @@index([tenantId])
  }
  ```
- [ ] Implement `getOverrides(tenantId)` — returns all active overrides
- [ ] Implement `addOverride(tenantId, type, pattern, action)` — creates with dedup
- [ ] Implement `removeOverride(tenantId, id)` — deletes
- [ ] Implement `applyOverrides(tenantId, email)` — checks overrides before label resolution:
  - If sender matches → apply override action (set lane, suppress urgency, etc.)
  - Overrides take precedence over LLM labels
- [ ] Run `npx prisma db push` and `npx prisma generate`
- [ ] REST endpoints: `GET /ai/triage-overrides`, `POST /ai/triage-overrides`, `DELETE /ai/triage-overrides/:id`
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1802: Wire overrides into triage pipeline [2 SP]
- [ ] Edit `email-analysis.service.ts` (or `label-resolution.service.ts`)
- [ ] Before label resolution, call `triageOverride.applyOverrides(tenantId, email)`
- [ ] If override matches, short-circuit: apply the override's lane/label directly
- [ ] If no override, continue with normal LLM → label → score → lane pipeline
- [ ] Log override applications for debugging
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1803: Create feedback capture from user corrections [2 SP]
- [ ] Track user corrections as potential override candidates:
  - When user manually changes a label on an email → log as `label_correction` event
  - When user manually moves email lane → log as `lane_correction` event
  - When user dismisses a follow-up → log as `followup_dismiss` event
- [ ] Create `backend/src/modules/ai/services/triage-feedback.service.ts` (max 150 lines)
- [ ] Store events in `EmailTriageFeedback` table:
  ```prisma
  model EmailTriageFeedback {
    id         String   @id @default(cuid())
    tenantId   String
    emailId    String
    type       String   // 'label_correction' | 'lane_correction' | 'followup_dismiss' | 'urgency_correction'
    oldValue   String?
    newValue   String?
    createdAt  DateTime @default(now())
    @@index([tenantId, type])
    @@index([tenantId, createdAt])
  }
  ```
- [ ] Implement `recordFeedback(tenantId, emailId, type, oldValue, newValue)`
- [ ] Add suggestion: after 3+ corrections of same pattern, suggest creating an override
- [ ] Run `npx prisma db push` and `npx prisma generate`
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1804: Add override UI in email detail view [2 SP]
- [ ] Add translations for overrides in `en.ts` and `it.ts`:
  - `triage.overrides.alwaysImportant`, `triage.overrides.alwaysReviewLater`, etc.
  - `triage.overrides.fromSender`, `triage.overrides.fromDomain`
  - `triage.overrides.remove`, `triage.overrides.title`
- [ ] In email detail triage section, add dropdown/menu:
  - "Always mark emails from [sender] as important"
  - "Always send emails from [domain] to review later"
  - "Never create follow-ups for [sender]"
- [ ] Call `POST /ai/triage-overrides` on selection
- [ ] Show active overrides affecting this email (if any)
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1805: Production validation script [2 SP]
- [ ] Extend `scripts/validate-ai-features-production.mjs` with label-first checks:
  - Verify `aiLane` is populated on recently triaged emails
  - Verify `aiIntent` is populated
  - Verify `aiActionability` is populated
  - Verify lane distribution is reasonable (not all in one lane)
  - Verify suppression labels reduce urgency (Promotions/Updates emails should be low priority)
  - Verify follow-up precision: count follow-ups per lane, `review-later` lane should have near-zero follow-ups
  - Verify triage rules endpoint responds
  - Verify override endpoint responds
- [ ] Run against Railway production backend
- [ ] Document results in checkpoint

### T-1806: Run production validation and close phase [1 SP]
- [ ] Push to main: `git push origin main`
- [ ] Wait for Railway deploy
- [ ] Run `node scripts/validate-ai-features-production.mjs`
- [ ] Run health check: `curl https://backend-production-78e1.up.railway.app/health`
- [ ] Test onboarding flow on Vercel frontend
- [ ] Test lane filtering on Vercel frontend
- [ ] Record scorecard in checkpoint:
  - Lane coverage: % of triaged emails with a lane
  - Follow-up precision: false-positive rate
  - Override functionality: working/broken
  - Onboarding flow: complete/incomplete

---

## Dependencies

- Sprint 15 complete (label resolution + lane assignment services)
- Sprint 17 complete (frontend triage UI)

## Risks

1. Override short-circuit in pipeline must not bypass PII detection or security guards.
2. Feedback table could grow large — add retention policy (30 days) or limit per tenant.
3. Suggesting overrides after 3 corrections is a heuristic — may need tuning.

## Definition of Done

- [ ] `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` pass
- [ ] Override CRUD endpoints work
- [ ] Overrides take precedence in triage pipeline
- [ ] Feedback events are logged on user corrections
- [ ] Override UI works in email detail view
- [ ] Production validation script covers all new fields
- [ ] Production scorecard recorded in checkpoint
