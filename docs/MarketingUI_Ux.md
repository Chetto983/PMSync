# PMSync Marketing & UI/UX Audit 2025

**Date:** December 16, 2025
**Version:** 2.0
**Purpose:** Comprehensive competitor analysis, feature gap identification, and UI/UX improvement plan

---

## Recommended Tech Stack Update

### UI Framework: TailAdmin for Next.js

Based on analysis, we recommend adopting [TailAdmin for Next.js](https://tailadmin.com/nextjs) to accelerate frontend development:

| Feature | Benefit for PMSync |
|---------|-------------------|
| **500+ UI Components** | Ready-to-use dashboard elements |
| **7 Dashboard Templates** | Analytics, CRM, SaaS variants |
| **ApexCharts Integration** | Email analytics visualization |
| **AI Dashboard Pages** | Pre-built AI assistant layouts |
| **Dark/Light Mode** | Already supported in our app |
| **TypeScript Support** | Type-safe development |
| **Tailwind CSS** | Consistent with our setup |

**Why TailAdmin simplifies development:**

- Pre-built CRM dashboard components → Contact health, relationship graphs
- Analytics dashboard → Email insights, AI memory stats
- AI pages with history → Perfect for VoltAgent chat
- Tables/Cards/Counters → Follow-ups, deadlines, actions

### Data Fetching: TanStack Query v5

We already use [TanStack Query](https://tanstack.com/query/latest) - leverage it fully:

```typescript
// Optimal patterns for AI feature data fetching
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

// With Suspense for better loading states
export function useDeadlines(days = 7) {
  return useSuspenseQuery({
    queryKey: ['deadlines', days],
    queryFn: () => voltagentApi.getDeadlines({ days }),
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchInterval: 60 * 1000, // Refresh every minute
  });
}

// Prefetch for instant navigation
queryClient.prefetchQuery({
  queryKey: ['dailyBriefing'],
  queryFn: () => voltagentApi.getDailyBriefing(),
});
```

**TanStack Query patterns to implement:**

- `useSuspenseQuery` with React Suspense for streaming-like UX
- `prefetchQuery` on hover for instant page transitions
- `useInfiniteQuery` for email list pagination
- `useMutation` with optimistic updates for actions

---

## Part 0: SuperAdmin Dashboard (Development Tracking)

> **Purpose:** Monitor if the frontend refactoring is successful. Track feature adoption, performance, errors, and user engagement.

### 0.1 SuperAdmin Dashboard Overview

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│  🔐 SUPERADMIN DASHBOARD                              [Settings] [Alerts] [Docs]│
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  SYSTEM HEALTH                                         Last updated: 2 min ago  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ 🟢 API       │  │ 🟢 Database  │  │ 🟢 Redis     │  │ 🟢 Mistral   │        │
│  │ 99.9% up     │  │ 45ms avg     │  │ 2ms avg      │  │ 320ms avg    │        │
│  │ 1.2k req/min │  │ 89% conn     │  │ 12MB used    │  │ 847 tokens   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                                  │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ 📊 FEATURE ADOPTION (This Week) │  │ 🚨 ERROR TRACKING                   │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────────┤  │
│  │ Command Palette (⌘K)    45% ████│  │ Hydration errors:     3 (↓ 90%)    │  │
│  │ Inline AI Insights      62% ████│  │ API timeouts:         12 (↓ 45%)   │  │
│  │ Quick Replies           38% ███ │  │ WebSocket disconnects: 8 (↓ 60%)   │  │
│  │ Follow-up Widget        71% ████│  │ Auth failures:        2 (↓ 80%)    │  │
│  │ Deadline Widget         68% ████│  │ JS bundle errors:     0 (↓ 100%)   │  │
│  │ CRM Alerts              29% ██  │  │                                     │  │
│  │ Memory Browser          15% █   │  │ [View Error Logs →]                 │  │
│  │ Document Library        12% █   │  │                                     │  │
│  └─────────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ 📈 PERFORMANCE METRICS (Core Web Vitals)                                │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │   LCP (Largest Contentful Paint)        INP (Interaction to Next Paint) │   │
│  │   ┌────────────────────────────┐        ┌────────────────────────────┐  │   │
│  │   │ Before: 2.5s  │ Now: 1.2s │        │ Before: 200ms │ Now: 85ms  │  │   │
│  │   │ Target: <1.5s │ ✅ PASS   │        │ Target: <100ms│ ✅ PASS    │  │   │
│  │   └────────────────────────────┘        └────────────────────────────┘  │   │
│  │                                                                          │   │
│  │   CLS (Cumulative Layout Shift)         Bundle Size                      │   │
│  │   ┌────────────────────────────┐        ┌────────────────────────────┐  │   │
│  │   │ Before: 0.15  │ Now: 0.05 │        │ Before: 350KB │ Now: 180KB │  │   │
│  │   │ Target: <0.1  │ ✅ PASS   │        │ Target: <200KB│ ✅ PASS    │  │   │
│  │   └────────────────────────────┘        └────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ 👥 USER ENGAGEMENT              │  │ 🤖 AI SYSTEM STATS                  │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────────┤  │
│  │ Daily Active Users:    127      │  │ VoltAgent conversations:  1,847     │  │
│  │ Avg Session Duration:  18 min   │  │ Pending actions:          23        │  │
│  │ Pages/Session:         8.3      │  │ Actions approved:         89%       │  │
│  │ Bounce Rate:           12%      │  │ Mem0 memories stored:     12,456    │  │
│  │ Mobile Users:          34%      │  │ Documents indexed:        342       │  │
│  │                                 │  │ Avg response time:        1.8s      │  │
│  │ [View User Analytics →]        │  │ Token usage today:        45,230    │  │
│  └─────────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ 🏆 DEVELOPMENT PROGRESS TRACKER                                         │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │ Phase 1: Critical Fixes        ████████████████████████████████ 100%    │   │
│  │ Phase 2: Performance           ████████████████████████░░░░░░░░  75%    │   │
│  │ Phase 3: Architecture          ████████████████░░░░░░░░░░░░░░░░  50%    │   │
│  │ Phase 4: Dashboard             ████████░░░░░░░░░░░░░░░░░░░░░░░░  25%    │   │
│  │ Phase 5: AI Features           ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%    │   │
│  │ Phase 6: CRM/Memory            ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%    │   │
│  │ Phase 7: Testing               ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%    │   │
│  │ Phase 8: Polish                ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%    │   │
│  │                                                                          │   │
│  │ Overall Progress: ████████░░░░░░░░░░░░░░░░░░░░░░  31%                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 0.2 SuperAdmin Features

| Feature | Description | Priority |
|---------|-------------|----------|
| **System Health** | API, Database, Redis, Mistral status | P0 |
| **Error Tracking** | Real-time error monitoring with trends | P0 |
| **Feature Adoption** | Track usage of new features | P0 |
| **Core Web Vitals** | LCP, INP, CLS monitoring | P0 |
| **User Analytics** | DAU, session duration, engagement | P1 |
| **AI Stats** | Conversations, tokens, memories | P1 |
| **Dev Progress** | Phase completion tracking | P1 |
| **Tenant Management** | Multi-tenant overview | P1 |
| **Cost Tracking** | AI token costs per tenant | P2 |
| **Audit Logs** | Admin action history | P2 |

### 0.3 SuperAdmin Pages Structure

```text
/superadmin
├── /                     # Main dashboard (overview)
├── /health               # System health details
│   ├── /api              # API metrics, endpoints
│   ├── /database         # PostgreSQL stats
│   ├── /redis            # Cache stats
│   └── /ai               # Mistral/AI service stats
├── /errors               # Error tracking
│   ├── /frontend         # JS errors, hydration
│   ├── /backend          # API errors, exceptions
│   └── /ai               # AI failures, timeouts
├── /analytics            # User analytics
│   ├── /users            # User behavior
│   ├── /features         # Feature adoption
│   └── /performance      # Core Web Vitals
├── /ai                   # AI system management
│   ├── /conversations    # Chat history viewer
│   ├── /actions          # Pending actions queue
│   ├── /memories         # Memory browser (all users)
│   └── /costs            # Token usage & costs
├── /tenants              # Multi-tenant management
│   ├── /list             # All tenants
│   ├── /[id]             # Tenant details
│   └── /quotas           # Usage quotas
├── /development          # Dev progress tracker
│   ├── /roadmap          # Phase progress
│   ├── /tests            # Test coverage
│   └── /deployments      # Deployment history
└── /settings             # SuperAdmin settings
    ├── /alerts           # Alert configuration
    ├── /users            # Admin user management
    └── /audit            # Audit logs
```

### 0.4 Key Metrics to Track (Success Criteria)

| Metric | Before Refactor | Target | How to Measure |
|--------|-----------------|--------|----------------|
| **LCP** | 2.5s | <1.5s | Lighthouse CI |
| **INP** | 200ms | <100ms | Web Vitals |
| **Bundle Size** | 350KB | <200KB | Bundle analyzer |
| **Hydration Errors** | ~50/day | 0 | Error tracking |
| **Feature Adoption** | 10% | 60% | Analytics events |
| **Command Palette Usage** | 0% | 50% | Usage tracking |
| **AI Action Approval** | N/A | 85%+ | Backend logs |
| **Session Duration** | 12 min | 20+ min | Analytics |
| **Error Rate** | 5% | <1% | Error tracking |
| **Test Coverage** | 30% | 80% | Jest coverage |

### 0.5 SuperAdmin API Endpoints (Backend)

```typescript
// backend/src/modules/superadmin/superadmin.controller.ts

@Controller('api/v1/superadmin')
@UseGuards(SuperAdminGuard)
export class SuperAdminController {
  // System Health
  @Get('health')
  getSystemHealth(): Promise<SystemHealth>;

  @Get('health/api')
  getApiMetrics(): Promise<ApiMetrics>;

  @Get('health/database')
  getDatabaseStats(): Promise<DatabaseStats>;

  @Get('health/redis')
  getRedisStats(): Promise<RedisStats>;

  @Get('health/ai')
  getAiServiceStats(): Promise<AiServiceStats>;

  // Error Tracking
  @Get('errors')
  getErrors(@Query() params: ErrorQueryParams): Promise<ErrorList>;

  @Get('errors/trends')
  getErrorTrends(@Query('period') period: string): Promise<ErrorTrends>;

  // Analytics
  @Get('analytics/users')
  getUserAnalytics(@Query() params: AnalyticsParams): Promise<UserAnalytics>;

  @Get('analytics/features')
  getFeatureAdoption(): Promise<FeatureAdoption>;

  @Get('analytics/performance')
  getPerformanceMetrics(): Promise<PerformanceMetrics>;

  // AI System
  @Get('ai/stats')
  getAiStats(): Promise<AiStats>;

  @Get('ai/conversations')
  getConversations(@Query() params: ConversationParams): Promise<ConversationList>;

  @Get('ai/costs')
  getAiCosts(@Query('period') period: string): Promise<AiCosts>;

  // Tenants
  @Get('tenants')
  getTenants(): Promise<TenantList>;

  @Get('tenants/:id')
  getTenantDetails(@Param('id') id: string): Promise<TenantDetails>;

  @Patch('tenants/:id/quota')
  updateTenantQuota(@Param('id') id: string, @Body() quota: QuotaUpdate): Promise<void>;

  // Development Progress
  @Get('development/progress')
  getDevProgress(): Promise<DevProgress>;

  @Get('development/tests')
  getTestCoverage(): Promise<TestCoverage>;
}
```

### 0.6 SuperAdmin Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| **Charts** | ApexCharts (TailAdmin) | Real-time updates, beautiful |
| **Tables** | TanStack Table | Sorting, filtering, pagination |
| **Real-time** | WebSocket + React Query | Live updates |
| **Error Tracking** | Custom + Sentry integration | Comprehensive |
| **Analytics** | Custom + Plausible/Posthog | Privacy-friendly |
| **Logs Viewer** | Custom with virtual scroll | Large datasets |

### 0.7 Access Control

```typescript
// SuperAdmin roles
enum SuperAdminRole {
  OWNER = 'owner',           // Full access, can manage other admins
  ADMIN = 'admin',           // Full access, no admin management
  DEVELOPER = 'developer',   // Dev progress, errors, tests
  ANALYST = 'analyst',       // Analytics only, read-only
}

// Permission matrix
const permissions = {
  'view:health': ['owner', 'admin', 'developer'],
  'view:errors': ['owner', 'admin', 'developer'],
  'view:analytics': ['owner', 'admin', 'analyst'],
  'view:ai': ['owner', 'admin'],
  'manage:tenants': ['owner', 'admin'],
  'manage:admins': ['owner'],
  'view:costs': ['owner'],
};
```

---

## Part 0.5: Pricing Strategy

> **Purpose:** Define competitive pricing tiers that monetize AI features while remaining accessible.

### Competitor Pricing Analysis

| Competitor | Free Tier | Basic | Pro | Enterprise |
|------------|-----------|-------|-----|------------|
| **Superhuman** | ❌ No | ❌ No | $30/mo | Custom |
| **Spark** | ✅ Yes | $4.99/mo | $6.99/mo | Custom |
| **Mailbird** | ❌ No | $2.28/mo | $4.08/mo | N/A |
| **Spike** | ✅ Yes | $6/mo | $10/mo | Custom |
| **Newton** | ❌ No | $4.17/mo | N/A | N/A |

**Key Insight:** Superhuman at $30/mo proves premium AI email has a market. PMSync has MORE features (Mem0, VoltAgent, CRM) - we can position between Spark ($7) and Superhuman ($30).

### PMSync Pricing Tiers

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PMSYNC PRICING PLANS                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐ │
│  │ 🆓 FREE         │  │ ⭐ STARTER      │  │ 🚀 PRO          │  │ 🏢 TEAM    │ │
│  │ $0/mo           │  │ $9/mo           │  │ $19/mo          │  │ $29/user/mo│ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  ├────────────┤ │
│  │                 │  │                 │  │                 │  │            │ │
│  │ EMAIL           │  │ Everything in   │  │ Everything in   │  │ Everything │ │
│  │ • 1 account     │  │ Free, plus:     │  │ Starter, plus:  │  │ in Pro,    │ │
│  │ • Basic inbox   │  │                 │  │                 │  │ plus:      │ │
│  │ • Calendar sync │  │ • 3 accounts    │  │ • Unlimited     │  │            │ │
│  │                 │  │ • AI Compose    │  │   accounts      │  │ • Team     │ │
│  │ AI FEATURES     │  │   (50/mo)       │  │ • Unlimited AI  │  │   inbox    │ │
│  │ • 10 AI queries │  │ • Quick Replies │  │ • Mem0 Memory   │  │ • Shared   │ │
│  │ • Basic summary │  │ • Follow-up     │  │ • Document RAG  │  │   contacts │ │
│  │                 │  │   tracking      │  │ • CRM Intel     │  │ • Analytics│ │
│  │ LIMITS          │  │ • Deadlines     │  │ • Analytics     │  │ • Admin    │ │
│  │ • 1,000 emails  │  │                 │  │ • Priority      │  │   panel    │ │
│  │ • 100 contacts  │  │ LIMITS          │  │   support       │  │ • SSO/SAML │ │
│  │                 │  │ • 10,000 emails │  │                 │  │ • API      │ │
│  │                 │  │ • 1,000 contacts│  │ LIMITS          │  │            │ │
│  │                 │  │ • 1GB documents │  │ • Unlimited     │  │ Custom     │ │
│  │                 │  │                 │  │ • 10GB docs     │  │ limits     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └────────────┘ │
│                                                                                  │
│  Annual billing: 20% discount ($86/yr Starter, $182/yr Pro, $278/yr Team)       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Feature Matrix by Tier

| Feature | Free | Starter | Pro | Team |
|---------|------|---------|-----|------|
| **Email Accounts** | 1 | 3 | Unlimited | Unlimited |
| **Emails Synced** | 1,000 | 10,000 | Unlimited | Unlimited |
| **Contacts** | 100 | 1,000 | Unlimited | Unlimited |
| **Calendar Sync** | ✅ | ✅ | ✅ | ✅ |
| **Dark Mode** | ✅ | ✅ | ✅ | ✅ |
| **---AI FEATURES---** | | | | |
| **AI Queries/month** | 10 | 50 | Unlimited | Unlimited |
| **AI Compose** | ❌ | ✅ | ✅ | ✅ |
| **Quick Replies** | ❌ | ✅ | ✅ | ✅ |
| **Email Summarization** | Basic | ✅ | ✅ | ✅ |
| **Follow-up Tracking** | ❌ | ✅ | ✅ | ✅ |
| **Deadline Detection** | ❌ | ✅ | ✅ | ✅ |
| **---PREMIUM AI---** | | | | |
| **Mem0 Long-term Memory** | ❌ | ❌ | ✅ | ✅ |
| **Document Library (RAG)** | ❌ | ❌ | ✅ (10GB) | ✅ (50GB) |
| **CRM Intelligence** | ❌ | ❌ | ✅ | ✅ |
| **Analytics Dashboard** | ❌ | ❌ | ✅ | ✅ |
| **---PRODUCTIVITY---** | | | | |
| **Command Palette** | ✅ | ✅ | ✅ | ✅ |
| **Keyboard Shortcuts** | ✅ | ✅ | ✅ | ✅ |
| **Split Inbox** | ❌ | ✅ | ✅ | ✅ |
| **Daily Briefing** | ❌ | ❌ | ✅ | ✅ |
| **---TEAM---** | | | | |
| **Team Inbox** | ❌ | ❌ | ❌ | ✅ |
| **Shared Contacts** | ❌ | ❌ | ❌ | ✅ |
| **Team Analytics** | ❌ | ❌ | ❌ | ✅ |
| **Admin Panel** | ❌ | ❌ | ❌ | ✅ |
| **SSO/SAML** | ❌ | ❌ | ❌ | ✅ |
| **API Access** | ❌ | ❌ | ❌ | ✅ |
| **---SUPPORT---** | | | | |
| **Support** | Community | Email | Priority | Dedicated |
| **SLA** | ❌ | ❌ | ❌ | 99.9% |

### Pricing Psychology & Positioning

| Strategy | Implementation |
|----------|----------------|
| **Anchoring** | Show Team price ($29) first to make Pro ($19) look affordable |
| **Value Stacking** | List "Mem0 Memory" as "$XX value" to justify Pro tier |
| **Loss Aversion** | "Your AI forgets without Pro" - emphasize memory loss on downgrade |
| **Social Proof** | "Join 10,000+ professionals using PMSync Pro" |
| **Urgency** | "Lock in founding member pricing - 30% off for early adopters" |

### Revenue Projections

| Scenario | Users | Mix | MRR | ARR |
|----------|-------|-----|-----|-----|
| **Conservative** | 1,000 | 60% Free, 30% Starter, 10% Pro | $4,600 | $55,200 |
| **Moderate** | 5,000 | 50% Free, 35% Starter, 15% Pro | $30,050 | $360,600 |
| **Optimistic** | 10,000 | 40% Free, 35% Starter, 20% Pro, 5% Team | $85,150 | $1,021,800 |

### Implementation: Pricing Page UI

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│             Choose the plan that fits your workflow                             │
│                                                                                  │
│  ┌─────────┐  Monthly  ─────────────────────────────────────  Annual (Save 20%) │
│                                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │                  │  │   ⭐ POPULAR     │  │                  │              │
│  │ STARTER          │  │ PRO             │  │ TEAM             │              │
│  │                  │  │                  │  │                  │              │
│  │ $9               │  │ $19             │  │ $29              │              │
│  │ /month           │  │ /month           │  │ /user/month      │              │
│  │                  │  │                  │  │                  │              │
│  │ Perfect for      │  │ For power users │  │ For teams that   │              │
│  │ getting started  │  │ who want it all │  │ collaborate      │              │
│  │ with AI email    │  │                  │  │                  │              │
│  │                  │  │                  │  │                  │              │
│  │ ✓ 3 email accts  │  │ ✓ Unlimited     │  │ ✓ Everything in  │              │
│  │ ✓ AI Compose     │  │   accounts      │  │   Pro, plus:     │              │
│  │ ✓ Quick Replies  │  │ ✓ Unlimited AI  │  │ ✓ Team inbox     │              │
│  │ ✓ Follow-ups     │  │ ✓ AI Memory     │  │ ✓ Shared CRM     │              │
│  │ ✓ Deadlines      │  │ ✓ Document RAG  │  │ ✓ Admin panel    │              │
│  │                  │  │ ✓ CRM Intel     │  │ ✓ SSO/SAML       │              │
│  │                  │  │ ✓ Daily Brief   │  │ ✓ API access     │              │
│  │                  │  │                  │  │                  │              │
│  │ [Start Free →]   │  │ [Start Trial →] │  │ [Contact Sales]  │              │
│  │                  │  │                  │  │                  │              │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘              │
│                                                                                  │
│  🎁 Free tier available - Start with 10 AI queries/month, no credit card       │
│                                                                                  │
│  ───────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  💬 "PMSync Pro paid for itself in the first week. The AI memory feature       │
│      alone saves me 2 hours daily."                                             │
│      — Sarah M., Product Manager                                                │
│                                                                                  │
│  ───────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  ❓ FAQs                                                                        │
│  • Can I change plans anytime? Yes, upgrade/downgrade instantly                │
│  • What happens to my AI memory if I downgrade? Preserved for 30 days          │
│  • Is there a free trial? 14-day Pro trial, no credit card required            │
│  • Do you offer student/nonprofit discounts? Yes, 50% off with verification    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Backend: Usage Tracking & Limits

```typescript
// backend/src/modules/billing/usage.service.ts

interface UsageLimits {
  tier: 'free' | 'starter' | 'pro' | 'team';
  limits: {
    emailAccounts: number;
    emailsStored: number;
    contacts: number;
    aiQueriesPerMonth: number;
    documentStorageGb: number;
  };
}

const TIER_LIMITS: Record<string, UsageLimits['limits']> = {
  free: {
    emailAccounts: 1,
    emailsStored: 1000,
    contacts: 100,
    aiQueriesPerMonth: 10,
    documentStorageGb: 0,
  },
  starter: {
    emailAccounts: 3,
    emailsStored: 10000,
    contacts: 1000,
    aiQueriesPerMonth: 50,
    documentStorageGb: 1,
  },
  pro: {
    emailAccounts: -1, // Unlimited
    emailsStored: -1,
    contacts: -1,
    aiQueriesPerMonth: -1,
    documentStorageGb: 10,
  },
  team: {
    emailAccounts: -1,
    emailsStored: -1,
    contacts: -1,
    aiQueriesPerMonth: -1,
    documentStorageGb: 50,
  },
};

@Injectable()
export class UsageService {
  async checkLimit(
    tenantId: string,
    resource: keyof UsageLimits['limits'],
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    const tenant = await this.getTenant(tenantId);
    const limits = TIER_LIMITS[tenant.tier];
    const limit = limits[resource];

    if (limit === -1) return { allowed: true, current: 0, limit: -1 };

    const current = await this.getCurrentUsage(tenantId, resource);
    return { allowed: current < limit, current, limit };
  }

  async trackAiQuery(tenantId: string, tokens: number): Promise<void> {
    await this.prisma.usageLog.create({
      data: { tenantId, type: 'AI_QUERY', tokens, createdAt: new Date() },
    });
  }
}
```

### Pricing Page Route

```text
/pricing                    # Main pricing page
/pricing/compare            # Detailed feature comparison
/pricing/enterprise         # Custom enterprise contact form
/pricing/calculator         # ROI calculator (time saved)
```

---

## Part 0.6: Billing API Selection

> **Purpose:** Choose the best billing infrastructure for PMSync's pricing tiers.

### Billing API Comparison

| Feature | [Autumn](https://useautumn.com/) | [Stripe Billing](https://stripe.com/billing) | [Paddle](https://paddle.com/) |
|---------|--------|----------------|--------|
| **Pricing Model** | Free until $8K MRR, then flat fee | 2.9% + $0.30 + extras | 5% + $0.50 |
| **Merchant of Record** | No (uses Stripe) | No (you handle taxes) | Yes (handles everything) |
| **Tax Compliance** | Via Stripe Tax | Extra cost | Included |
| **Usage-Based Billing** | ✅ Native | ✅ Complex setup | ✅ Supported |
| **Credits System** | ✅ Native | ❌ Custom code | ❌ Custom code |
| **Seat-Based Pricing** | ✅ Native | ✅ Supported | ✅ Supported |
| **Hybrid Models** | ✅ Easy | ⚠️ Complex | ✅ Supported |
| **Open Source** | ✅ Yes | ❌ No | ❌ No |
| **SDK Quality** | ✅ Modern (React/Next.js) | ✅ Excellent | ⚠️ Basic |
| **Webhook Handling** | ✅ Automatic | ❌ Manual | ✅ Automatic |
| **AI Startups Focus** | ✅ Designed for AI | ❌ Generic | ❌ Generic |

### Recommendation: Autumn + Stripe

**Why Autumn is perfect for PMSync:**

1. **AI-First Design** - Built specifically for AI startups with usage-based + credits models
2. **Simple API** - Just 3 functions: `attach`, `check`, `track`
3. **No Webhooks** - Autumn handles subscription state automatically
4. **Credits Support** - Native AI query credits (exactly what we need)
5. **Free Start** - No fees until $8K MRR
6. **Open Source** - Can self-host if needed
7. **React/Next.js SDK** - Perfect for our stack

### Autumn Integration Architecture

```typescript
// lib/billing/autumn.ts
import Autumn from 'autumn-js';

export const autumn = new Autumn({
  apiKey: process.env.AUTUMN_API_KEY,
});

// Pricing tiers configuration (managed in Autumn dashboard)
export const PRODUCTS = {
  FREE: 'free_tier',
  STARTER: 'starter_tier',
  PRO: 'pro_tier',
  TEAM: 'team_tier',
};

export const FEATURES = {
  AI_QUERIES: 'ai_queries',
  EMAIL_ACCOUNTS: 'email_accounts',
  DOCUMENT_STORAGE: 'document_storage',
  MEM0_MEMORY: 'mem0_memory',
  CRM_INTELLIGENCE: 'crm_intelligence',
  DAILY_BRIEFING: 'daily_briefing',
};
```

### Implementation: Key API Calls

```typescript
// 1. ATTACH - Handle all purchase flows
// backend/src/modules/billing/billing.service.ts

@Injectable()
export class BillingService {
  // Upgrade/downgrade/checkout
  async createCheckout(tenantId: string, productId: string) {
    const result = await autumn.attach({
      customer_id: tenantId,
      product_id: productId,
      success_url: `${process.env.APP_URL}/dashboard?upgrade=success`,
      cancel_url: `${process.env.APP_URL}/pricing`,
    });

    return result; // Returns Stripe Checkout URL or handles upgrade
  }
}

// 2. CHECK - Verify feature access
// Used in guards and API endpoints

@Injectable()
export class FeatureGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user.tenantId;
    const feature = this.reflector.get('feature', context.getHandler());

    const access = await autumn.check({
      customer_id: tenantId,
      feature_id: feature,
    });

    if (!access.allowed) {
      throw new ForbiddenException({
        code: 'FEATURE_LIMIT',
        message: `Upgrade to access ${feature}`,
        current: access.current,
        limit: access.limit,
      });
    }

    return true;
  }
}

// 3. TRACK - Record usage events
// Called when user uses AI features

async trackAiQuery(tenantId: string, tokens: number) {
  await autumn.track({
    customer_id: tenantId,
    feature_id: 'ai_queries',
    value: 1, // Count as 1 query
    metadata: { tokens },
  });
}

async trackDocumentStorage(tenantId: string, bytesUsed: number) {
  await autumn.track({
    customer_id: tenantId,
    feature_id: 'document_storage',
    value: bytesUsed,
    delta: true, // Add to current usage
  });
}
```

### Frontend Integration (React/Next.js)

```tsx
// components/billing/UpgradeButton.tsx
import { AttachDialog } from 'autumn-js/react';

export function UpgradeButton({ currentTier, targetTier }: Props) {
  return (
    <AttachDialog
      productId={targetTier}
      trigger={
        <Button variant="primary">
          Upgrade to {targetTier}
        </Button>
      }
      onSuccess={() => {
        toast.success('Subscription updated!');
        router.refresh();
      }}
    />
  );
}

// hooks/use-feature-access.ts
import { useAutumn } from 'autumn-js/react';

export function useFeatureAccess(featureId: string) {
  const { check } = useAutumn();

  const { data, isLoading } = useQuery({
    queryKey: ['feature-access', featureId],
    queryFn: () => check({ feature_id: featureId }),
  });

  return {
    hasAccess: data?.allowed ?? false,
    current: data?.current ?? 0,
    limit: data?.limit ?? 0,
    isLoading,
  };
}

// Usage in component
function AiChatInput() {
  const { hasAccess, current, limit } = useFeatureAccess('ai_queries');

  if (!hasAccess) {
    return (
      <UpgradePrompt
        message={`You've used ${current}/${limit} AI queries this month`}
        targetTier="starter"
      />
    );
  }

  return <ChatInput onSend={handleSend} />;
}
```

### Usage Display Component

```tsx
// components/billing/UsageDisplay.tsx
import { useAutumn } from 'autumn-js/react';

