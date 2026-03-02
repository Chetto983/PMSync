# MailAgent → Enterprise CRM AI Platform
## Frontend Architecture Audit & Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-02
**Classification:** Internal — CTO/VP Product
**Scope:** Frontend only (`D:\MailAgent\frontend`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Frontend Architecture Overview](#2-current-frontend-architecture-overview)
3. [Target Vision: Enterprise CRM AI Platform](#3-target-vision-enterprise-crm-ai-platform)
4. [Gap Analysis (Current vs Target)](#4-gap-analysis-current-vs-target)
5. [Key Risks & Risk Matrix](#5-key-risks--risk-matrix)
6. [Multi-Tenancy & RBAC Requirements](#6-multi-tenancy--rbac-requirements)
7. [AI Layer Requirements](#7-ai-layer-requirements)
8. [Observability & Admin Dashboards Requirements](#8-observability--admin-dashboards-requirements)
9. [Design System & White-Label Strategy](#9-design-system--white-label-strategy)
10. [Accessibility & i18n Requirements](#10-accessibility--i18n-requirements)
11. [Security & Compliance Requirements](#11-security--compliance-requirements)
12. [Performance Budget & Optimization Plan](#12-performance-budget--optimization-plan)
13. [Recommended Target Architecture](#13-recommended-target-architecture)
14. [Phased Roadmap](#14-phased-roadmap)
15. [KPIs/OKRs](#15-kpisokrs)
16. [Open Questions / Assumptions](#16-open-questions--assumptions)

---

## 1. Executive Summary

MailAgent is a functional AI-powered email client with calendar, contacts, and an agentic AI assistant. The frontend is built on **Next.js 16 (Pages Router)**, **React 19**, **MUI v7 + Tailwind v4 (dual system)**, **TanStack Query v5**, **Zustand v5**, and **Vercel AI SDK v6**. It supports two locales (EN/IT), dark mode, MFA (TOTP + Passkeys), WebSocket real-time, and virtual-scrolled lists.

**It is NOT an enterprise CRM platform.** The gap is substantial:

| Dimension | Current State | Enterprise Target |
|-----------|--------------|-------------------|
| CRM Entities | Contacts only | Accounts, Deals, Tickets, Pipelines, Activities |
| Multi-Tenancy | Opaque (backend-only) | Org switcher, workspace isolation, tenant theming |
| RBAC | Zero client enforcement | Route/component/action-level permission gates |
| Admin Console | None | User provisioning, role editor, audit logs, SSO config |
| AI Explainability | Partial (reasoning traces) | Full provenance, confidence scores, cost-per-run |
| Observability | None | Agent run dashboards, error analytics, cost burn-down |
| White-Label | None | Per-tenant theme tokens, logo, domain |
| Test Coverage | ~1.4% component tests | 80%+ unit, 60%+ E2E critical paths |
| Security | JWT in localStorage, no CSP | httpOnly cookies, CSP, server-side route guard |

**Bottom line:** The AI layer is surprisingly mature (HITL, tool renderers, agent traces, smart compose). The CRM and enterprise infrastructure layers are nearly absent. The dual styling system (MUI + Tailwind) is the single largest architectural liability for velocity.

---

## 2. Current Frontend Architecture Overview

### 2.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (Pages Router) | 16.1.6 |
| UI Library | React | 19.2.4 |
| Language | TypeScript (strict) | 5.9.3 |
| Component Library A | MUI (Material UI) | 7.3.7 |
| Component Library B | Radix UI (shadcn wrappers) | 1.x–2.x |
| Styling A | Tailwind CSS | 4.1.18 |
| Styling B | Emotion (MUI runtime) | 11.14.x |
| Server State | TanStack Query | 5.90.20 |
| Client State | Zustand | 5.0.11 |
| HTTP | Axios | 1.13.5 |
| AI SDK | Vercel AI SDK + @ai-sdk/react | 6.0.77 / 3.0.79 |
| Rich Text | TipTap (28+ packages) | 3.19.0 |
| Calendar | FullCalendar | 6.1.20 |
| Charts | Recharts | 3.7.0 |
| Real-time | socket.io-client | 4.8.3 |
| Virtualization | @tanstack/react-virtual | 3.13.18 |
| Icons | lucide-react | 0.563.0 |
| Testing | Jest + @testing-library/react | 30.x / 16.x |
| E2E | Playwright | 1.58.2 |

### 2.2 Folder Structure

```
frontend/
├── pages/              # Next.js Pages Router (file-based routing)
│   ├── auth/           # Login, register, forgot-password, OAuth callback
│   └── dashboard/      # All authenticated routes
│       ├── email/      # Inbox, compose, thread/[threadId]
│       ├── ai/         # AI assistant, follow-ups, memories
│       └── *.tsx       # Calendar, contacts, tasks, analytics, settings, profile
├── components/         # MUI-based feature components (~175 files)
│   ├── ai/             # AI dashboard (17 files), briefing, follow-ups, memory
│   ├── email/          # Compose (14 files), list, thread, sidebar, folders, labels
│   ├── contacts/       # Contact CRUD, list, detail, activity
│   ├── calendar/       # FullCalendar wrapper
│   ├── dashboard/      # 8 configurable widgets
│   ├── billing/        # Subscription, quota, cost protection
│   ├── layout/         # Sidebar, Header, Layout shell
│   ├── mfa/            # TOTP, Passkeys, backup codes
│   ├── settings/       # 8+ settings panels
│   └── ui/             # shadcn/Radix primitives (30+ files, Tailwind-based)
├── src/components/     # SECONDARY tree — AI chat elements (Tailwind-based)
│   └── ai-elements/    # 48 files, 13 tool renderers (39 files UNUSED)
├── hooks/
│   ├── queries/        # TanStack Query hooks (30+ files, well-organized)
│   ├── mutations/      # Empty barrel (mutations live in queries/)
│   └── ai/             # AI-specific hooks
├── lib/
│   ├── api/            # Axios API modules (18 files)
│   ├── context/        # AuthContext, ToastContext
│   └── hooks/          # useAuth, useTranslations, useLocale
├── stores/             # Zustand stores (9 files)
├── locales/            # en.ts (3512 lines), it.ts (3489 lines), index.ts (types)
├── theme/              # MUI theme: tokens, light/dark, typography
├── types/              # Global TS interfaces
└── e2e/                # Playwright specs (6 files)
```

### 2.3 Data Layer Architecture

**Server state** is managed by TanStack Query with a hierarchical key factory pattern. 30+ query hooks organized by domain (emails, contacts, calendar, dashboard, billing, etc.). Global defaults: `staleTime: 60s`, `gcTime: 5min`, `retry: 3` with exponential backoff. Optimistic updates are implemented for email mutations.

**Client state** uses 9 Zustand stores for UI-only concerns (email selection, filters, compose modal, sidebar, view mode, etc.). The separation is clean except for `label-store.ts` and `calendar-store.ts` which mix API calls into Zustand actions — a hybrid anti-pattern breaking the TanStack Query boundary.

**Real-time** uses Socket.IO with JWT auth. WebSocket events invalidate TanStack Query caches (not manual cache updates). Events cover: email CRUD, folder counts, contact changes, calendar events, sync status, and AI agent steps.

### 2.4 Authentication

- JWT stored in `localStorage` via Zustand `persist` (also duplicated to a JS-readable cookie for Next.js API routes)
- No refresh token mechanism — token expiry = forced logout
- Client-side `RouteGuard` in `_app.tsx` (no Next.js middleware)
- MFA: TOTP, Email OTP, Backup codes, WebAuthn/Passkeys
- CSRF: token fetched from `/auth/csrf-token`, stored in memory, injected on mutating requests

### 2.5 AI Layer (Current Strengths)

The AI layer is the most mature part of the frontend:

- **Chat interface**: Full streaming chat via Vercel AI SDK v6 with `@ai-sdk/react`
- **15 custom tool renderers** for emails, contacts, events, folders, analysis, briefing, CRM, triage
- **Human-in-the-loop**: `AskUserModal` (single/multi-select) + `InlineActionCard` (approve/reject with editable payload, severity badges, AI reasoning display)
- **Agent progress**: Real-time step-by-step visualization with elapsed timers, per-agent status, progress bar
- **Reasoning traces**: Collapsible "Thinking..." with shimmer, auto-enriched with current agent action
- **Chain-of-thought**: Consecutive tool calls grouped into step-by-step trace UI
- **Source citations**: Extracted from tool results, shown as collapsible "Used N sources"
- **Smart compose**: AI drafting, tone selection, Cmd+J inline AI, schedule send, undo send
- **Smart replies, summarize, sentiment, priority**: Per-email AI hooks
- **Command palette**: Cmd+K with search across emails/contacts + nav commands
- **Daily briefing widget**: AI-generated daily summary on dashboard
- **Cost protection**: Global quota banner, daily cost cap in billing settings

**Notable AI gaps**: No per-message token/cost display in chat (component exists but is unwired). No undo/rollback after action execution. No confidence scores rendered (field exists in API but ignored). `Context` component (token usage ring) exists in ai-elements but is not integrated.

---

## 3. Target Vision: Enterprise CRM AI Platform

### 3.1 Capability Map

```
┌─────────────────────────────────────────────────────────┐
│                    ENTERPRISE SHELL                       │
│  Org Switcher │ Global Search │ Notifications │ RBAC     │
├─────────┬─────────┬─────────┬──────────┬────────────────┤
│  INBOX  │   CRM   │CALENDAR │  TASKS   │  AI ASSISTANT  │
│ Email   │Accounts │ Events  │ Kanban   │ Chat + HITL    │
│ Threads │Contacts │ Booking │ Projects │ Agent Traces   │
│ Labels  │ Deals   │ Avail.  │ Automtn  │ Explainability │
│ Folders │Tickets  │         │          │ Cost/Tokens    │
│         │Pipeline │         │          │                │
├─────────┴─────────┴─────────┴──────────┴────────────────┤
│                   ADMIN CONSOLE                           │
│  Users │ Roles │ Audit Log │ SSO │ Webhooks │ API Keys  │
├─────────────────────────────────────────────────────────┤
│                 OBSERVABILITY                             │
│  Agent Runs │ Error Analytics │ Cost Burn │ Latency P95  │
├─────────────────────────────────────────────────────────┤
│              DESIGN SYSTEM (Unified)                      │
│  Tokens │ Components │ Dark Mode │ White-Label │ A11y    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 UX Principles

1. **Workspace-first**: Every session begins in a tenant/workspace context
2. **Entity-centric navigation**: Sidebar groups by domain (CRM, Communication, Productivity, AI, Admin)
3. **Keyboard-first**: Full keyboard navigation across all modules (not just email)
4. **AI as co-pilot, not autopilot**: Every AI action is explainable, reviewable, and reversible
5. **Zero-trust UI**: Permissions enforced at route, component, and action level
6. **Offline-resilient**: Optimistic mutations, background sync, queue failed actions

---

## 4. Gap Analysis (Current vs Target)

### 4.1 CRM Entity Model

| Entity | Current | Target | Gap |
|--------|---------|--------|-----|
| Contacts | Full CRUD, list, detail, activity timeline, sync | Enhanced: saved views, export, merge duplicates, enrichment | Medium |
| Accounts (Companies) | None | Full CRUD, hierarchy, contacts roll-up, activity feed | Critical |
| Deals / Opportunities | None | Pipeline view, stages, probability, forecasting, Kanban | Critical |
| Tickets / Cases | None | Status workflow, SLA timers, assignment, escalation | Critical |
| Activities / Timeline | Partial (contact activity tab) | Unified cross-entity activity feed | High |
| Custom Fields | None | User-definable fields per entity type | High |
| Saved Views / Filters | None | Per-entity saved filter presets with sharing | High |
| Data Export | GDPR export only | CSV/Excel export from any list view | Medium |
| Bulk Actions | Email only | All entities: bulk edit, delete, assign, tag | Medium |

### 4.2 Navigation & Information Architecture

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Sidebar structure | Flat list, 8 items, no groups | Grouped sections, collapsible, customizable | High |
| Workspace switcher | None | Org/workspace selector in sidebar header | Critical |
| Global search | Cmd+K: emails + contacts + nav commands | All entities, filters, recent history, fuzzy match | Medium |
| Breadcrumbs | None | Context breadcrumbs for nested entity views | Medium |
| Recent items | None | Quick-access to recently viewed records | Low |
| Notifications center | Disabled ("during email rebuild") | Real-time notification drawer with categories | High |

### 4.3 Multi-Tenancy & Identity

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Tenant context in UI | `tenantId` on User object, no UI surface | OrgContext provider, tenant-scoped state/cache | Critical |
| Org/workspace switcher | None | Dropdown in sidebar with org logo + name | Critical |
| Tenant isolation in cache | None (single global TanStack cache) | Per-tenant cache namespace or full invalidation on switch | Critical |
| Cross-tenant leakage risk | Medium (WebSocket JWT-scoped, but cache is global) | Zero (state reset on tenant switch) | High |

### 4.4 RBAC & Governance

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Route-level guards | Client-side `RouteGuard` (auth only, no role check) | Next.js middleware + role-based route table | Critical |
| Component-level permissions | None | `<PermissionGate permission="deals.create">` wrapper | Critical |
| Action-level permissions | None | `usePermission('email.send')` hook for button disable/hide | Critical |
| Admin console | None | Full admin section: users, roles, permissions, audit | Critical |
| User provisioning | None | Invite flow, user list, deactivate, role assignment | Critical |
| Role editor | None | Custom roles with permission matrix | High |
| SSO configuration | None | SAML/OIDC config UI for enterprise customers | High |
| Audit log viewer | None | Searchable, filterable activity audit trail | High |

### 4.5 State Management & Data Layer

| Issue | Current State | Required Fix |
|-------|--------------|--------------|
| `label-store.ts` hybrid | Zustand store calls `labelsApi` directly, bypassing TanStack Query | Migrate to TanStack Query mutations |
| `calendar-store.ts` hybrid | Manages server data in Zustand | Migrate server data to TanStack Query |
| WebSocket reconnect scope | Only invalidates `emailKeys.all` | Invalidate all stale data (calendar, contacts, etc.) |
| Folder metadata cache | `staleTime: Infinity`, never cleared on logout | Invalidate on logout/tenant switch |
| `mutations/index.ts` | Empty file with comment "will be re-added" | Remove or populate |
| Auth page API calls | Direct `apiClient.post` in event handlers | Acceptable for auth, but add loading/error states |

### 4.6 Design System

| Issue | Current State | Required Fix |
|-------|--------------|--------------|
| Dual styling system | MUI `sx` (191 files) + Tailwind (48 files) coexist | Consolidate to single system |
| Two component trees | `components/` (MUI) + `src/components/` (Tailwind) | Merge under one root |
| Duplicate components | Badge (2), ThemeToggle (2), EmptyState (2), TypingIndicator (2) | Deduplicate |
| Hardcoded colors in `sx` | 2179 `sx=` usages, many with raw hex values | Audit and replace with theme tokens |
| Dead code | `badge.old.tsx`, 39 unused ai-elements files | Delete |

### 4.7 Testing

| Metric | Current | Target |
|--------|---------|--------|
| Component unit tests | 3 files / 207 components (1.4%) | 80% of business logic components |
| Hook tests | 5 files | All custom hooks with complex logic |
| E2E specs | 6 files (auth, compose, email list, search, keyboard, a11y) | 30+ critical user journeys |
| Coverage collection | Excludes `components/` entirely | Include all source directories |
| Coverage data | Stale (references deleted files) | Regenerate, integrate into CI gates |
| E2E in CI | Never starts dev server | Fix workflow to start frontend + backend |

---

## 5. Key Risks & Risk Matrix

| # | Risk | Probability | Impact | Severity | Mitigation |
|---|------|------------|--------|----------|------------|
| R1 | **JWT in localStorage stolen via XSS** | Medium | Critical | **HIGH** | Migrate to httpOnly cookie auth; add CSP headers |
| R2 | **No RBAC = any authenticated user sees everything** | High | Critical | **HIGH** | Implement permission system before adding admin features |
| R3 | **Dual styling system slows velocity** | Certain | High | **HIGH** | Consolidate in Phase 1; every new component uses one system |
| R4 | **Near-zero test coverage masks regressions** | Certain | High | **HIGH** | Add test gates in CI; prioritize mutation and auth hook tests |
| R5 | **No tenant isolation in client cache** | Medium | Critical | **HIGH** | Implement cache reset on tenant switch before multi-tenant launch |
| R6 | **No refresh token = poor UX on expiry** | High | Medium | **MEDIUM** | Implement silent refresh with rotating tokens |
| R7 | **39 dead ai-elements files bloat bundle** | Certain | Low | **MEDIUM** | Tree-shake or delete unused exports |
| R8 | **TipTap 28-package import not code-split** | High | Medium | **MEDIUM** | Lazy-load compose editor (partially done) |
| R9 | **`.env.production` has ephemeral ngrok URL** | Certain | Medium | **MEDIUM** | Replace with production URL or remove file |
| R10 | **E2E CI runs against nothing** | Certain | Low | **LOW** | Fix workflow to start dev server |
| R11 | **react/ ESLint rules disabled** | Certain | Low | **LOW** | Upgrade eslint-plugin-react or use alternative |
| R12 | **No CSP headers** | High | High | **HIGH** | Add CSP in next.config.js headers() |

---

## 6. Multi-Tenancy & RBAC Requirements

### 6.1 Tenant Context Architecture

```
<QueryProvider>
  <AuthProvider>
    <TenantProvider>          ← NEW: reads tenantId from user, provides OrgContext
      <PermissionProvider>    ← NEW: fetches role+permissions, provides usePermission()
        <RouteGuard>          ← ENHANCED: checks both auth AND route permissions
          <Layout>
            <Page />
          </Layout>
        </RouteGuard>
      </PermissionProvider>
    </TenantProvider>
  </AuthProvider>
</QueryProvider>
```

### 6.2 TenantProvider Requirements

| Requirement | Details |
|-------------|---------|
| `OrgContext` | Provides `{ tenantId, tenantName, tenantSlug, tenantLogo, tenantPlan }` |
| Tenant switcher UI | Dropdown in sidebar header showing current org, list of user's orgs |
| Cache isolation | On tenant switch: `queryClient.clear()`, reset all Zustand stores, reconnect WebSocket |
| API header injection | Add `X-Tenant-Id` header to all API requests (defense in depth alongside JWT) |
| Tenant-scoped localStorage | Namespace all persisted keys: `${tenantId}:auth-storage`, `${tenantId}:email-view`, etc. |

### 6.3 Permission Model

```typescript
// Permission format: "resource.action"
type Permission =
  | 'email.read' | 'email.send' | 'email.delete'
  | 'contacts.read' | 'contacts.create' | 'contacts.edit' | 'contacts.delete'
  | 'deals.read' | 'deals.create' | 'deals.edit' | 'deals.delete'
  | 'accounts.read' | 'accounts.create' | 'accounts.edit' | 'accounts.delete'
  | 'tickets.read' | 'tickets.create' | 'tickets.edit' | 'tickets.delete'
  | 'ai.chat' | 'ai.approve_actions' | 'ai.configure'
  | 'admin.users' | 'admin.roles' | 'admin.billing' | 'admin.audit'
  | 'settings.read' | 'settings.write';

// Built-in roles
type Role = 'owner' | 'admin' | 'manager' | 'member' | 'viewer' | 'custom';
```

### 6.4 Permission Enforcement (3 Layers)

**Layer 1 — Route-level:** Next.js middleware (`middleware.ts`) checks JWT + role against a route permission map. Returns 403 before page render.

**Layer 2 — Component-level:**
```tsx
<PermissionGate permission="deals.create" fallback={null}>
  <CreateDealButton />
</PermissionGate>
```

**Layer 3 — Action-level:**
```tsx
const canSend = usePermission('email.send');
<Button disabled={!canSend} onClick={handleSend}>Send</Button>
```

### 6.5 Admin Console Pages (New)

| Page | Route | Features |
|------|-------|----------|
| Users | `/dashboard/admin/users` | List, invite, deactivate, role assignment, last login |
| Roles | `/dashboard/admin/roles` | List, create custom, permission matrix editor |
| Audit Log | `/dashboard/admin/audit` | Filterable timeline: who did what, when, on what entity |
| SSO Config | `/dashboard/admin/sso` | SAML/OIDC provider setup |
| API Keys | `/dashboard/admin/api-keys` | Create, revoke, scope, last used |
| Webhooks | `/dashboard/admin/webhooks` | URL, events, delivery log, retry |

---

## 7. AI Layer Requirements

### 7.1 Explainability UI

| Feature | Current | Required |
|---------|---------|----------|
| Reasoning text | Shown in HITL card (`action.reasoningSteps`) | Also show in chat message footer |
| Confidence score | API returns `analysis.confidence` — **not rendered** | Display as badge/bar on analysis results |
| Evidence/sources | "Used N sources" collapsible after messages | Enhance: link to source entity, highlight relevant excerpt |
| Decision tree | None | For complex multi-step actions, show decision path visualization |
| "Why this suggestion?" | None | Tooltip or expandable on every AI suggestion (smart reply, triage label) |

### 7.2 Human-in-the-Loop Enhancements

| Feature | Current | Required |
|---------|---------|----------|
| Approve/Reject | Yes (InlineActionCard) | Keep, add batch approve for multiple pending actions |
| Edit before execute | Yes (HitlPayloadEditor) | Enhance: rich text for email body, date picker for events |
| Undo after execution | None | Add undo window (30s) for reversible actions (move email, update contact) |
| Rollback | None | For irreversible actions (send email), show confirmation with "point of no return" warning |
| Action history | None | Scrollable log of past approved/rejected actions with outcomes |
| Bulk action review | None | When AI triages 50 emails, show summary table with approve-all/reject-all |

### 7.3 Agent Run Trace UI

| Feature | Current | Required |
|---------|---------|----------|
| Step-by-step progress | Yes (AgentProgressIndicator) | Keep and enhance |
| Per-step timing | Yes (elapsed timer) | Add: accumulated cost per step |
| Tool call args/results | Collapsed in ToolActivityCard | Promote: always show summary, expand for raw JSON |
| Error details | Basic error status | Show error message, stack trace (admin only), retry button |
| Run history | None | `/dashboard/ai/runs` page with filterable list of past agent runs |
| Run replay | None | Click a past run to see step-by-step trace (read-only) |

### 7.4 Cost & Token Visibility

| Feature | Current | Required |
|---------|---------|----------|
| Per-message tokens | `totalTokens` in metadata — **not rendered** | Show token count on each assistant message |
| Per-message cost | `Context` component exists — **not wired** | Wire into chat UI as an expandable footer per message |
| Per-run total | None | Show total tokens + cost at end of each agent run |
| Daily/monthly summary | CostProtectionCard in billing | Add: chart of daily cost trend, top-cost runs |
| Tenant-level quotas | QuotaAlertBanner at 80% | Add: admin-configurable per-user quotas |
| Cost alerts | Banner only | Add: email/webhook notification when thresholds hit |

---

## 8. Observability & Admin Dashboards Requirements

### 8.1 Agent Run Analytics Dashboard

**Route:** `/dashboard/admin/ai-analytics`

| Widget | Metrics |
|--------|---------|
| Success Rate | % of agent runs completing without error (24h / 7d / 30d) |
| Error Breakdown | Pie chart: RATE_LIMIT, CIRCUIT_OPEN, TIMEOUT, NETWORK, UNKNOWN |
| Latency Percentiles | P50, P90, P95, P99 response times |
| Tool Usage | Bar chart: which tools are called most, which fail most |
| Cost Burn-Down | Line chart: daily token spend vs budget, projected month-end |
| Top Users | Table: heaviest AI users by token consumption |
| HITL Metrics | Approval rate, avg review time, rejection reasons |

### 8.2 System Health Dashboard

**Route:** `/dashboard/admin/system`

| Widget | Metrics |
|--------|---------|
| Sync Status | Per-provider: last sync time, success/failure, queue depth |
| WebSocket Connections | Active connections, reconnection rate |
| API Latency | Backend endpoint P95 latency (from client-side timing) |
| Error Rate | Client-side errors/minute (from ErrorBoundary telemetry) |
| Cache Hit Rate | TanStack Query cache hit/miss ratio |

### 8.3 Client-Side Telemetry

| Requirement | Details |
|-------------|---------|
| Error reporting | Integrate Sentry or equivalent; capture ErrorBoundary catches + unhandled rejections |
| Performance marks | `web-vitals` + custom marks for TTI, email list render, AI response time |
| User actions | Structured event logging: page views, feature usage, AI interactions |
| Sampling | 10% of sessions in production, 100% for admin/internal users |

---

## 9. Design System & White-Label Strategy

### 9.1 Current Problems

1. **Two styling runtimes**: MUI/Emotion (191 files) + Tailwind (48 files) = double CSS payload, conflicting spacing scales, developer confusion
2. **Two component trees**: `components/ui/` (shadcn/Radix) vs `components/*` (MUI) — no clear boundary
3. **`sxToClassName()` bridge hack** in shadcn components accepting MUI `sx` prop — fragile
4. **2179 `sx=` usages** across 174 files, many with hardcoded hex values
5. **Duplicate components**: Badge (2), ThemeToggle (2), EmptyState (2), TypingIndicator (2)

### 9.2 Consolidation Decision

**Recommendation: Consolidate on MUI + CSS variables. Migrate ai-elements from Tailwind to MUI `sx` + theme tokens.**

Rationale:
- MUI is dominant (191 files vs 48 Tailwind files)
- MUI v7 has improved `sx` performance and CSS variable support
- MUI's theming system is better suited for white-label (dynamic theme injection)
- The ai-elements tree is self-contained — migration is scoped
- Removing Tailwind eliminates a CSS runtime and simplifies the build

**Alternative** (if Tailwind is preferred): Migrate MUI components to Tailwind + Radix. This is a larger effort (191 files) but produces a lighter runtime. Only viable if the team has strong Tailwind preference.

### 9.3 Design Token Governance

```typescript
// Single source of truth: theme/tokens.ts (already exists)
// Extend with:
export const tokens = {
  // ... existing color/spacing/typography tokens

  // NEW: White-label overrides
  brand: {
    primary: 'var(--brand-primary, #55cae5)',
    secondary: 'var(--brand-secondary, #7650ce)',
    logo: 'var(--brand-logo-url)',
    appName: 'var(--brand-app-name, "PMSync")',
  },

  // NEW: Semantic component tokens
  components: {
    sidebar: { width: 240, collapsedWidth: 72 },
    header: { height: 64 },
    card: { borderRadius: 12, padding: 16 },
  },
};
```

### 9.4 White-Label Implementation

| Feature | Mechanism |
|---------|-----------|
| Colors | CSS custom properties injected via `<style>` tag from tenant config API |
| Logo | `tenantConfig.logoUrl` → `<Image>` in Sidebar header |
| App name | `tenantConfig.appName` → document title, sidebar brand text |
| Favicon | `tenantConfig.faviconUrl` → dynamic `<link>` in `_document.tsx` |
| Custom domain | Handled at infrastructure level (DNS + reverse proxy) |
| Login page | Tenant-specific background image + logo from config |

### 9.5 Deduplication Targets

| Duplicate | Keep | Delete |
|-----------|------|--------|
| `components/ui/badge.tsx` vs `badge.old.tsx` | `badge.tsx` | `badge.old.tsx` |
| `components/ui/theme-toggle.tsx` vs `components/layout/ThemeToggle.tsx` | `layout/ThemeToggle.tsx` | `ui/theme-toggle.tsx` |
| `components/email/list/EmptyState.tsx` vs `src/.../shared/EmptyState.tsx` | Merge into `components/common/EmptyState.tsx` | Both originals |
| `components/ai/TypingIndicator.tsx` vs `AiDashboard/TypingIndicator.tsx` | `AiDashboard/TypingIndicator.tsx` | `ai/TypingIndicator.tsx` |

---

## 10. Accessibility & i18n Requirements

### 10.1 Accessibility (A11y) — Current State

**Strengths:**
- Skip-to-content link exists (WCAG 2.1 AA)
- `ai-elements` tree has good ARIA: `role="tree"`, `role="log"`, keyboard nav
- Email list items have `aria-label` on action buttons
- Flag emojis have `role="img"` + `aria-label`

**Critical Gaps:**
- Only 1 `role="alert"` in entire `components/` tree — no `aria-live` regions for async state changes
- `SectionErrorBoundary` defined but never used — widget crash takes down entire page
- `onKeyPress` (deprecated) used in CalendarSidebar
- Keyboard shortcuts only work in email module — not in contacts, calendar, or AI
- No focus trap management for modals beyond what MUI/Radix provide by default
- `id="main-content"` target of skip link not confirmed on `<main>` element

### 10.2 A11y Acceptance Criteria (Enterprise Procurement)

| Criterion | Standard | Requirement |
|-----------|----------|-------------|
| Keyboard navigation | WCAG 2.1 AA | All interactive elements reachable via Tab; all actions via Enter/Space |
| Screen reader | WCAG 2.1 AA | All content accessible; dynamic updates announced via `aria-live` |
| Color contrast | WCAG 2.1 AA | 4.5:1 minimum for text, 3:1 for large text and UI components |
| Focus indicators | WCAG 2.1 AA | Visible focus ring on all interactive elements |
| Motion | WCAG 2.1 AA | Respect `prefers-reduced-motion`; no auto-playing animations |
| Error identification | WCAG 2.1 AA | Form errors identified by color AND text; associated with inputs |
| VPAT | Section 508 | Publish Voluntary Product Accessibility Template for procurement |

### 10.3 i18n — Current State

**Strengths:**
- Typed translation system with `useTranslations()` hook
- 141 files import translations
- Two locales: EN, IT

**Critical Gaps:**
- **Fallback literals everywhere**: `t.common?.loading || 'Loading...'` pattern means untranslated strings silently fall through
- **MFA components**: Hardcoded English strings in `TotpSetupWizard`, `TrustedDevicesList`, `PasskeyCard`
- **ErrorBoundary**: Always renders English regardless of locale (no `labels` prop passed)
- **Date formatting inconsistent**: 5 different approaches (raw `toLocaleDateString`, hardcoded `'en-US'`, app locale, `Intl.DateTimeFormat`, `date-fns` without locale)
- **`ColorPicker.tsx`**: Defaults to Italian `'Colori predefiniti'` (wrong fallback language)
- **`Intl.NumberFormat("en-US", ...)`**: Hardcoded in ai-elements context display
- **No RTL support**: Required for Arabic/Hebrew markets

### 10.4 i18n Requirements

| Requirement | Details |
|-------------|---------|
| Locale architecture | ICU MessageFormat or equivalent for plurals, gender, interpolation |
| Date/time formatting | Centralized `formatDate(date, style, locale)` util — replace all 5 current approaches |
| Number formatting | Centralized `formatNumber(n, style, locale)` util |
| Timezone | Apply user's selected timezone to all date displays (currently ignored) |
| RTL | CSS logical properties (`margin-inline-start`), `dir="rtl"` support |
| Locale detection | Current: `navigator.language` with `it`/`en` normalization. Need: BCP 47 subtag support |
| Translation coverage | Lint rule: no string literals in JSX except `className`, `key`, test IDs |
| Translation workflow | Extract → Translate → Verify pipeline; consider Crowdin/Lokalise integration |

---

## 11. Security & Compliance Requirements

### 11.1 Current Vulnerabilities

| ID | Vulnerability | Severity | Current State |
|----|--------------|----------|---------------|
| SEC-01 | JWT in localStorage (XSS exfiltration) | **Critical** | Token readable by any JS on page |
| SEC-02 | Non-httpOnly auth cookie | **Critical** | `document.cookie` with `httpOnly: false` |
| SEC-03 | No CSP headers | **High** | No Content-Security-Policy anywhere |
| SEC-04 | CSRF protection | **OK** | Token in memory, injected on mutating requests |
| SEC-05 | No server-side route guard | **High** | Client-side only; SSR serves page before redirect |
| SEC-06 | No token refresh | **Medium** | 7-day JWT, expiry = forced logout |
| SEC-07 | `ALLOW_DATA_ATTR: true` in DOMPurify | **Low** | Email HTML can inject `data-*` for CSS attacks |
| SEC-08 | No PII masking | **Medium** | Emails, phones, birthdays rendered raw |
| SEC-09 | `.env.production` with ngrok URL | **Medium** | Ephemeral URL committed to repo |
| SEC-10 | react/ ESLint rules disabled | **Low** | `react/no-danger` not enforced |

### 11.2 Security Requirements

| Requirement | Implementation |
|-------------|---------------|
| Token storage | Migrate to `httpOnly`, `Secure`, `SameSite=Strict` cookie. Remove localStorage token. |
| CSP | Add strict CSP via `next.config.js` `headers()`: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (for MUI), `img-src 'self' data: https:` |
| Server-side auth | Add `middleware.ts` at frontend root: validate JWT, check role, redirect 401/403 |
| Token refresh | Implement refresh token rotation: short-lived access token (15min), httpOnly refresh cookie |
| DOMPurify | Remove `ALLOW_DATA_ATTR: true` from email HTML sanitization |
| PII masking | Add `maskEmail()`, `maskPhone()` utilities; apply based on user role/permission |
| Dependency audit | Add `npm audit` to CI; block PRs with high/critical vulnerabilities |
| Secret scanning | Remove `.env.production` ngrok URL; add `.env.production` to `.gitignore` |

### 11.3 GDPR/Compliance UX

| Feature | Current | Status |
|---------|---------|--------|
| Consent management | `ConsentSettings.tsx` + `ConsentToggle.tsx` | Exists |
| Data export | `DataExportPanel.tsx` | Exists |
| Account deletion | `AccountDeletionPanel.tsx` (30-day grace period) | Exists |
| Cookie consent | `CookieConsent` component in Layout | Exists |
| Audit trail viewer | None | **Needed** |
| Data retention policy UI | None | **Needed** |
| Right to rectification | Edit profile only | **Needs entity-level edit history** |

---

## 12. Performance Budget & Optimization Plan

### 12.1 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | < 1.2s | Lighthouse CI |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse CI (already configured) |
| Cumulative Layout Shift (CLS) | < 0.1 | Lighthouse CI (already configured) |
| Time to Interactive (TTI) | < 3.0s | Lighthouse CI |
| Initial JS bundle (gzipped) | < 200KB | Bundle analyzer |
| Per-route chunk (gzipped) | < 80KB | Bundle analyzer |
| Email list render (1000 items) | < 100ms | Custom performance mark |
| AI response start (streaming) | < 500ms | Custom performance mark |

### 12.2 Bundle Optimization

| Action | Estimated Savings | Priority |
|--------|-------------------|----------|
| Delete 39 unused ai-elements files | ~150KB ungzipped | High |
| Lazy-load TipTap (already partial) | ~200KB deferred | High |
| Lazy-load FullCalendar | ~180KB deferred (only on `/dashboard/calendar`) | High |
| Lazy-load Recharts | ~100KB deferred (only on analytics/dashboard) | Medium |
| Lazy-load Shiki | ~300KB deferred (only on code blocks in chat) | Medium |
| Remove `react-select`, `autumn-js`, `embla-carousel-react` | ~50KB | Low |
| Deduplicate `framer-motion` / `motion` | ~10KB | Low |
| Remove `@types/pg`, `pg` from frontend | 0 (devDeps only) | Low |

### 12.3 Rendering Optimization

| Action | Details |
|--------|---------|
| Wrap dashboard widgets in `SectionErrorBoundary` | Prevent single widget crash from taking down page |
| Add `loading:` fallback to all `dynamic()` imports | Landing page sections currently flash empty |
| Fix `exhaustive-deps` suppressions (6 files) | Stale closures cause incorrect renders |
| Investigate `react-grid-layout` `require()` | Blocks tree-shaking; consider alternative or dynamic import |
| Add `remotePatterns` for Gravatar | Currently blocks external image optimization |
| Run bundle analyzer in CI | Add `ANALYZE=true` step to `frontend-ci.yml` |

### 12.4 Lighthouse CI Gates

Currently Lighthouse runs with `continue-on-error: true` — violations are reported but never block PRs. Change to:

```yaml
- name: Lighthouse CI
  run: npx lhci autorun
  # Remove continue-on-error to make this a gate
```

---

## 13. Recommended Target Architecture

### 13.1 Module Boundaries

```
frontend/
├── app/                          # Migrate from Pages Router to App Router
│   ├── (auth)/                   # Auth group (login, register, etc.)
│   ├── (dashboard)/              # Authenticated group
│   │   ├── layout.tsx            # Dashboard shell (sidebar, header)
│   │   ├── page.tsx              # Dashboard home
│   │   ├── email/
│   │   ├── crm/
│   │   │   ├── contacts/
│   │   │   ├── accounts/
│   │   │   ├── deals/
│   │   │   └── tickets/
│   │   ├── calendar/
│   │   ├── tasks/
│   │   ├── ai/
│   │   ├── analytics/
│   │   ├── admin/                # NEW: Admin console
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── audit/
│   │   │   ├── sso/
│   │   │   └── ai-analytics/
│   │   └── settings/
│   └── middleware.ts             # Server-side auth + RBAC
│
├── modules/                      # Domain modules (feature-first)
│   ├── email/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── types/
│   ├── crm/
│   │   ├── contacts/
│   │   ├── accounts/
│   │   ├── deals/
│   │   └── tickets/
│   ├── calendar/
│   ├── ai/
│   ├── admin/
│   └── billing/
│
├── shared/                       # Cross-module shared code
│   ├── components/               # Design system primitives
│   ├── hooks/                    # usePermission, useAuth, useTranslations
│   ├── providers/                # TenantProvider, PermissionProvider, AuthProvider
│   ├── api/                      # apiClient, base interceptors
│   ├── theme/                    # Unified tokens, light/dark themes
│   ├── locales/                  # Translations
│   └── types/                    # Shared interfaces
│
├── e2e/                          # Playwright tests
└── __tests__/                    # Unit tests (mirror module structure)
```

### 13.2 Provider Stack

```tsx
<QueryClientProvider>
  <AuthProvider>                   // JWT validation, user object
    <TenantProvider>               // Org context, cache isolation
      <PermissionProvider>         // Role + permissions from API
        <ThemeProvider>            // MUI theme (tenant-aware)
          <ToastProvider>
            <TranslationProvider>  // Enhanced: ICU, timezone, locale
              <TelemetryProvider>  // Error reporting, performance marks
                {children}
              </TelemetryProvider>
            </TranslationProvider>
          </ToastProvider>
        </ThemeProvider>
      </PermissionProvider>
    </TenantProvider>
  </AuthProvider>
</QueryClientProvider>
```

### 13.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Migrate Pages Router → App Router | Server components, streaming, middleware, layouts, parallel routes |
| Feature-module structure | Co-locate components/hooks/api/types per domain; reduce cross-module imports |
| Single styling system (MUI) | Eliminate dual runtime; theme-based white-label; enterprise theming |
| Permission-first component design | Every new component checks permissions; `PermissionGate` wrapper |
| Centralized telemetry | Single `TelemetryProvider` for errors, performance, user actions |

---

## 14. Phased Roadmap

### Phase 1: Foundation Hardening (8–10 weeks)

**Goal:** Eliminate security vulnerabilities, consolidate architecture, establish quality gates.

| # | Workstream | Tasks | Priority |
|---|-----------|-------|----------|
| 1.1 | Security | Migrate JWT to httpOnly cookie; add CSP headers; add Next.js `middleware.ts` | P0 |
| 1.2 | Security | Implement token refresh rotation; remove `.env.production` ngrok URL | P0 |
| 1.3 | Design System | Delete dead code (badge.old, 39 unused ai-elements, unused deps); deduplicate components | P0 |
| 1.4 | Design System | Establish single-system rule (MUI); begin ai-elements migration | P1 |
| 1.5 | Testing | Fix E2E CI (start dev server); regenerate coverage baseline; add coverage gate | P0 |
| 1.6 | Testing | Write tests for auth hooks, mutation hooks, permission hooks | P1 |
| 1.7 | Data Layer | Fix `label-store.ts` and `calendar-store.ts` hybrid pattern → TanStack Query | P1 |
| 1.8 | Data Layer | Fix WebSocket reconnect to invalidate all data types | P1 |
| 1.9 | Performance | Delete unused deps; lazy-load TipTap, FullCalendar, Shiki; add Lighthouse gate | P1 |
| 1.10 | i18n | Centralize date/number formatting; fix hardcoded locales; fix ErrorBoundary i18n | P2 |

**Exit Criteria:** Zero critical/high security issues. CI gates enforce type-check, lint, tests, Lighthouse. Dead code removed. Coverage ≥ 20%.

### Phase 2: Enterprise Infrastructure (10–14 weeks)

**Goal:** Multi-tenancy, RBAC, admin console, observability.

| # | Workstream | Tasks | Priority |
|---|-----------|-------|----------|
| 2.1 | Multi-Tenancy | Build `TenantProvider`, org switcher UI, cache isolation on tenant switch | P0 |
| 2.2 | RBAC | Build `PermissionProvider`, `usePermission()`, `<PermissionGate>` | P0 |
| 2.3 | RBAC | Implement Next.js middleware with role-based route table | P0 |
| 2.4 | Admin | Users page: list, invite, deactivate, role assignment | P0 |
| 2.5 | Admin | Roles page: built-in roles, custom role editor, permission matrix | P1 |
| 2.6 | Admin | Audit log viewer: filterable, searchable, exportable | P1 |
| 2.7 | Observability | Integrate error reporting (Sentry); add client-side telemetry provider | P1 |
| 2.8 | Observability | Build AI analytics dashboard (success rate, cost, latency, tool usage) | P1 |
| 2.9 | AI Enhancements | Wire token/cost display into chat UI; add per-run cost summary | P2 |
| 2.10 | AI Enhancements | Add undo window for reversible AI actions; render confidence scores | P2 |
| 2.11 | Navigation | Redesign sidebar: grouped sections, workspace switcher, collapsible groups | P1 |
| 2.12 | A11y | Add `aria-live` regions; fix keyboard nav across all modules; VPAT draft | P2 |

**Exit Criteria:** Multi-tenant login works with org switcher. Admin can manage users/roles. AI cost visible per message. RBAC enforced at all 3 layers. Coverage ≥ 40%.

### Phase 3: CRM Platform & Scale (12–16 weeks)

**Goal:** Full CRM entity model, white-label, App Router migration, enterprise UX.

| # | Workstream | Tasks | Priority |
|---|-----------|-------|----------|
| 3.1 | CRM | Accounts module: list, detail, hierarchy, contacts roll-up | P0 |
| 3.2 | CRM | Deals module: pipeline Kanban, stages, probability, forecasting | P0 |
| 3.3 | CRM | Tickets module: status workflow, SLA timer, assignment, escalation | P1 |
| 3.4 | CRM | Unified activity timeline across all entities | P1 |
| 3.5 | CRM | Saved views, custom fields, advanced filters per entity | P1 |
| 3.6 | CRM | Data export (CSV/Excel) from any list view | P2 |
| 3.7 | App Router | Migrate from Pages Router to App Router (incremental, route-by-route) | P1 |
| 3.8 | White-Label | Tenant theming: CSS variable injection, logo, favicon, app name | P1 |
| 3.9 | White-Label | SSO configuration UI (SAML/OIDC) | P2 |
| 3.10 | AI | Agent run history page with replay | P2 |
| 3.11 | AI | Bulk action review table (approve-all/reject-all for triage) | P2 |
| 3.12 | Notifications | Notification center with categories, read/unread, preferences | P1 |
| 3.13 | Search | Enhanced global search: all entities, fuzzy match, filters, recent | P2 |
| 3.14 | Testing | E2E for all critical CRM flows; coverage ≥ 60% | P1 |

**Exit Criteria:** Full CRM entity suite (Accounts, Deals, Tickets). White-label works for 2+ demo tenants. App Router migration ≥ 50% of routes. Coverage ≥ 60%.

---

## 15. KPIs/OKRs

### Product KPIs

| KPI | Current Baseline | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|-----|-----------------|----------------|----------------|----------------|
| CRM entities supported | 1 (Contacts) | 1 | 1 | 4 (+ Accounts, Deals, Tickets) |
| Active tenants supported | 1 (single-tenant) | 1 | Multi-tenant MVP | 10+ |
| Concurrent users per tenant | Unknown | Benchmark established | 50 | 200 |
| AI action approval rate | Unknown | Measured | > 70% | > 80% |

### Engineering KPIs

| KPI | Current Baseline | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|-----|-----------------|----------------|----------------|----------------|
| Test coverage (statements) | ~5% | 20% | 40% | 60% |
| Lighthouse Performance score | Unknown | ≥ 75 | ≥ 85 | ≥ 90 |
| LCP (P75) | Unknown | < 3.0s | < 2.5s | < 2.0s |
| Initial bundle size (gzipped) | Unknown | < 300KB | < 250KB | < 200KB |
| Security vulnerabilities (high/critical) | 4 | 0 | 0 | 0 |
| Dead code files | 42+ | 0 | 0 | 0 |
| Styling systems | 2 (MUI + Tailwind) | 1.5 (migration in progress) | 1 | 1 |
| Components with permission checks | 0 | 0 | Core routes | All CRUD actions |
| i18n coverage (strings via `t()`) | ~85% | 95% | 98% | 99% |

### Reliability OKRs

| OKR | Target |
|-----|--------|
| Client-side error rate | < 0.1% of sessions |
| AI agent run success rate | > 95% |
| Mean time to AI response (streaming start) | < 500ms |
| WebSocket reconnection success rate | > 99% |
| Zero-downtime deployment success rate | > 99% |

---

## 16. Open Questions / Assumptions

### Open Questions

| # | Question | Impact | Owner |
|---|----------|--------|-------|
| Q1 | Should we migrate to App Router (Phase 3) or stay on Pages Router long-term? App Router enables server components + streaming but is a major migration. | Architecture | Frontend Lead |
| Q2 | Should the design system consolidate on MUI or Tailwind? This document recommends MUI (dominant, better theming), but team preference matters. | Velocity | Frontend Lead + Design |
| Q3 | Is the backend ready for multi-tenant API headers (`X-Tenant-Id`)? Or does it rely solely on JWT claims for tenant scoping? | Multi-tenancy | Backend Lead |
| Q4 | What is the backend's permission model? Does it return a permissions array with the user object, or do we need a separate `/permissions` endpoint? | RBAC | Backend Lead |
| Q5 | What error reporting service should we integrate? Sentry is the default recommendation, but there may be organizational preferences. | Observability | Platform/Infra |
| Q6 | What is the token cost model? Do we have per-model pricing data to display accurate cost in the UI? The `tokenlens` library exists in ai-elements but is unwired. | AI Cost | AI/Backend Lead |
| Q7 | Is the CRM entity model (Accounts, Deals, Tickets) already designed in the backend, or does it need to be built from scratch? | Phase 3 scope | Product + Backend |
| Q8 | What SSO providers must be supported? SAML 2.0 and OIDC are assumed. Is LDAP required? | Enterprise sales | Product |
| Q9 | What compliance certifications are targeted? SOC 2 Type II? ISO 27001? HIPAA? Each has specific UI implications. | Compliance | Legal + Product |
| Q10 | Should the notification center integrate with external channels (Slack, Teams, email digest) or be in-app only initially? | Phase 3 scope | Product |

### Assumptions

| # | Assumption | Risk if Wrong |
|---|-----------|---------------|
| A1 | Backend already supports JWT refresh token rotation (endpoint exists but frontend doesn't use it) | If no backend support, Phase 1 security work is blocked |
| A2 | Backend tenant scoping is via JWT claims, not request headers | If headers needed, API client interceptor must be updated |
| A3 | Current WebSocket event schema is stable and will be extended (not replaced) for new CRM entities | If replaced, all real-time hooks need rewrite |
| A4 | MUI v7 will remain stable through the migration period (no breaking v8 release) | If v8 drops, migration plan needs revision |
| A5 | The team has ≥ 3 frontend engineers available for Phase 1 | If understaffed, Phase 1 extends to 14+ weeks |
| A6 | Enterprise customers will accept English + Italian initially; full i18n (10+ locales) is Phase 3+ | If a deal requires German/French/Spanish sooner, i18n infrastructure must be prioritized |
| A7 | The existing TanStack Query key factory pattern will scale to CRM entities without architectural change | If query key collisions occur at scale, a namespace redesign is needed |

---

*Document generated by architectural audit on 2026-03-02. All findings based on static analysis of `D:\MailAgent\frontend` source code. No runtime profiling was performed.*
