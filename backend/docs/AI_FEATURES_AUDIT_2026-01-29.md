# AI Features Audit Report

**Date**: 2026-01-29
**Auditor**: Claude Opus 4.5
**Scope**: All AI features in MailAgent backend and frontend

---

## Executive Summary

This audit examines all AI features in the MailAgent codebase, documenting:
- Backend AI services and their subscription plan gating
- Frontend AI toggles and feature controls
- Usage tracking implementation
- Security gaps requiring immediate attention

### Critical Findings

| Severity | Issue | Status |
|----------|-------|--------|
| HIGH | Memory Controller missing `QuotaGuard` | NEEDS FIX |
| MEDIUM | Follow-up endpoints lack `@RequiresQuota('ai')` decorator | NEEDS FIX |
| MEDIUM | CRM endpoints lack `@RequiresQuota('ai')` decorator | NEEDS FIX |
| MEDIUM | Scheduling endpoints lack `@RequiresQuota('ai')` decorator | NEEDS FIX |
| LOW | Document Library controller needs audit | NEEDS REVIEW |

---

## 1. Plan Limits Configuration

**Source**: `backend/src/modules/subscription/services/subscription.service.ts`

```typescript
export const PLAN_LIMITS = {
  FREE: {
    monthlyEmailLimit: 100,
    monthlyAICallLimit: 50,
    maxUsers: 1,
    features: ['basic_email'],
  },
  STARTER: {
    monthlyEmailLimit: 1000,
    monthlyAICallLimit: 500,
    maxUsers: 1,
    features: ['basic_email', 'smart_replies', 'summaries'],
  },
  PROFESSIONAL: {
    monthlyEmailLimit: 10000,
    monthlyAICallLimit: 5000,
    maxUsers: 5,
    features: ['basic_email', 'smart_replies', 'summaries', 'auto_triage', 'briefings', 'rag'],
  },
  ENTERPRISE: {
    monthlyEmailLimit: -1, // Unlimited
    monthlyAICallLimit: -1, // Unlimited
    maxUsers: -1, // Unlimited
    features: ['all'],
  },
};
```

---

## 2. Feature Matrix by Plan

| Feature | FREE | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|------|---------|--------------|------------|
| **basic_email** | YES | YES | YES | YES |
| **smart_replies** | NO | YES | YES | YES |
| **summaries** | NO | YES | YES | YES |
| **auto_triage** | NO | NO | YES | YES |
| **briefings** | NO | NO | YES | YES |
| **rag** | NO | NO | YES | YES |

### Monthly Limits

| Plan | Email Limit | AI Call Limit | Daily Cost Cap |
|------|-------------|---------------|----------------|
| FREE | 100 | 50 | $0.10 |
| STARTER | 1,000 | 500 | $0.50 |
| PROFESSIONAL | 10,000 | 5,000 | $2.00 |
| ENTERPRISE | Unlimited | Unlimited | None |

---

## 3. Backend AI Controllers Audit

### 3.1 AI Controller (`ai.controller.ts`)

**Path**: `backend/src/modules/ai/controllers/ai.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard`, `QuotaGuard`

| Endpoint | Method | `@RequiresQuota` | Feature Check | Usage Tracking | Status |
|----------|--------|------------------|---------------|----------------|--------|
| `/ai/chat` | POST | `'ai'` | None | Via MistralService | OK |
| `/ai/compose` | POST | `'ai'` | None | Via EmailInsightsService | OK |
| `/ai/summarize/:emailId` | POST | `'ai'` | None (summaries implied) | Via EmailInsightsService | OK |
| `/ai/smart-reply/:emailId` | POST | `'ai'` | None (smart_replies implied) | Via EmailInsightsService | OK |
| `/ai/categorize/:emailId` | POST | `'ai'` | None | Via EmailInsightsService | OK |
| `/ai/memory/search` | POST | `'ai'` | None (rag implied) | Via KnowledgeBaseService | OK |
| `/ai/sentiment/:emailId` | POST | `'ai'` | None | Via EmailInsightsService | OK |
| `/ai/priority/:emailId` | POST | `'ai'` | None | Via EmailInsightsService | OK |
| `/ai/analyze/:emailId` | POST | `'ai'` | None | Via EmailInsightsService | OK |

### 3.2 VoltAgent Controller (`voltagent.controller.ts`)