export function UsageDisplay() {
  const { usage } = useAutumn();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage This Month</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <UsageBar
            label="AI Queries"
            current={usage.ai_queries?.current ?? 0}
            limit={usage.ai_queries?.limit ?? 0}
            icon={<Sparkles />}
          />
          <UsageBar
            label="Document Storage"
            current={formatBytes(usage.document_storage?.current ?? 0)}
            limit={formatBytes(usage.document_storage?.limit ?? 0)}
            icon={<FileText />}
          />
          <UsageBar
            label="Email Accounts"
            current={usage.email_accounts?.current ?? 0}
            limit={usage.email_accounts?.limit ?? 0}
            icon={<Mail />}
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

### Autumn Dashboard Configuration

```yaml
# Products defined in Autumn dashboard
products:
  - id: free_tier
    name: Free
    price: 0
    features:
      - id: ai_queries
        limit: 10
        reset: monthly
      - id: email_accounts
        limit: 1
      - id: contacts
        limit: 100
      - id: emails_stored
        limit: 1000

  - id: starter_tier
    name: Starter
    price: 900 # $9/mo in cents
    features:
      - id: ai_queries
        limit: 50
        reset: monthly
      - id: email_accounts
        limit: 3
      - id: contacts
        limit: 1000
      - id: emails_stored
        limit: 10000
      - id: document_storage
        limit: 1073741824 # 1GB in bytes
      - id: follow_ups
        access: true
      - id: deadlines
        access: true
      - id: split_inbox
        access: true

  - id: pro_tier
    name: Pro
    price: 1900 # $19/mo
    features:
      - id: ai_queries
        limit: -1 # Unlimited
      - id: email_accounts
        limit: -1
      - id: contacts
        limit: -1
      - id: emails_stored
        limit: -1
      - id: document_storage
        limit: 10737418240 # 10GB
      - id: mem0_memory
        access: true
      - id: crm_intelligence
        access: true
      - id: daily_briefing
        access: true
      - id: analytics
        access: true

  - id: team_tier
    name: Team
    price: 2900 # $29/user/mo
    seat_based: true
    features:
      - id: ai_queries
        limit: -1
      - id: email_accounts
        limit: -1
      - id: document_storage
        limit: 53687091200 # 50GB
      - id: team_inbox
        access: true
      - id: shared_contacts
        access: true
      - id: admin_panel
        access: true
      - id: sso_saml
        access: true
      - id: api_access
        access: true
```

### Migration Path

If we later need Merchant of Record (tax handling), we can:

1. **Keep Autumn** - Use Stripe Tax integration (extra ~0.5%)
2. **Switch to Paddle** - Higher fees (5%) but zero tax burden
3. **Self-host Autumn** - It's open source, full control

### Implementation Timeline

| Task | Effort | Priority |
|------|--------|----------|
| Set up Autumn account + Stripe | 1h | P0 |
| Configure products in dashboard | 2h | P0 |
| Implement `BillingService` backend | 4h | P0 |
| Add `FeatureGuard` for access control | 4h | P0 |
| Track AI usage in VoltAgent | 2h | P0 |
| Build pricing page UI | 8h | P1 |
| Add usage display in settings | 4h | P1 |
| Implement upgrade prompts | 4h | P1 |
| Add billing management page | 6h | P2 |

---

## Executive Summary

PMSync has a **powerful backend** with advanced AI capabilities (VoltAgent, Mem0, CRM Intelligence) that are **underexposed in the frontend**. This audit identifies:

1. **Feature Gaps**: 60% of backend capabilities lack proper frontend exposure
2. **Competitor Analysis**: How Superhuman, Spark, Spike position similar features
3. **UI/UX Improvements**: 2025 best practices for email + AI applications
4. **Implementation Priority**: What to build first for maximum user impact

**Current State:** Backend 9.5/10, Frontend exposure 4/10
**Target State:** Full feature parity with best-in-class UX

---

## Part 1: Competitor Analysis

### 1.1 Market Leaders Comparison

| Feature | PMSync (Backend) | PMSync (Frontend) | Superhuman | Spark | Spike | Mailbird |
|---------|-----------------|-------------------|------------|-------|-------|----------|
| **AI Email Composition** | ✅ Full | ⚠️ Basic chat | ✅ Inline | ✅ Templates | ✅ Basic | ❌ |
| **Email Summarization** | ✅ Full | ⚠️ Via chat | ✅ Auto | ✅ Smart | ✅ Basic | ❌ |
| **Smart Reply Suggestions** | ✅ Full | ❌ Hidden | ✅ Triage | ✅ +AI | ✅ Basic | ❌ |
| **Follow-up Reminders** | ✅ Full | ❌ None | ✅ Split inbox | ✅ Smart | ❌ | ❌ |
| **Deadline Detection** | ✅ Full | ❌ None | ❌ | ❌ | ❌ | ❌ |
| **CRM/Contact Intelligence** | ✅ Full | ❌ None | ✅ Social | ⚠️ Basic | ✅ Full | ❌ |
| **Long-term Memory** | ✅ Mem0 | ❌ None | ❌ | ❌ | ❌ | ❌ |
| **Multi-Agent System** | ✅ VoltAgent | ⚠️ Basic | ❌ | ❌ | ❌ | ❌ |
| **Analytics/Visualization** | ✅ Full | ❌ None | ✅ Insights | ⚠️ Basic | ❌ | ❌ |
| **Document Library (RAG)** | ✅ Full | ❌ None | ❌ | ❌ | ❌ | ❌ |
| **Keyboard Shortcuts** | ❌ None | ❌ None | ✅ Vim-like | ✅ Basic | ❌ | ✅ Basic |
| **Unified Search** | ✅ Full | ❌ None | ✅ Instant | ✅ Good | ✅ Basic | ✅ Basic |
| **Conversational View** | ✅ Backend | ⚠️ Basic | ✅ Native | ✅ Native | ✅ Chat | ✅ Native |
| **Split Inbox/Triage** | ✅ Backend | ❌ None | ✅ Core | ✅ Priority | ✅ Priority | ❌ |

### 1.2 Key Differentiators PMSync Has (But Doesn't Show)

1. **Mem0 Long-Term Memory** - NO competitor has this
   - Remembers user preferences across sessions
   - Learns writing style, contact relationships
   - **Frontend Status:** Zero UI exposure

2. **VoltAgent Multi-Agent System** - Unique in market
   - Supervisor → Email/Calendar/Task agents
   - Pending action approval workflow
   - **Frontend Status:** Basic chat only, no agent visualization

3. **CRM Intelligence** - Better than Superhuman
   - Relationship health scoring
   - Stale contact alerts
   - Reconnect recommendations
   - **Frontend Status:** Not exposed at all

4. **RAG Document Library** - Enterprise-grade
   - Upload documents for AI context
   - Search across personal knowledge base
   - **Frontend Status:** API exists, no UI

5. **Deadline & Follow-up Tracking** - AI-powered
   - Auto-detects deadlines from emails
   - Tracks unanswered questions
   - **Frontend Status:** Zero exposure

### 1.3 What Competitors Do Better (UX Patterns to Adopt)

#### Superhuman UX Patterns
- **Cmd+K Command Palette**: Instant access to all actions
- **Split Inbox**: Important/Other/Notifications automatic sorting
- **Inline AI**: One-click summarize, reply suggestions in email view
- **Keyboard-first**: Vim-like navigation (j/k/l/h)
- **Snippets**: Quick-insert templates with variables
- **Read Statuses**: Know when emails are read

#### Spark UX Patterns
- **Smart Inbox**: AI-sorted priority view
- **Gatekeeper**: Blocks newsletters, surfaces important
- **Quick Replies**: Suggested responses at bottom of emails
- **Home Screen Widget**: At-a-glance stats

#### Spike UX Patterns
- **Conversational Email**: Chat-like interface
- **Priority Inbox**: AI-ranked importance
- **Groups**: Team collaboration built-in
- **Notes**: Attach notes to emails

---

## Part 2: Backend Feature → Frontend Mapping

### 2.1 Critical Missing UI Components

| Backend Feature | API Endpoint | Required Frontend Component | Priority |
|----------------|--------------|---------------------------|----------|
| **Follow-up Tracking** | `GET /api/v1/voltagent/followups` | Follow-ups Widget in Dashboard | P0 |
| **Deadline Alerts** | `GET /api/v1/voltagent/deadlines` | Deadlines Timeline Component | P0 |
| **Stale Contacts** | `GET /api/v1/crm/stale-contacts` | CRM Alerts Panel | P0 |
| **Contact Scoring** | `GET /api/v1/crm/contacts/:id/score` | Contact Health Badge | P1 |
| **Reconnect Suggestions** | `GET /api/v1/crm/reconnect-candidates` | Reconnect Widget | P1 |
| **Relationship Graph** | `GET /api/v1/crm/relationship-graph` | Network Visualization | P2 |
| **Long-term Memory** | `GET /api/v1/voltagent/memories` | Memory Browser Panel | P1 |
| **Memory Search** | `POST /api/v1/voltagent/knowledge/search` | Unified Search Modal | P0 |
| **Document Library** | `GET /api/v1/document-library/libraries` | Document Manager Page | P1 |
| **RAG Queries** | `POST /api/v1/document-library/query` | AI Context Panel | P1 |
| **Analytics Visualization** | `POST /api/v1/voltagent/analytics/visualize` | Analytics Dashboard | P1 |
| **Email Analytics** | `GET /api/v1/voltagent/analytics/email` | Email Insights Widget | P1 |
| **Action Items** | `GET /api/v1/voltagent/action-items` | Tasks Integration | P1 |
| **Daily Briefing** | `GET /api/v1/voltagent/briefing` | Morning Briefing Modal | P0 |

### 2.2 New Pages/Routes Required

```
/dashboard
├── /ai                    # Existing - needs enhancement
│   ├── /memories         # NEW: Memory browser
│   ├── /documents        # NEW: Document library
│   └── /analytics        # NEW: AI analytics dashboard
├── /email                 # Existing - needs inline AI
├── /calendar             # Existing
├── /contacts             # Existing - needs CRM intelligence
│   └── /[id]             # Contact detail with relationship score
├── /tasks                # NEW: Action items + deadlines
└── /insights             # NEW: Unified analytics
```

### 2.3 Component Architecture for Missing Features

```
components/
├── ai/
│   ├── InlineAISuggestions.tsx    # Quick reply/summarize in email view
│   ├── MemoryBrowser.tsx          # View/search/delete memories
│   ├── DocumentLibrary.tsx        # Upload/manage documents
│   ├── UnifiedSearch.tsx          # Cmd+K search across all
│   ├── DailyBriefing.tsx          # Morning briefing modal
│   └── AnalyticsDashboard.tsx     # AI-generated visualizations
├── crm/
│   ├── ContactHealthBadge.tsx     # Relationship score indicator
│   ├── StaleContactsAlert.tsx     # Warning for neglected contacts
│   ├── ReconnectWidget.tsx        # Suggested reconnections
│   └── RelationshipGraph.tsx      # D3 network visualization
├── productivity/
│   ├── FollowUpTracker.tsx        # Pending follow-ups list
│   ├── DeadlineTimeline.tsx       # Upcoming deadlines
│   ├── ActionItemsList.tsx        # Extracted tasks
│   └── SplitInbox.tsx             # Important/Other/Later
└── common/
    ├── CommandPalette.tsx         # Cmd+K actions
    ├── KeyboardShortcuts.tsx      # Global shortcuts
    └── QuickActions.tsx           # Contextual actions
```

---

## Part 3: UI/UX Improvement Plan

### 3.1 Dashboard Redesign (Home Page)

**Current State:** Basic stats + email list + AI hub link
**Target State:** Command center with all AI insights visible

#### New Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Command Palette (Cmd+K always accessible)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DAILY BRIEFING (AI-generated morning summary)                        │   │
│  │ "Good morning David! You have 3 urgent emails, 2 deadlines today,   │   │
│  │  and 5 contacts you haven't talked to in 60+ days."                 │   │
│  │  [Dismiss] [Show Details]                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐   │
│  │ PRIORITY INBOX       │  │ DEADLINES            │  │ FOLLOW-UPS      │   │
│  │ ┌─────────────────┐  │  │ • Dec 17: Report due │  │ • John (3 days) │   │
│  │ │ ⭐ Urgent (3)   │  │  │ • Dec 18: Meeting    │  │ • Sarah (5 days)│   │
│  │ │ 📧 Important(12)│  │  │ • Dec 20: Proposal   │  │ • Mike (7 days) │   │
│  │ │ 📬 Other (45)   │  │  └──────────────────────┘  └─────────────────┘   │
│  │ └─────────────────┘  │                                                   │
│  └──────────────────────┘  ┌──────────────────────┐  ┌─────────────────┐   │
│                            │ CRM ALERTS           │  │ AI ACTIONS      │   │
│  ┌──────────────────────┐  │ ⚠️ 5 stale contacts  │  │ 3 pending       │   │
│  │ TODAY'S EVENTS       │  │ 💡 3 reconnect ideas │  │ [Review →]      │   │
│  │ 09:00 Team standup   │  │ 📊 Relationship: 78% │  └─────────────────┘   │
│  │ 14:00 Client call    │  └──────────────────────┘                        │
│  └──────────────────────┘                                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Email View Enhancement (Inline AI)

**Current State:** Email view with separate AI chat
**Target State:** Inline AI actions on every email

#### Enhanced Email View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ From: john@company.com                            Dec 15, 2025 • 10:30 AM   │
│ Subject: Project deadline confirmation needed                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 🤖 AI INSIGHTS (auto-generated)                              [Hide] │    │
│ │ • Deadline detected: December 20, 2025                              │    │
│ │ • Follow-up suggested: Response needed within 3 days                │    │
│ │ • Contact health: John Smith (Score: 85/100, Last: 2 days ago)      │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ Hi David,                                                                    │
│                                                                              │
│ Just wanted to confirm the project deadline is December 20th.                │
│ Can you please send the final report by Friday?                             │
│                                                                              │
│ Best,                                                                        │
│ John                                                                         │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 💬 QUICK REPLIES (AI-generated)                                     │    │
│ │ [Confirm deadline] [Request extension] [Ask for details]            │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ ⚡ ACTIONS: [Reply] [Forward] [Archive] [📝 Create Task] [📅 Add   │    │
│ │             to Calendar] [🔔 Set Reminder] [✨ AI Compose]          │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Command Palette (Cmd+K)

**Inspired by:** Superhuman, Linear, Notion

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔍  Type a command or search...                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ RECENT                                                                       │
│   📧 Compose new email                                          ⌘ + N       │
│   🔍 Search emails                                              ⌘ + F       │
│   ✨ AI: Summarize selected                                     ⌘ + S       │
│                                                                              │
│ AI ACTIONS                                                                   │
│   ✨ AI: Compose with context                                               │
│   📊 AI: Generate email report                                              │
│   🧠 AI: Search memories                                                    │
│   📚 AI: Query documents                                                    │
│                                                                              │
│ NAVIGATION                                                                   │
│   📬 Go to Inbox                                                ⌘ + 1       │
│   📅 Go to Calendar                                             ⌘ + 2       │
│   👥 Go to Contacts                                             ⌘ + 3       │
│   🤖 Go to AI Assistant                                         ⌘ + 4       │
│                                                                              │
│ PRODUCTIVITY                                                                 │
│   📋 View pending follow-ups                                                │
│   ⏰ View deadlines                                                         │
│   ✅ View action items                                                      │
│   👥 View stale contacts                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Contact Detail Enhancement (CRM Intelligence)

**Current State:** Basic contact info
**Target State:** Full relationship intelligence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────┐                                                          │
│ │                │  John Smith                                               │
│ │     Avatar     │  john@company.com • Acme Corp                            │
│ │                │  📞 +1 555-0123 • 🌐 linkedin.com/in/johnsmith           │
│ └────────────────┘                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ RELATIONSHIP HEALTH                                          85/100 │    │
│ │ ████████████████████████░░░░                                        │    │
│ │ Strong relationship • Frequent communication • Good reciprocity     │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐      │
│ │ LAST CONTACT    │  │ EMAILS          │  │ AI INSIGHTS             │      │
│ │ 2 days ago      │  │ 47 total        │  │ • Prefers morning calls │      │
│ │ Email received  │  │ 23 sent / 24 in │  │ • Quick responder       │      │
│ └─────────────────┘  └─────────────────┘  │ • Budget decision maker │      │
│                                            └─────────────────────────┘      │
│                                                                              │
│ INTERACTION TIMELINE                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ Dec 14 • Email received: "Project update"                           │    │
│ │ Dec 12 • Email sent: "Proposal v2"                                  │    │
│ │ Dec 10 • Calendar: Client meeting (45 min)                          │    │
│ │ Dec 5  • Email received: "Initial inquiry"                          │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ CONNECTED CONTACTS (Relationship Graph)                                      │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │        [Sarah] ─── [John] ─── [Mike]                                │    │
│ │           │          │          │                                    │    │
│ │        [Lisa]     [David]    [Tom]                                  │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ QUICK ACTIONS                                                                │
│ [📧 Send Email] [📅 Schedule Meeting] [📋 Create Task] [🔔 Set Reminder]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 AI Analytics Dashboard (New Page)

```
/dashboard/ai/analytics

┌─────────────────────────────────────────────────────────────────────────────┐
│ AI ANALYTICS DASHBOARD                                   [This Week ▼]      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│ │ EMAIL VOLUME TRENDS         │  │ RESPONSE TIME ANALYSIS              │   │
│ │ [Line chart: sent vs recv]  │  │ [Bar chart: by day of week]         │   │
│ │                             │  │                                      │   │
│ │ 📈 +12% from last week     │  │ ⏱️ Avg: 2.3 hours                   │   │
│ └─────────────────────────────┘  └─────────────────────────────────────┘   │
│                                                                              │
│ ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│ │ TOP CORRESPONDENTS          │  │ AI INSIGHTS                         │   │
│ │ 1. john@company.com (47)    │  │ • Peak email time: 10am-12pm        │   │
│ │ 2. sarah@startup.io (32)    │  │ • Most emails on Tuesday            │   │
│ │ 3. mike@client.com (28)     │  │ • 89% emails answered same day      │   │
│ └─────────────────────────────┘  └─────────────────────────────────────┘   │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ AI MEMORY STATISTICS                                                 │    │
│ │ Total memories: 247 | Categories: Preferences (89), Facts (103),    │    │
│ │ Contacts (55) | Most accessed: Writing style preferences            │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ ASK AI: [Generate custom report...                              ] [Ask]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Implementation Priority

### Phase 1: Quick Wins (Week 1-2)

These require minimal UI changes but expose existing functionality:

| Feature | Effort | Impact | Files to Modify |
|---------|--------|--------|-----------------|
| Command Palette (Cmd+K) | 8h | High | New component + Layout |
| Inline AI Insights on Email | 6h | High | Mailbox.tsx, email detail |
| Follow-up Widget on Dashboard | 4h | High | Dashboard.tsx |
| Deadline Widget on Dashboard | 4h | High | Dashboard.tsx |
| Keyboard Shortcuts (j/k/l) | 4h | Medium | New hook + email list |

### Phase 2: Core Features (Week 3-4)

| Feature | Effort | Impact | Files to Create |
|---------|--------|--------|-----------------|
| Daily Briefing Modal | 8h | High | DailyBriefing.tsx |
| Split Inbox (Important/Other) | 12h | High | SplitInbox.tsx |
| CRM Alerts Panel | 6h | High | StaleContactsAlert.tsx |
| Contact Health Badge | 4h | Medium | ContactHealthBadge.tsx |
| Quick Reply Suggestions | 8h | High | QuickReplies.tsx |

### Phase 3: Differentiation (Week 5-6)

| Feature | Effort | Impact | Files to Create |
|---------|--------|--------|-----------------|
| Memory Browser | 12h | Medium | MemoryBrowser.tsx |
| Document Library UI | 16h | Medium | DocumentLibrary.tsx |
| Analytics Dashboard | 12h | Medium | AnalyticsDashboard.tsx |
| Relationship Graph | 16h | Low | RelationshipGraph.tsx (D3) |
| Unified Search | 8h | High | UnifiedSearch.tsx |

---

## Part 5: Technical Specifications

### 5.1 API Hooks Required

```typescript
// hooks/use-followups.ts
export function useFollowUps() {
  return useQuery({
    queryKey: ['followups', 'pending'],
    queryFn: () => voltagentApi.getFollowUps({ status: 'pending' }),
    refetchInterval: 60000, // Refresh every minute
  });
}

// hooks/use-deadlines.ts
export function useDeadlines(days = 7) {
  return useQuery({
    queryKey: ['deadlines', days],
    queryFn: () => voltagentApi.getDeadlines({ days }),
    refetchInterval: 300000, // Refresh every 5 minutes
  });
}

// hooks/use-crm-alerts.ts
export function useCrmAlerts() {
  return useQuery({
    queryKey: ['crm', 'alerts'],
    queryFn: () => crmApi.getStaleContacts({ days: 60 }),
  });
}

// hooks/use-daily-briefing.ts
export function useDailyBriefing() {
  return useQuery({
    queryKey: ['briefing', 'today'],
    queryFn: () => voltagentApi.getDailyBriefing(),
    staleTime: 3600000, // Cache for 1 hour
  });
}

// hooks/use-command-palette.ts
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useHotkeys('mod+k', () => setOpen(true));

  return { open, setOpen };
}
```

### 5.2 State Management Updates

```typescript
// stores/ai-store.ts - Add to existing store
interface AiState {
  // Existing
  messages: Message[];
  isStreaming: boolean;

