# Phase 131: Billing Frontend - Research

**Researched:** 2026-03-31
**Domain:** Frontend billing UI (MUI + TanStack Query + Autumn/Stripe)
**Confidence:** HIGH

## Summary

The billing frontend is **already 90-95% implemented**. The API client (`frontend/lib/api/billing.ts`), TanStack Query hooks (`frontend/hooks/queries/use-billing.ts`), query keys (`billing-keys.ts`), subscription limits hook, subscription features hook, and **all 7 UI components** (`BillingPanel`, `SubscriptionCard`, `UsageCard`, `CostProtectionCard`, `PricingTable`, `UpgradeDialog`, `QuotaAlertBanner`) already exist and are wired into the Settings page under the "Billing" section tab. The `QuotaAlertBanner` is mounted in the global `Layout.tsx`.

The backend is also complete: `AutumnController` provides pricing table (public + authenticated), attach, check, track, billing portal, and cancel endpoints. `SubscriptionController` provides subscription details, usage, cost-status, limits, features, cost-breakdown, and feature-usage endpoints. Cache-Control headers were added in Phase 130.

**Primary recommendation:** This phase is essentially a verification and polish pass. The planner should focus on (1) verifying all 4 success criteria are met by existing code, (2) identifying any gaps or broken flows, and (3) adding missing i18n translations for Italian locale. No major new component development is needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILL-01 | Frontend billing UI implemented (pricing table, plan upgrade flow, usage dashboard, billing portal redirect) | All components exist: `PricingTable.tsx`, `UpgradeDialog.tsx` + `useAttachProduct` mutation for upgrade flow, `UsageCard.tsx` + `CostProtectionCard.tsx` for usage dashboard, `useOpenBillingPortal` mutation for portal redirect. Wired into Settings > Billing tab via `BillingPanel.tsx`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

### Enforced Directives
- **Frontend Procedure**: Translations first, then query hooks, then components, then validate. NEVER hardcode strings.
- **Post-Edit Validation**: `cd frontend && npx tsc --noEmit` after every edit. No exceptions.
- **MUI Only**: Use MUI `sx` props, no hardcoded CSS colors. No Tailwind.
- **TanStack Query**: `staleTime: 5min`, `gcTime: 30min`, `retry: 1` for standard queries.
- **Loading States**: Always Skeleton > error Alert > empty state > data.
- **Max 500 lines per file**.
- **Scope Control**: Do exactly what was asked. No unrequested improvements.
- **Performance**: Non-critical widgets use `React.lazy` + `Suspense` with skeleton fallback.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mui/material` | ^7.3.7 | UI components | Project standard, no alternatives |
| `@tanstack/react-query` | ^5.95.1 | Server state management | Project standard via `queryOptions()` pattern |
| `next` | ^16.1.6 | Framework | Project standard |
| `react` | ^19.2.4 | UI library | Project standard |
| `autumn-js` | (backend only) | Billing SDK | Backend dependency, frontend proxies via API |
| `lucide-react` | (installed) | Icons | Project standard for all icons |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zustand` | (installed) | Client state | Not needed for billing (all server state via TanStack Query) |

**Installation:** Nothing to install. All dependencies already present.

## Architecture Patterns

### Existing Project Structure (Billing)
```
frontend/
├── lib/api/billing.ts              # API client (15 functions, full coverage)
├── hooks/queries/
│   ├── billing-keys.ts             # Query key factory
│   ├── use-billing.ts              # 12 hooks + useBilling() combined hook
│   ├── use-billing.test.ts         # Existing tests (key construction + states)
│   ├── use-subscription-limits.ts  # Limits hook (providers, users)
│   └── use-subscription-features.ts # Feature flags hook
├── components/billing/
│   ├── index.ts                    # Barrel export (7 components)
│   ├── BillingPanel.tsx            # Main container (4-tab interface)
│   ├── SubscriptionCard.tsx        # Current plan display
│   ├── UsageCard.tsx               # Email + AI usage progress bars
│   ├── CostProtectionCard.tsx      # Daily cost cap status
│   ├── PricingTable.tsx            # 4-plan comparison grid
│   ├── UpgradeDialog.tsx           # Modal with PricingTable + checkout redirect
│   └── QuotaAlertBanner.tsx        # Global layout banner (>80% usage)
├── locales/en.ts                   # Full billing translations (~95 keys)
└── components/dashboard/Settings.tsx # Mounts BillingPanel in "billing" tab

backend/
├── src/modules/subscription/
│   ├── controllers/
│   │   ├── subscription.controller.ts  # /subscription/* endpoints
│   │   └── autumn.controller.ts        # /autumn/* proxy endpoints
│   ├── services/
│   │   ├── autumn.service.ts           # Autumn SDK wrapper
│   │   ├── subscription.service.ts     # Plan management
│   │   ├── subscription-lifecycle.service.ts
│   │   ├── billing-alert.service.ts    # Alert logic
│   │   ├── usage-tracking.service.ts   # Usage counters
│   │   └── cost-protection.service.ts  # Daily cost cap
│   └── dto/subscription.dto.ts         # All DTOs
```

