# Sprint 14 — Label Taxonomy, Intent Schema & Onboarding Backend

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Label-First Triage |
| **Sprint** | 14 |
| **SP** | 13 |
| **Objective** | Extend the data model with lane/intent/actionability fields, upgrade label taxonomy with operational metadata, and build the onboarding rules backend |
| **Addresses** | LFT-A1, LFT-A2 |

---

## Sprint Backlog

### T-1401: Add lane, intent, actionability columns to Prisma schema [2 SP]
- [ ] Add to `Email` model:
  - `aiLane String?` — enum-like: `action-now`, `waiting-on-reply`, `customer-vip`, `system-alerts`, `review-later`
  - `aiIntent String?` — `request`, `update`, `alert`, `sales`, `billing`, `personal`, `fyi`
  - `aiActionability String?` — `none`, `todo`, `waiting`
- [ ] Add to `EmailAnalysis` model:
  - `lane String?`
  - `intent String?`
  - `actionability String?`
- [ ] Add index: `@@index([tenantId, aiLane])`
- [ ] Run `npx prisma db push` and `npx prisma generate`
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1402: Add operational metadata to UserLabel model [2 SP]
- [ ] Add to `UserLabel` in schema.prisma:
  - `category String @default("custom")` — `workflow`, `semantic`, `suppression`, `custom`
  - `suppressUrgency Boolean @default(false)` — if true, emails with this label get urgency capped to `low`
  - `mutuallyExclusiveWith String[] @default([])` — label names that cannot coexist
  - `defaultLane String?` — preferred lane when this label is primary
- [ ] Run `npx prisma db push` and `npx prisma generate`
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1403: Upgrade default label taxonomy with operational metadata [2 SP]
- [ ] Edit `backend/src/modules/labels/default-user-labels.ts`
- [ ] Add `category`, `suppressUrgency`, `mutuallyExclusiveWith`, `defaultLane` to each default label:
  - `Important` → category: `workflow`, suppressUrgency: false, defaultLane: `action-now`
  - `Follow-up` → category: `workflow`, suppressUrgency: false, defaultLane: `waiting-on-reply`
  - `Action Items` → category: `workflow`, suppressUrgency: false, defaultLane: `action-now`
  - `Info` → category: `semantic`, suppressUrgency: false, defaultLane: `review-later`
  - `Personal` → category: `semantic`, suppressUrgency: false, defaultLane: null
  - `Finance` → category: `semantic`, suppressUrgency: false, defaultLane: null
  - `Promotions` → category: `suppression`, suppressUrgency: true, defaultLane: `review-later`, mutuallyExclusiveWith: `["Important", "Action Items"]`
  - `Updates` → category: `suppression`, suppressUrgency: true, defaultLane: `system-alerts`, mutuallyExclusiveWith: `["Important"]`
- [ ] Add new default labels:
  - `Customer` → category: `semantic`, suppressUrgency: false, defaultLane: `customer-vip`, aiPrompt: `Use for emails from known customers, clients, or accounts. Includes support requests, account inquiries, and business correspondence from paying or prospective customers.`
  - `System Alert` → category: `suppression`, suppressUrgency: true, defaultLane: `system-alerts`, aiPrompt: `Use for automated system notifications: CI/CD failures, monitoring alerts, deployment notices, error reports from GitHub, Vercel, Railway, Sentry, etc. Only mark as Important if it describes an active outage or incident.`
- [ ] Update `ensureDefaultUserLabels()` to include new fields
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1404: Create onboarding rules backend (TriageRuleService) [3 SP]
- [ ] Create `backend/src/modules/ai/services/triage-rule.service.ts`
- [ ] Define `TriageRule` interface:
  ```typescript
  interface TriageRule {
    type: 'domain' | 'sender' | 'keyword' | 'phrase';
    pattern: string; // e.g. "acme.com", "billing@", "project alpha"
    action: 'important' | 'customer-vip' | 'system-alert' | 'review-later' | 'suppress';
    labelName?: string; // optional label to apply
  }
  ```
- [ ] Add `triageRules Json @default("[]")` to `Tenant` model in Prisma schema
- [ ] Implement `getTriageRules(tenantId)` — returns rules merged with label aiPrompts
- [ ] Implement `setTriageRules(tenantId, rules)` — validates and persists
- [ ] Implement `buildTriageContext(tenantId)` — produces the full rule context for LLM prompt injection
- [ ] Register service in AI module
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1405: Create onboarding rules REST endpoints [2 SP]
- [ ] Add to existing AI controller or create `backend/src/modules/ai/controllers/triage-rules.controller.ts`
- [ ] `GET /ai/triage-rules` — returns current tenant rules
- [ ] `PUT /ai/triage-rules` — updates tenant rules (validates shape, max 50 rules)
- [ ] `POST /ai/triage-rules/preview` — given an email ID, shows what the rules would produce (dry-run)
- [ ] Add DTO validation with class-validator
- [ ] Add tenantId guard (existing auth middleware)
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1406: Integrate triage rules into LLM prompt [2 SP]
- [ ] Edit `email-analysis.service.ts` `analyzeEmailUnified()`
- [ ] After `buildLabelPromptBlock()`, call `triageRuleService.buildTriageContext(tenantId)` to get domain/sender/keyword rules
- [ ] Inject rules as `<TRIAGE_RULES>` block in system prompt after `<LABEL_RULES>`
- [ ] Update `en.ts` and `it.ts` prompt templates to include triage rules section
- [ ] Add `intent` and `actionability` to the LLM JSON output format:
  ```
  "intent": "request|update|alert|sales|billing|personal|fyi",
  "actionability": "none|todo|waiting",
  ```
- [ ] Parse and validate `intent` and `actionability` from LLM response
- [ ] Verify with `cd backend && npx tsc --noEmit`

---

## Dependencies

- None (first sprint of new phase)

## Risks

1. Schema migration on production Railway DB — must run `prisma db push` before deploy
2. Adding 10 default labels (up from 8) may break tenants who already have labels — `ensureDefaultUserLabels` only runs when `activeCount === 0`, so existing tenants won't get new defaults automatically. Add a migration path or skip.
3. `triageRules` JSON on Tenant model must have a max size guard to prevent abuse.

## Definition of Done

- [ ] `npx prisma db push` succeeds with new fields
- [ ] `cd backend && npx tsc --noEmit` passes
- [ ] `GET /ai/triage-rules` returns `[]` for a fresh tenant
- [ ] `PUT /ai/triage-rules` persists and validates rules
- [ ] LLM prompt includes `<TRIAGE_RULES>` block when rules exist
- [ ] `UnifiedEmailAnalysis` type includes `intent`, `actionability`, `lane`