**Path**: `backend/src/modules/ai/voltagent/voltagent.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard`, `QuotaGuard`

| Endpoint | Method | `@RequiresQuota` | Feature Check | Status |
|----------|--------|------------------|---------------|--------|
| `/voltagent/chat` | POST | `'ai'` | None | OK |
| `/voltagent/chat/stream/v3` | POST | `'ai'` | None | OK |
| `/voltagent/briefing` | GET | `'ai'` | None (briefings implied) | OK |
| `/voltagent/actions/*` | Various | None | None | CONCERN - no quota for action approval |
| `/voltagent/stats/*` | Various | None | None | OK - stats don't consume AI |
| `/voltagent/cache/*` | Various | None | None | OK - cache management |

### 3.3 Analytics Controller (`analytics.controller.ts`)

**Path**: `backend/src/modules/ai/voltagent/controllers/analytics.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard`, `QuotaGuard`

| Endpoint | Method | `@RequiresQuota` | Status |
|----------|--------|------------------|--------|
| `/voltagent/analytics/dashboard` | GET | None | OK - pure DB query |
| `/voltagent/analytics/email` | GET | None | OK - pure DB query |
| `/voltagent/analytics/ai` | POST | `'ai'` | OK |
| `/voltagent/analytics/invalidate` | POST | None | OK - cache management |
| `/voltagent/analytics/status` | GET | None | OK - status check |

### 3.4 Follow-up Controller (`follow-up.controller.ts`)

**Path**: `backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard`, `QuotaGuard`

| Endpoint | Method | `@RequiresQuota` | Status |
|----------|--------|------------------|--------|
| `/voltagent/follow-ups` | GET | **MISSING** | NEEDS FIX |
| `/voltagent/follow-ups/pending` | GET | **MISSING** | OK - DB query only |
| `/voltagent/follow-ups/overdue` | GET | **MISSING** | OK - DB query only |
| `/voltagent/follow-ups/stats` | GET | **MISSING** | OK - DB query only |
| `/voltagent/follow-ups` | POST | **MISSING** | NEEDS REVIEW |
| `/voltagent/follow-ups/analyze` | POST | **MISSING** | NEEDS FIX - uses AI analysis |
| `/voltagent/follow-ups/:id` | GET | **MISSING** | OK - DB query only |
| `/voltagent/follow-ups/:id/resolve` | POST | **MISSING** | OK - DB update only |
| `/voltagent/follow-ups/:id/snooze` | POST | **MISSING** | OK - DB update only |

**Issue**: `analyzeForFollowUp` uses pattern matching (not LLM currently), but should be gated in case of future AI enhancement.

### 3.5 Scheduling Controller (`scheduling.controller.ts`)

**Path**: `backend/src/modules/ai/voltagent/controllers/scheduling.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard`, `QuotaGuard`

| Endpoint | Method | `@RequiresQuota` | Status |
|----------|--------|------------------|--------|
| `/voltagent/scheduling/conflicts` | POST | **MISSING** | OK - calendar DB query |
| `/voltagent/scheduling/available-slots` | GET | **MISSING** | OK - calendar DB query |
| `/voltagent/scheduling/preferences` | GET | **MISSING** | OK - DB query |
| `/voltagent/scheduling/day-load` | GET | **MISSING** | OK - DB query |
| `/voltagent/scheduling/focus-time/*` | Various | **MISSING** | OK - DB operations |
| `/voltagent/scheduling/meeting-prep/:eventId` | GET | **MISSING** | NEEDS REVIEW - may use AI |

### 3.6 CRM Controller (`crm.controller.ts`)

**Path**: `backend/src/modules/ai/voltagent/controllers/crm.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard`, `QuotaGuard`

| Endpoint | Method | `@RequiresQuota` | Status |
|----------|--------|------------------|--------|
| `/voltagent/crm/stale-contacts` | GET | **MISSING** | OK - DB query |
| `/voltagent/crm/reconnect` | GET | **MISSING** | OK - DB query |
| `/voltagent/crm/top-contacts` | GET | **MISSING** | OK - DB query |
| `/voltagent/crm/contacts/:id` | GET | **MISSING** | OK - DB query |
| `/voltagent/crm/contacts/:id/interactions` | GET/POST | **MISSING** | OK - DB operations |
| `/voltagent/crm/contacts/:id/recalculate` | POST | **MISSING** | OK - algorithm-based |
| `/voltagent/crm/recalculate-all` | POST | **MISSING** | OK - algorithm-based |