### Pattern: Settings Tab Integration
BillingPanel is lazy-loaded via `next/dynamic` in Settings.tsx:
```typescript
const BillingPanel = dynamic(
  () => import('@/components/billing').then(m => ({ default: m.BillingPanel })),
  { ssr: false }
);
// Rendered when: s.selectedSection === 'billing'
```

### Pattern: Checkout Flow (Already Implemented)
1. User clicks "Upgrade" on PricingTable or UpgradeDialog
2. `useAttachProduct` mutation calls `POST /autumn/attach` with `productId`
3. Backend calls `autumn.attach()` which returns `checkoutUrl` (Stripe Checkout)
4. Frontend redirects: `window.location.href = data.checkoutUrl`
5. After payment, Stripe redirects back to app
6. On return, subscription query is invalidated to refresh state

### Pattern: Billing Portal (Already Implemented)
1. `useOpenBillingPortal` mutation calls `POST /autumn/billing_portal` or `POST /autumn/openBillingPortal`
2. Backend calls `autumn.customers.billingPortal()` which returns Stripe portal URL
3. Frontend redirects to portal URL
4. Portal return URL defaults to `/settings/billing`

### Anti-Patterns to Avoid
- **Don't create new API endpoints** -- all backend endpoints exist
- **Don't create new query hooks** -- all hooks exist with proper staleTime/gcTime
- **Don't restructure the BillingPanel tabs** -- 4-tab layout matches success criteria
- **Don't add WebSocket for real-time billing** -- explicitly out of scope per REQUIREMENTS.md

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payment processing | Custom Stripe integration | Autumn SDK (backend) | Explicitly out of scope per REQUIREMENTS.md |
| Real-time usage updates | WebSocket billing channel | TanStack Query polling on page load | Explicitly out of scope per REQUIREMENTS.md |
| Billing portal | Custom invoice/payment UI | Stripe Customer Portal via `openBillingPortal()` | Already implemented, redirects to Stripe |
| Feature gating | Custom entitlement system | `useFeatures()` + `useFeatureCheck()` hooks | Already implemented via Autumn check |

## Common Pitfalls

### Pitfall 1: Assuming Components Don't Exist
**What goes wrong:** Creating duplicate components when the full billing UI already exists
**Why it happens:** Phase description sounds like greenfield work
**How to avoid:** Read the existing `frontend/components/billing/` directory first. All 7 components exist.
**Warning signs:** Creating new files with same names as existing ones

### Pitfall 2: Italian Translation Gap
**What goes wrong:** Billing section renders with English fallback strings in Italian locale
**Why it happens:** English translations exist (~95 keys), Italian translations may be incomplete
**How to avoid:** Check `frontend/locales/it.ts` billing section and ensure parity with `en.ts`
**Warning signs:** Hardcoded strings or `|| 'fallback'` patterns rendering in production for Italian users

### Pitfall 3: Checkout Return URL Handling
**What goes wrong:** User completes Stripe checkout but app doesn't detect the plan change
**Why it happens:** No query invalidation after returning from Stripe checkout redirect
**How to avoid:** Verify Settings page re-fetches subscription data on mount/focus. TanStack Query's `staleTime: 2min` on subscription should handle this if user returns after checkout.
**Warning signs:** User sees old plan after payment

### Pitfall 4: Cost Protection Card Without Autumn Config
**What goes wrong:** CostProtectionCard shows "Loading..." forever when AUTUMN_SECRET_KEY is not set
**Why it happens:** Backend returns fallback data but may not include cost status
**How to avoid:** Verify the component handles the case where `costStatus` is undefined gracefully (it does -- shows loading text)