  // NEW: Feature exposure
  followUps: FollowUp[];
  deadlines: Deadline[];
  memories: Memory[];
  dailyBriefing: Briefing | null;
  crmAlerts: CrmAlert[];

  // Actions
  loadFollowUps: () => Promise<void>;
  loadDeadlines: () => Promise<void>;
  loadDailyBriefing: () => Promise<void>;
}
```

### 5.3 New API Client Methods

```typescript
// lib/api/voltagent.ts - Add to existing
export const voltagentApi = {
  // Existing methods...

  // NEW: Feature exposure
  getFollowUps: (params) => apiClient.get('/api/v1/voltagent/followups', { params }),
  getDeadlines: (params) => apiClient.get('/api/v1/voltagent/deadlines', { params }),
  getDailyBriefing: () => apiClient.get('/api/v1/voltagent/briefing'),
  getMemories: (params) => apiClient.get('/api/v1/voltagent/memories', { params }),
  searchKnowledge: (query) => apiClient.post('/api/v1/voltagent/knowledge/search', { query }),
  getAnalytics: (type, period) => apiClient.get(`/api/v1/voltagent/analytics/${type}`, { params: { period } }),
};
```

---

## Part 6: Success Metrics

### 6.1 Feature Adoption Targets

| Feature | Target (30 days) | Measurement |
|---------|------------------|-------------|
| Command Palette usage | 50% daily active users | Analytics events |
| Inline AI suggestions clicked | 30% of email views | Click tracking |
| Follow-ups resolved | 60% resolution rate | Database tracking |
| Deadlines tracked | 80% auto-detection rate | API logs |
| CRM alerts acted upon | 40% action rate | User actions |
| Daily briefing views | 70% of morning sessions | Analytics |

### 6.2 UX Improvement Targets

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Time to compose email | Unknown | -30% | Session analytics |
| Keyboard navigation adoption | 0% | 40% | Shortcut usage |
| AI feature discovery | Low | 80% | Feature interaction |
| Email response time | Unknown | -20% | Email timestamps |

---

## Part 7: Visual Design System Updates

### 7.1 AI Feature Color Palette

```scss
// AI-specific colors to add to theme
$ai-primary: #7c3aed;      // Purple - AI actions
$ai-secondary: #10b981;    // Green - Success/Positive
$ai-warning: #f59e0b;      // Amber - Attention needed
$ai-danger: #ef4444;       // Red - Urgent
$ai-info: #3b82f6;         // Blue - Informational

