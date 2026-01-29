# Email Triage & Billing Audit - 2026-01-29

## Executive Summary

Two critical issues found:
1. **Auto-Triage toggle appears broken** - Users can enable it but it may not work due to missing subscription feature check
2. **Billing may be misconfigured** - Autumn SDK requires `AUTUMN_SECRET_KEY` env var

---

## Issue 1: Auto-Triage Feature Gating Bug

### Problem Description
User reports: "Auto-Triage is disabled and can't be re-enabled"

### Root Cause Analysis

**The toggle works, but feature execution lacks subscription check!**

#### Current Flow (BROKEN):
```
1. User toggles "Auto-Triage" in AI Settings → WORKS (saves aiAutoTriageEnabled=true)
2. Email sync triggers triage → WORKS
3. EmailTriageService.isAutoTriageEnabled() → ONLY checks user preference!
4. No subscription plan check → FREE users can "enable" but feature may fail silently
```

#### Code Evidence:

**Frontend AiSettings.tsx:173** - No feature gate on toggle:
```tsx
<Switch checked={triageEnabled} onChange={(e) => setTriageEnabled(e.target.checked)} />
```
Missing: `disabled={!hasFeature('auto_triage')}`

**Backend subscription.service.ts:19-49** - Feature is PROFESSIONAL+ only:
```typescript
FREE: { features: ['basic_email'] },  // NO auto_triage!
STARTER: { features: ['basic_email', 'smart_replies', 'summaries'] },  // NO auto_triage!
PROFESSIONAL: { features: ['basic_email', 'smart_replies', 'summaries', 'auto_triage', 'briefings', 'rag'] },  // HAS auto_triage
```

**Backend email-triage.service.ts:146-157** - Missing subscription check:
```typescript
async isAutoTriageEnabled(userId: string): Promise<boolean> {
  const prefs = await this.prisma.userPreferences.findUnique({
    where: { userId },
    select: { aiAutoTriageEnabled: true },
  });
  return prefs?.aiAutoTriageEnabled ?? false;
  // BUG: Only checks preference, NOT subscription plan!
}
```

### Impact
- FREE/STARTER users can toggle Auto-Triage ON
- The preference saves successfully (feels like it worked)
- But triage should be blocked for non-PROFESSIONAL plans
- Currently: unclear if triage silently fails or runs without authorization

### Recommended Fix

**Option A: Frontend Gate (UX-friendly)**
```tsx
// In Settings.tsx - fetch features and disable toggle
const { data: features } = useFeatures(); // GET /api/v1/subscription/features
const canUseTriage = features?.auto_triage ?? false;

// In AiSettings.tsx
<Switch
  checked={triageEnabled}
  onChange={(e) => setTriageEnabled(e.target.checked)}
  disabled={!canUseTriage}
/>
{!canUseTriage && <Chip label="Pro Plan" size="small" />}
```

**Option B: Backend Guard (Security-essential)**
```typescript
// email-triage.service.ts - Add subscription check
async isAutoTriageEnabled(userId: string, tenantId: string): Promise<boolean> {
  // Check preference
  const prefs = await this.prisma.userPreferences.findUnique({
    where: { userId },
    select: { aiAutoTriageEnabled: true },
  });
  if (!prefs?.aiAutoTriageEnabled) return false;

  // Check subscription
  const hasFeature = await this.checkSubscriptionFeature(tenantId, 'auto_triage');
  return hasFeature;
}
```

**Recommended: Implement BOTH** - Frontend for UX, Backend for security.

---

## Issue 2: Billing Configuration Issues

### Problem Description
User reports: "Billing look not work properly"

### Root Cause Analysis

#### Autumn SDK Configuration
**File: autumn.service.ts:52-62**
```typescript
this.secretKey = this.config.get<string>('AUTUMN_SECRET_KEY') || '';

onModuleInit() {
  if (this.secretKey) {
    this.autumn = new Autumn({ secretKey: this.secretKey });
    this.logger.log('Autumn SDK initialized');
  } else {
    this.logger.warn('AUTUMN_SECRET_KEY not configured - billing features disabled');
  }
}
```

**Check**: Is `AUTUMN_SECRET_KEY` set in `.env`?

#### Fallback Behavior
When Autumn is not configured, the service falls back to local feature checks:
```typescript
async checkFeature(...): Promise<CheckResult> {
  if (!this.autumn) {
    return this.localFeatureCheck(tenantId, featureId);  // Falls back to PLAN_LIMITS
  }
}
```