### 3.7 Knowledge Controller (`knowledge.controller.ts`)

**Path**: `backend/src/modules/ai/voltagent/controllers/knowledge.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard`, `QuotaGuard`

| Endpoint | Method | `@RequiresQuota` | Feature Check | Status |
|----------|--------|------------------|---------------|--------|
| `/voltagent/knowledge/search` | POST | **MISSING** | None (rag implied) | NEEDS FIX - uses embeddings |
| `/voltagent/knowledge/remember` | POST | **MISSING** | None | NEEDS FIX - uses embeddings |
| `/voltagent/knowledge/stats` | GET | **MISSING** | None | OK - DB query |

**Critical**: RAG search should be feature-gated to PROFESSIONAL+ plans.

### 3.8 Memory Controller (`memory.controller.ts`)

**Path**: `backend/src/modules/ai/voltagent/controllers/memory.controller.ts`
**Guards**: `JwtAuthGuard`, `TenantGuard` **ONLY**

| Endpoint | Method | `@RequiresQuota` | Status |
|----------|--------|------------------|--------|
| `/voltagent/memory` | GET | **MISSING** | NEEDS FIX - QuotaGuard not applied |
| `/voltagent/memory/search` | GET | **MISSING** | CRITICAL - uses embeddings |
| `/voltagent/memory` | POST | **MISSING** | NEEDS FIX - stores embeddings |
| `/voltagent/memory/:id` | DELETE | **MISSING** | OK - delete operation |
| `/voltagent/memory` | DELETE | **MISSING** | OK - delete operation |

**CRITICAL**: Memory controller is missing `QuotaGuard` entirely! All memory operations bypass quota checks.

---

## 4. Email Triage Service Feature Gating

**Path**: `backend/src/modules/ai/services/email-triage.service.ts`

The triage service properly implements feature gating:

```typescript
async isAutoTriageEnabled(userId: string, tenantId: string): Promise<boolean> {
  // 1. Check user preference first (fast check)
  const prefs = await this.prisma.userPreferences.findUnique({
    where: { userId },
    select: { aiAutoTriageEnabled: true },
  });
  if (!prefs?.aiAutoTriageEnabled) {
    return false;
  }

  // 2. Check subscription has auto_triage feature (PROFESSIONAL+ plans only)
  const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
  const hasFeature = this.subscriptionService.hasFeature(subscription.plan, 'auto_triage');

  return hasFeature;
}
```

**Status**: PROPERLY GATED

---

## 5. Frontend AI Settings

**Path**: `frontend/components/settings/AiSettings.tsx`

### Feature Toggle Props

| Prop | Description | Plan Gating |
|------|-------------|-------------|
| `smartRepliesEnabled` | Smart reply suggestions | None (available STARTER+) |
| `summarizationEnabled` | Email summarization | None (available STARTER+) |
| `schedulingEnabled` | Smart scheduling | None |
| `canUseTriage` | Auto-triage toggle | **YES** - checks `auto_triage` feature |
| `triageEnabled` | Triage on/off state | Disabled if `!canUseTriage` |

### Frontend Feature Check

**Path**: `frontend/components/dashboard/Settings.tsx`

```typescript
const { data: subscriptionFeatures } = useSubscriptionFeatures();
const canUseTriage = subscriptionFeatures?.auto_triage ?? false;
```

**Path**: `frontend/hooks/queries/use-subscription-features.ts`

```typescript
export interface SubscriptionFeatures {
  basic_email: boolean;
  smart_replies: boolean;
  summaries: boolean;
  auto_triage: boolean;
  briefings: boolean;
  rag: boolean;
}
```

---

## 6. Usage Tracking Implementation

**Path**: `backend/src/modules/subscription/services/usage-tracking.service.ts`

### Tracked Operations

| Operation | Cost (USD) | Tracking Method |
|-----------|------------|-----------------|
| `embedding` | $0.00002 | `trackAICall('embedding')` |
| `triage` | $0.00035 | `trackAICall('triage')` |
| `summary` | $0.00028 | `trackAICall('summary')` |
| `smartReply` | $0.00017 | `trackAICall('smartReply')` |
| `briefing` | $0.0007 | `trackAICall('briefing')` |
| `complexCompose` | $0.0035 | `trackAICall('complexCompose')` |