// Gradient for AI components
$ai-gradient: linear-gradient(135deg, $ai-primary 0%, #a855f7 100%);
```

### 7.2 Component Design Tokens

```typescript
// Add to theme/aiComponents.ts
export const aiComponentStyles = {
  insight: {
    borderRadius: '12px',
    padding: '12px 16px',
    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
    border: '1px solid rgba(124, 58, 237, 0.2)',
  },
  quickAction: {
    borderRadius: '8px',
    padding: '8px 12px',
    transition: 'all 0.2s ease',
    '&:hover': {
      background: 'rgba(124, 58, 237, 0.1)',
      transform: 'translateY(-1px)',
    },
  },
  badge: {
    background: '$ai-gradient',
    color: 'white',
    fontWeight: 600,
    borderRadius: '6px',
    padding: '2px 8px',
  },
};
```

---

## Conclusion

PMSync has a **world-class backend** with features that **no competitor offers** (Mem0 memory, VoltAgent multi-agent, CRM Intelligence). The frontend currently exposes only ~40% of these capabilities.

**Immediate Actions:**
1. Add Command Palette (Cmd+K) - Day 1
2. Add Inline AI Insights to email view - Day 2-3
3. Add Follow-up & Deadline widgets to dashboard - Day 4-5
4. Add Daily Briefing modal - Day 6-7

**Expected Impact:**
- 3x increase in AI feature usage
- Competitive feature parity with Superhuman
- Unique differentiation through memory + CRM

---

*Generated: December 16, 2025*
*Last Updated: December 16, 2025*