This means:
- Pricing table shows correctly (local data)
- Feature checks work (local PLAN_LIMITS)
- BUT: Payment flows, checkout URLs, billing portal DON'T WORK

### Verification Steps

1. **Check if Autumn is configured**:
   ```bash
   grep AUTUMN_SECRET_KEY backend/.env
   ```

2. **Check logs for Autumn initialization**:
   ```bash
   # Should see either:
   # "Autumn SDK initialized" (configured)
   # OR "AUTUMN_SECRET_KEY not configured - billing features disabled" (not configured)
   ```

3. **Test billing portal endpoint**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/autumn/billing_portal \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json"
   # Should return { url: "..." } or error
   ```

### Expected Behavior When Autumn Not Configured

| Feature | Works? | Details |
|---------|--------|---------|
| Pricing table | ✅ | Local data from PLAN_LIMITS |
| Feature checks | ✅ | Local fallback |
| Plan display | ✅ | From Subscription table |
| **Upgrade flow** | ❌ | No checkout URL |
| **Billing portal** | ❌ | Returns null |
| **Usage tracking** | ❌ | Returns false |
| **Cancel via Autumn** | ❌ | Only local cancel |

### Recommended Actions

1. **If using Autumn**: Set `AUTUMN_SECRET_KEY` in `.env`
2. **If not using Autumn**: Implement alternative payment provider or manual upgrade flow
3. **Immediate UX fix**: Show "Contact us to upgrade" instead of broken checkout

---

## Feature Matrix by Plan

| Feature | FREE | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|------|---------|--------------|------------|
| basic_email | ✅ | ✅ | ✅ | ✅ |
| smart_replies | ❌ | ✅ | ✅ | ✅ |
| summaries | ❌ | ✅ | ✅ | ✅ |
| **auto_triage** | ❌ | ❌ | ✅ | ✅ |
| briefings | ❌ | ❌ | ✅ | ✅ |
| rag | ❌ | ❌ | ✅ | ✅ |

---

## Quick Fixes Checklist

- [ ] Add frontend feature gate to Auto-Triage toggle
- [ ] Add backend subscription check in `isAutoTriageEnabled()`
- [ ] Verify `AUTUMN_SECRET_KEY` is set (or implement alternative)
- [ ] Show upgrade prompts for gated features
- [ ] Log subscription check failures for debugging

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/components/settings/AiSettings.tsx` | Add `disabled={!canUseTriage}` prop |
| `frontend/components/dashboard/Settings.tsx` | Fetch features, pass to AiSettings |
| `backend/src/modules/ai/services/email-triage.service.ts` | Add subscription check |
| `backend/.env` | Verify `AUTUMN_SECRET_KEY` is set |

---

## Issue 3: Duplicate ENTERPRISE Subscriptions in Database

### Problem
User reports: "There are 2 enterprise plans in database"

### Diagnosis Query
```sql
-- Check for duplicate subscriptions per tenant
SELECT "tenantId", plan, COUNT(*) as count, array_agg(id) as subscription_ids
FROM subscriptions
GROUP BY "tenantId", plan
HAVING COUNT(*) > 1;

-- List all ENTERPRISE subscriptions
SELECT id, "tenantId", plan, status, "createdAt"
FROM subscriptions
WHERE plan = 'ENTERPRISE'
ORDER BY "createdAt" DESC;
```

### Likely Causes
1. **Race condition**: Multiple subscription creates before unique constraint check
2. **Webhook duplicate**: Autumn webhook processed twice
3. **Manual creation**: Seed or migration created duplicate

### Fix Query
```sql
-- Keep only the most recent subscription per tenant
DELETE FROM subscriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" DESC) as rn
    FROM subscriptions
  ) t
  WHERE rn > 1
);
```

### Prevention
Add unique constraint if missing:
```sql
-- Check if unique constraint exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'subscriptions'
AND constraint_type = 'UNIQUE';

-- Add unique constraint on tenantId (one subscription per tenant)
ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_tenantId_unique UNIQUE ("tenantId");
```

---

## Related Files Reference

- **Plan limits**: `subscription.service.ts:19-49`
- **Feature check**: `autumn.service.ts:135-162`
- **Triage toggle**: `AiSettings.tsx:167-174`
- **Preference save**: `Settings.tsx:274`
- **Triage execution**: `email-triage.service.ts:409-420`
- **Webhook plan mapping**: `autumn-webhook.controller.ts:238`