### Usage Tracking Methods

```typescript
// Track email processing
trackEmailProcessed(tenantId: string, count: number = 1)

// Track AI call with cost
trackAICall(tenantId: string, operation: keyof OPERATION_COSTS, count: number = 1)

// Convenience method (maps to smartReply cost)
trackUsage(tenantId: string, featureType: 'ai-calls' | 'email-processing', count: number = 1)
```

### Services with Usage Tracking

| Service | Tracking Call | Status |
|---------|---------------|--------|
| `DailyBriefingService` | `usageTrackingService.trackUsage(tenantId, 'ai-calls', 1)` | OK |
| `MistralService` | Via calling services | Indirect |
| `EmailInsightsService` | Via calling services | Indirect |

**Concern**: Not all AI services directly track usage. They rely on `QuotaGuard` at controller level and calling services to track.

---

## 7. Quota Guard Implementation

**Path**: `backend/src/modules/subscription/guards/quota.guard.ts`

### Enforcement Flow

1. Check subscription status (ACTIVE, CANCELED, PAST_DUE)
2. Check required feature via `@RequiresFeature('feature_name')`
3. Check quota type via `@RequiresQuota('ai' | 'email')`
4. Check cost protection (daily cost cap) for non-ENTERPRISE plans

### Decorators

```typescript
@RequiresQuota('ai')  // Enforces AI call quota
@RequiresQuota('email')  // Enforces email processing quota
@RequiresFeature('auto_triage')  // Requires specific feature
```

---

## 8. Feature Gating Gaps (NEEDS FIX)

### 8.1 Critical - Missing QuotaGuard

| Controller | File | Issue |
|------------|------|-------|
| `MemoryController` | `memory.controller.ts` | `QuotaGuard` not in `@UseGuards()` |

**Fix Required**:
```typescript
// Change from:
@UseGuards(JwtAuthGuard, TenantGuard)

// To:
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
```

### 8.2 Medium - Missing @RequiresQuota on AI Endpoints

| Endpoint | Controller | Issue |
|----------|------------|-------|
| `POST /voltagent/knowledge/search` | KnowledgeController | Uses embeddings, no quota |
| `POST /voltagent/knowledge/remember` | KnowledgeController | Uses embeddings, no quota |
| `GET /voltagent/memory/search` | MemoryController | Uses embeddings, no quota |
| `POST /voltagent/memory` | MemoryController | Stores embeddings, no quota |
| `POST /voltagent/follow-ups/analyze` | FollowUpController | May use AI in future |

### 8.3 Low - Feature Gating for Premium Features

These features should check subscription features:

| Feature | Suggested Feature Flag | Current State |
|---------|------------------------|---------------|
| RAG/Knowledge Search | `rag` | No check |
| Daily Briefing | `briefings` | No check (uses quota only) |
| Smart Replies | `smart_replies` | No check |
| Summaries | `summaries` | No check |

---

## 9. Frontend Feature Toggle Gaps

| Feature | Backend Gating | Frontend Toggle | Frontend Plan Check | Status |
|---------|----------------|-----------------|---------------------|--------|
| Smart Replies | QuotaGuard | YES | NO | NEEDS FIX |
| Summarization | QuotaGuard | YES | NO | NEEDS FIX |
| Scheduling | QuotaGuard | YES | NO | NEEDS FIX |
| Auto-Triage | Feature + QuotaGuard | YES | YES | OK |
| Briefings | QuotaGuard | N/A | NO | NEEDS FIX |
| RAG Search | QuotaGuard | N/A | NO | NEEDS FIX |

**Issue**: Only triage properly shows "Pro Plan" chip when feature unavailable. Other AI features show toggles to all users but fail on backend for lower plans.

---

## 10. Recommendations

### Immediate Actions (P0)

1. **Add QuotaGuard to MemoryController**
   - File: `backend/src/modules/ai/voltagent/controllers/memory.controller.ts`
   - Add `QuotaGuard` to `@UseGuards()`
   - Add `@RequiresQuota('ai')` to `searchMemories` and `storeMemory` endpoints

2. **Add @RequiresQuota to Knowledge endpoints**
   - File: `backend/src/modules/ai/voltagent/controllers/knowledge.controller.ts`
   - Add `@RequiresQuota('ai')` to `unifiedKnowledgeSearch` and `rememberKnowledge`