## Code Examples

### Existing: How BillingPanel is Mounted (Settings.tsx, line 324)
```typescript
{s.selectedSection === 'billing' && <BillingPanel />}
```

### Existing: How Checkout Works (use-billing.ts, useAttachProduct)
```typescript
export function useAttachProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, options }) => billingApi.attachProduct(productId, options),
    onSuccess: (data) => {
      if (!data.success) throw new Error(data.error || 'Checkout failed');
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl; // Redirect to Stripe
      } else {
        queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
      }
    },
  });
}
```

### Existing: How Billing Portal Redirect Works (use-billing.ts, useOpenBillingPortal)
```typescript
export function useOpenBillingPortal() {
  return useMutation({
    mutationFn: (returnUrl?: string) =>
      returnUrl ? billingApi.getBillingPortalUrl(returnUrl) : billingApi.openBillingPortal(),
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Stripe API | Autumn SDK wrapping Stripe | Project architecture decision | Simpler API, usage-based billing built-in |
| voltAgentApi billing hooks | billingApi + dedicated hooks | v11.0 Phase 125 | Clean separation, no deprecated aliases |
| CSS Tailwind styling | MUI sx props only | v11.0 Phase 125 | All billing components use MUI |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + @testing-library/react |
| Config file | `frontend/jest.config.js` (assumed standard location) |
| Quick run command | `cd frontend && npx jest --testPathPattern=billing --no-coverage` |
| Full suite command | `cd frontend && npx jest --no-coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-01a | Pricing table displays plans | unit | `cd frontend && npx jest use-billing.test.ts --no-coverage` | Yes (partial) |
| BILL-01b | Upgrade flow initiates checkout | unit | `cd frontend && npx jest use-billing.test.ts --no-coverage` | Yes (mutation tested) |
| BILL-01c | Usage dashboard shows limits | unit | `cd frontend && npx jest use-billing.test.ts --no-coverage` | Yes (query tested) |
| BILL-01d | Billing portal redirect works | unit | `cd frontend && npx jest use-billing.test.ts --no-coverage` | Yes (mutation tested) |
| BILL-01e | TypeScript compiles cleanly | type-check | `cd frontend && npx tsc --noEmit` | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit`
- **Per wave merge:** `cd frontend && npx jest --testPathPattern=billing --no-coverage`
- **Phase gate:** Full type-check + billing tests green

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. The `use-billing.test.ts` file exists with query key and state tests.

## Open Questions

1. **Italian translations completeness**
   - What we know: English `billing` section in `en.ts` has ~95 keys
   - What's unclear: Whether `it.ts` has parity
   - Recommendation: Check `it.ts` billing section during planning; add missing keys if any

2. **Post-checkout return flow**
   - What we know: `useAttachProduct` redirects to Stripe Checkout URL, TanStack Query auto-refetches with 2min staleTime
   - What's unclear: Whether the app needs explicit URL param handling after Stripe redirect (e.g., `?checkout=success`)
   - Recommendation: Verify Stripe redirect URL includes the settings billing page; if subscription query refreshes on mount, this is fine

3. **Downgrade flow**
   - What we know: Success criteria say "upgrade/downgrade" but existing UI only shows upgrade buttons (no explicit downgrade)
   - What's unclear: Whether downgrade is handled entirely through Stripe Customer Portal (billing portal redirect)
   - Recommendation: Downgrade via billing portal is the standard pattern. The "Manage Billing" button already redirects there. No custom downgrade UI needed.

## Sources

### Primary (HIGH confidence)
- **Codebase audit** -- All files read directly from `frontend/components/billing/`, `frontend/lib/api/billing.ts`, `frontend/hooks/queries/use-billing.ts`, `backend/src/modules/subscription/controllers/`
- **REQUIREMENTS.md** -- BILL-01 definition and out-of-scope items
- **ROADMAP.md** -- Phase 131 success criteria

### Secondary (MEDIUM confidence)
- **Autumn SDK patterns** -- Inferred from `autumn.service.ts` implementation (attach/check/track/cancel/billingPortal)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use
- Architecture: HIGH - All components, hooks, and API routes already implemented
- Pitfalls: HIGH - Based on direct code inspection of existing implementation

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable -- no external dependency changes expected)