### Short-term Actions (P1)

3. **Add @RequiresFeature for premium features**
   - Add `@RequiresFeature('rag')` to knowledge/memory search endpoints
   - Add `@RequiresFeature('briefings')` to briefing endpoint
   - Add `@RequiresFeature('smart_replies')` to smart-reply endpoint
   - Add `@RequiresFeature('summaries')` to summarize endpoint

4. **Frontend plan checks for all AI toggles**
   - Smart Replies: Show disabled with "Starter+" chip for FREE users
   - Summarization: Show disabled with "Starter+" chip for FREE users
   - Scheduling: Review if this should be gated
   - RAG/Memory: Add UI section with "Professional+" gating

### Medium-term Actions (P2)

5. **Usage tracking improvements**
   - Add direct tracking in services instead of relying on controller-level tracking
   - Track specific operation types for cost analytics

6. **Feature usage analytics**
   - Add dashboard showing feature usage by type
   - Alert users approaching quota limits

---

## 11. Files to Modify

| File | Change Required | Priority |
|------|-----------------|----------|
| `backend/src/modules/ai/voltagent/controllers/memory.controller.ts` | Add QuotaGuard + @RequiresQuota | P0 |
| `backend/src/modules/ai/voltagent/controllers/knowledge.controller.ts` | Add @RequiresQuota('ai') + @RequiresFeature('rag') | P0 |
| `backend/src/modules/ai/controllers/ai.controller.ts` | Add @RequiresFeature decorators | P1 |
| `backend/src/modules/ai/voltagent/voltagent.controller.ts` | Add @RequiresFeature('briefings') to briefing | P1 |
| `frontend/components/settings/AiSettings.tsx` | Add plan checks for all toggles | P1 |
| `frontend/components/dashboard/Settings.tsx` | Pass `canUseSmartReplies`, `canUseSummaries` | P1 |

---

## 12. Testing Checklist

After implementing fixes, verify:

- [ ] FREE plan user cannot access RAG search (403)
- [ ] FREE plan user cannot use smart replies (403)
- [ ] FREE plan user cannot get summarization (403)
- [ ] FREE plan user cannot access triage (403 + UI disabled)
- [ ] FREE plan user cannot access briefings (403)
- [ ] STARTER plan user CAN access smart replies, summaries
- [ ] STARTER plan user CANNOT access triage, briefings, rag
- [ ] PROFESSIONAL plan user CAN access all features
- [ ] ENTERPRISE plan user has no quota limits
- [ ] Usage tracking increments correctly for all AI calls
- [ ] Daily cost cap blocks AI calls when exceeded (non-ENTERPRISE)

---

## Appendix A: Controller-to-Feature Mapping

```
AiController
├── chat              → basic_email (any plan with quota)
├── compose           → basic_email
├── summarize         → summaries (STARTER+)
├── smart-reply       → smart_replies (STARTER+)
├── categorize        → basic_email
├── memory/search     → rag (PROFESSIONAL+)
├── sentiment         → basic_email
├── priority          → basic_email
└── analyze           → basic_email

VoltAgentController
├── chat              → basic_email
├── chat/stream       → basic_email
├── briefing          → briefings (PROFESSIONAL+)
├── actions/*         → basic_email (workflow management)
├── stats/*           → basic_email (no AI)
└── cache/*           → admin operations

FollowUpController    → basic_email (no AI currently)
SchedulingController  → basic_email (no AI currently)
CrmController         → basic_email (no AI currently)
KnowledgeController   → rag (PROFESSIONAL+)
MemoryController      → rag (PROFESSIONAL+)
AnalyticsController   → AI endpoint only needs quota
```

---

---

## 13. Provider Limits Audit (CRITICAL GAP)

**Source**: `backend/src/modules/providers/controllers/providers.controller.ts`

### Current State: NO PROVIDER LIMITS ENFORCED

| Issue | Severity | Description |
|-------|----------|-------------|
| **No maxProviders in PLAN_LIMITS** | CRITICAL | `PLAN_LIMITS` has `maxUsers` but NO `maxProviders` or `maxEmailAccounts` |
| **No QuotaGuard on ProvidersController** | HIGH | All provider endpoints use only `JwtAuthGuard` + `TenantGuard` |
| **email-connections not enforced** | HIGH | `autumn.service.ts` defines `CONNECTIONS: 'email-connections'` but never checked |

### Provider Endpoints Without Limits

| Endpoint | Method | Guards | Issue |
|----------|--------|--------|-------|
| `POST /providers/google/connect` | POST | JwtAuthGuard, TenantGuard | **NO LIMIT CHECK** |
| `POST /providers/microsoft/connect` | POST | JwtAuthGuard, TenantGuard | **NO LIMIT CHECK** |
| `POST /providers/generic/connect` | POST | JwtAuthGuard, TenantGuard | **NO LIMIT CHECK** |

### Expected Provider Limits (Suggested)

| Plan | Max Providers | Rationale |
|------|---------------|-----------|
| FREE | 1 | Single email account only |
| STARTER | 2 | Personal + work email |
| PROFESSIONAL | 5 | Team/multi-account use |
| ENTERPRISE | Unlimited | No restrictions |

### Fix Required

**1. Add `maxProviders` to PLAN_LIMITS**:
```typescript
// backend/src/modules/subscription/services/subscription.service.ts
export const PLAN_LIMITS = {
  FREE: {
    monthlyEmailLimit: 100,
    monthlyAICallLimit: 50,
    maxUsers: 1,
    maxProviders: 1,  // ADD THIS
    features: ['basic_email'],
  },
  STARTER: {
    monthlyEmailLimit: 1000,
    monthlyAICallLimit: 500,
    maxUsers: 1,
    maxProviders: 2,  // ADD THIS
    features: ['basic_email', 'smart_replies', 'summaries'],
  },
  PROFESSIONAL: {
    monthlyEmailLimit: 10000,
    monthlyAICallLimit: 5000,
    maxUsers: 5,
    maxProviders: 5,  // ADD THIS
    features: ['basic_email', 'smart_replies', 'summaries', 'auto_triage', 'briefings', 'rag'],
  },
  ENTERPRISE: {
    monthlyEmailLimit: -1,
    monthlyAICallLimit: -1,
    maxUsers: -1,
    maxProviders: -1,  // ADD THIS (unlimited)
    features: ['all'],
  },
};
```

**2. Add provider limit check to `ProviderConfigService.connectGoogleProvider`** (and others):
```typescript
// backend/src/modules/providers/services/provider-config.service.ts
async connectGoogleProvider(tenantId: string, userId: string, dto: ConnectGoogleProviderDto, codeVerifier?: string) {
  // ADD: Check provider limit before creating
  const currentProviders = await this.prisma.providerConfig.count({
    where: { tenantId, isDeleted: false },
  });

  const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
  const planLimits = PLAN_LIMITS[subscription.plan];

  if (planLimits.maxProviders !== -1 && currentProviders >= planLimits.maxProviders) {
    throw new ForbiddenException(`Maximum ${planLimits.maxProviders} email accounts allowed on ${subscription.plan} plan`);
  }

  // ... existing provider creation logic
}
```

**3. Track provider usage via Autumn SDK**:
```typescript
// backend/src/modules/subscription/services/autumn.service.ts
// Already has: CONNECTIONS: 'email-connections'
// Need to call: await this.autumnService.recordUsage(tenantId, 'email-connections', 1);
```

### Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `subscription.service.ts` | Add `maxProviders` to PLAN_LIMITS | P0 |
| `provider-config.service.ts` | Add limit check before provider creation | P0 |
| `ProvidersController` | Add informative error for limit exceeded | P1 |
| `autumn.service.ts` | Track `email-connections` on provider add/remove | P1 |
| Frontend Settings | Show "Upgrade" when provider limit reached | P1 |

---

## 14. Summary of Critical Gaps

| Gap | Severity | Impact | Fix Effort |
|-----|----------|--------|------------|
| MemoryController missing QuotaGuard | HIGH | Uncontrolled AI usage | 5 min |
| Knowledge endpoints missing @RequiresQuota | HIGH | Uncontrolled embedding usage | 5 min |
| **Provider limits not enforced** | CRITICAL | Unlimited email accounts for FREE users | 30 min |
| Feature gating incomplete in frontend | MEDIUM | Users see broken toggles | 15 min |

---

**Report Generated**: 2026-01-29
**Updated**: Added Provider Limits Audit (Section 13)
**Next Review**: After implementing P0/P1 fixes
