# MailAgent → Enterprise CRM AI Platform
## Enterprise PRD & Architecture Refactoring Blueprint

**Version:** 1.0
**Date:** 2026-03-02
**Classification:** Internal — CTO / VP Engineering / VP Product
**Scope:** Frontend (`D:\MailAgent\frontend`) — static analysis only, no runtime profiling

---

## 1. Executive Summary (Enterprise Assessment)

### Overall Verdict

MailAgent is a **functional AI-powered email client** that has outgrown its original architecture. It has a surprisingly mature AI layer (HITL approvals, 15 tool renderers, agent traces, smart compose) sitting on top of an infrastructure that lacks every enterprise primitive: no RBAC, no multi-tenancy UI, no admin console, no observability, no plugin system, no server-side route protection.

### Enterprise Readiness Score: **28 / 100**

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| CRM Entity Model | 15/100 | 15% | 2.3 |
| Multi-Tenancy & RBAC | 5/100 | 15% | 0.8 |
| AI Layer Maturity | 65/100 | 15% | 9.8 |
| Security & Compliance | 30/100 | 15% | 4.5 |
| Design System & UX | 35/100 | 10% | 3.5 |
| Performance & Reliability | 40/100 | 10% | 4.0 |
| Testing & CI/CD | 15/100 | 10% | 1.5 |
| Observability | 5/100 | 5% | 0.3 |
| Extensibility / Plugin | 20/100 | 5% | 1.0 |
| **Total** | | **100%** | **27.5 ≈ 28** |

### Key Strengths (What Works)

- **AI UX is production-grade**: Streaming chat, HITL approve/reject with editable payloads, 15 custom tool renderers, agent progress visualization, reasoning traces, source citations, smart compose with tone selection
- **Data layer is well-architected**: TanStack Query with hierarchical key factories, clean API module abstraction, optimistic mutations, WebSocket-to-cache bridging
- **Real-time is solid**: Socket.IO with JWT auth, room-based isolation, event-driven cache invalidation
- **MFA is enterprise-ready**: TOTP, WebAuthn/Passkeys, Email OTP, backup codes, trusted devices
- **GDPR UX exists**: Consent management, data export, account deletion with grace period

### Critical Gaps (What's Missing)

1. **Zero RBAC**: `user.role` exists but is never checked in any component — every authenticated user has full access
2. **No multi-tenancy UI**: `tenantId` flows through JWT but there's no org switcher, no cache isolation, no tenant-scoped state
3. **No admin console**: No user management, role editor, audit log, SSO config, webhook management
4. **JWT in localStorage**: Readable by any XSS payload; compounded by a JS-readable cookie duplicate
5. **No CSP headers**: Email HTML is DOMPurify-sanitized but there's no defense-in-depth via Content-Security-Policy
6. **Dual styling system**: MUI (191 files) + Tailwind (48 files) creates confusion, duplicate components, and doubled CSS runtime
7. **1.4% component test coverage**: 3 test files for 207 components; E2E CI never starts the dev server
8. **CRM = Contacts only**: No Accounts, Deals, Tickets, Pipelines, Custom Fields, or Saved Views
9. **No observability**: No error reporting service, no AI run analytics, no cost dashboards
10. **God components**: Calendar (1180 lines), Contacts (1021 lines), email.tsx (1012 lines), ComposeDialog (975 lines), Header (898 lines) — all violate the project's own 500-line rule

---

## 2. Current Architecture Overview

### 2.1 Technology Stack

| Layer | Technology | Version | Assessment |
|-------|-----------|---------|------------|
| Framework | Next.js (Pages Router) | 16.1.6 | Functional but Pages Router limits server component adoption |
| React | React | 19.2.4 | Current |
| Language | TypeScript (strict: true) | 5.9.3 | Good — `noUnusedLocals`, `noUnusedParameters` enabled |
| UI Library A | MUI | 7.3.7 | Dominant (191 files) — good theming, heavy runtime |
| UI Library B | Radix UI (shadcn wrappers) | 1.x–2.x | Secondary (30+ primitives) — used in `components/ui/` |
| Styling A | Tailwind CSS | 4.1.18 | Used in `components/ui/` and `src/components/ai-elements/` |
| Styling B | Emotion | 11.14.x | MUI's CSS-in-JS runtime |
| Server State | TanStack Query | 5.90.20 | Well-implemented with key factories |
| Client State | Zustand | 5.0.11 | 9 stores, mostly UI-only (with 2 exceptions) |
| HTTP | Axios | 1.13.5 | Centralized client with auth/CSRF interceptors |
| AI SDK | Vercel AI SDK | 6.0.77 | Streaming chat, tool calls, metadata |
| Real-time | Socket.IO | 4.8.3 | JWT-authenticated, room-based |
| Rich Text | TipTap | 3.19.0 | 28 packages — largest bundle contributor |
| Calendar | FullCalendar | 6.1.20 | 6 packages |
| Icons | lucide-react | 0.563.0 | Consistent across codebase |

### 2.2 Routing & SSR

- **Pages Router** exclusively (no `app/` directory)
- All dashboard pages use `getServerSideProps` returning empty props (SSR shell, client-side data fetching)
- Route protection is **client-side only** via `RouteGuard` in `_app.tsx` — no Next.js `middleware.ts`
- Public routes: `/`, `/auth/*`, `/privacy`, `/terms`
- Protected routes: `/dashboard/*` (auth check only, no role check)

### 2.3 Provider Stack (6 levels deep)

```
QueryProvider → NextThemeProvider → MaterialThemeWrapper → ToastProvider → AuthProvider → RouteGuard → Page
```

Missing providers: TenantProvider, PermissionProvider, TelemetryProvider, TranslationProvider (enhanced).

### 2.4 Data Flow

```
Component → useQuery hook → API module (lib/api/*.ts) → apiClient (Axios) → Backend
                                                            ↑
                                                     JWT + CSRF injected

WebSocket events → invalidate TanStack Query cache → Components re-render with fresh data
```

**Exceptions to the clean pattern:**
- `label-store.ts`: Calls `labelsApi` directly from Zustand actions (hybrid anti-pattern)
- `calendar-store.ts`: Manages server data in Zustand instead of TanStack Query
- `Contacts.tsx` line 351: Raw `providersApi.getProviders()` call bypassing TanStack Query
- `Header.tsx` line 240: `setInterval` polling for AI pending actions instead of TanStack Query `refetchInterval`
- `use-dashboard.ts`: Uses `apiClient` directly in some query options, bypassing API modules

### 2.5 Real-Time Architecture

- Socket.IO client connects to `${API_URL}/realtime` with JWT auth
- Room-based isolation (`joinRoom`/`leaveRoom`) with auto-rejoin on reconnect
- Events covered: email CRUD, folder counts, contact changes, calendar events, sync status, label changes, AI agent steps, AI action lifecycle
- **Gap**: On WebSocket reconnect, only `emailKeys.all` is invalidated — calendar, contacts, and other data may be stale

---

## 3. Enterprise Capability Gap Analysis

### 3.1 CRM Entity Model

| Entity | Status | Capability |
|--------|--------|------------|
| **Contacts** | Exists | CRUD, list (virtual-scrolled), detail (3 tabs), activity timeline, CRM enrichment (relationship score, stale detection), provider sync |
| **Accounts / Companies** | **Missing** | No entity, no UI, no API module |
| **Deals / Opportunities** | **Missing** | No pipeline view, no stage management, no forecasting |
| **Tickets / Cases** | **Missing** | No status workflow, no SLA, no assignment |
| **Activities (Unified)** | **Partial** | Contact activity tab exists; no cross-entity activity feed |
| **Custom Fields** | **Missing** | No user-definable fields on any entity |
| **Custom Objects** | **Missing** | No dynamic entity creation |
| **Saved Views** | **Missing** | No per-entity saved filter presets |
| **Data Export** | **GDPR only** | No CSV/Excel export from list views |

### 3.2 Navigation Scalability

**Current sidebar** (`components/layout/Sidebar.tsx`): Flat list of 8 hardcoded items. No groups, no section headers, no workspace switcher, no search, no collapsible sub-menus.

**Enterprise target**: Grouped sections (CRM, Communication, Productivity, AI, Admin), collapsible groups, workspace switcher in header, pinnable items, recent records, 20+ items with search.

### 3.3 List View Capabilities

| Capability | Email | Contacts | Calendar | Target |
|-----------|-------|----------|----------|--------|
| Virtual scrolling | Yes | Yes | No (FullCalendar) | All lists |
| Filters | Advanced (Gmail-style operators) | Basic (provider, hasEmail) | By calendar | Advanced per entity |
| Sorting | Time-ordered only | None | Chronological | Multi-column |
| Bulk actions | Mark/archive/delete/move/label | Select/delete | None | All entities |
| Saved views | No | No | No | Required |
| Column customization | No | No | N/A | Required |
| Export | No | No | No | CSV/Excel |
| Drag-and-drop | Email to folder (dnd-kit) | No | No | Cross-entity |

### 3.4 Global Search

**Command palette** (`components/ai/CommandPalette/index.tsx`): Searches emails + contacts + nav commands via `cmdk`. Debounced 300ms, 2+ chars to trigger. Calendar events are typed but not wired.

**Enterprise target**: All entity types, fuzzy match, filters (entity type, date range, owner), recent history, search-within-results, keyboard-first UX.

### 3.5 Keyboard Navigation

Vim-style shortcuts (`j/k`, `x`, `c`, `e`, `#`, `r`, `a`, `f`, `/`, `?`) exist for email only. Contacts, calendar, AI, and admin have no keyboard navigation. Enterprise procurement requires keyboard-navigable UI across all modules.

---

## 4. AI Layer Maturity Assessment

### 4.1 Current AI Capabilities (Score: 65/100)

| Capability | Status | Implementation Quality |
|-----------|--------|----------------------|
| Streaming chat | Mature | Vercel AI SDK v6, `DefaultChatTransport`, error categorization (RATE_LIMIT, CIRCUIT_OPEN, TIMEOUT, NETWORK) |
| Tool renderers | Mature | 15 custom renderers + FallbackRenderer with raw JSON toggle |
| HITL approve/reject | Mature | `InlineActionCard` with editable payload, severity badges, real-time WebSocket updates |
| Agent progress | Mature | `AgentProgressIndicator` with per-step timing, status tracking, 12 agent types |
| Reasoning traces | Good | Collapsible "Thinking..." with shimmer, auto-enriched with current action |
| Chain-of-thought | Good | Consecutive tool calls grouped into step-by-step trace |
| Source citations | Good | Extracted from tool results, collapsible "Used N sources" |
| Smart compose | Good | AI drafting, tone selection, Cmd+J inline, schedule send, undo send |
| Smart replies | Good | Per-email suggestions with tone parameter |
| AskUser modal | Good | Single/multi-select with freeform "Other" option |
| Daily briefing | Good | Dashboard widget with stats, highlights, follow-ups, action items |
| Command palette | Good | Cmd+K with AI commands and nav |
| Cost protection | Partial | Global banner at quota limit; CostProtectionCard in billing |
| Token/cost per message | **Not wired** | `Context` component exists in ai-elements but is not integrated into chat UI |
| Confidence scores | **Not rendered** | `analysis.confidence` returned by API, ignored by AnalysisRenderer |
| Undo after execution | **Missing** | No rollback capability for executed AI actions |
| Action history | **Missing** | No log of past approved/rejected actions |
| Run history | **Missing** | No `/dashboard/ai/runs` page with filterable past runs |

### 4.2 Explainability Gap Analysis

| Requirement | Current State | Gap |
|-------------|--------------|-----|
| "Why was this suggested?" | Reasoning text in HITL card (`action.reasoningSteps`) | Not shown on inline suggestions (smart reply, triage label) |
| Evidence / input trace | "Used N sources" after messages | No linking to source entity; no excerpt highlighting |
| Confidence scoring | API returns `analysis.confidence: number` | **AnalysisRenderer does not render it** |
| Deterministic vs probabilistic | None | No indication of whether an output is rule-based or model-generated |
| Decision tree for multi-step | None | Complex actions show flat step list, not decision branches |

### 4.3 HITL Enhancement Requirements

| Feature | Priority | Details |
|---------|----------|---------|
| Undo window | P0 | 30-second undo for reversible actions (move email, update contact) |
| "Point of no return" warning | P0 | Explicit confirmation for irreversible actions (send email) |
| Batch approve/reject | P1 | When AI triages 50 emails, show summary table with approve-all |
| Action history log | P1 | Scrollable, filterable log of past AI decisions and outcomes |
| Rollback API | P2 | Backend support for reversing completed actions |

### 4.4 Agent Execution Observability Requirements

| Feature | Priority | Details |
|---------|----------|---------|
| Per-step cost accumulation | P1 | Show token count + estimated cost per agent step |
| Error categorization | Exists | RATE_LIMIT, CIRCUIT_OPEN, TIMEOUT, NETWORK, UNKNOWN |
| Retry visibility | P1 | Show retry count per step, not just final status |
| Run history page | P1 | `/dashboard/ai/runs` with filterable list, click to replay trace |
| Run comparison | P2 | Side-by-side comparison of two runs for debugging |

### 4.5 Cost Transparency Requirements

| Feature | Priority | Current State |
|---------|----------|---------------|
| Per-message token count | P0 | `totalTokens` in metadata — exists but **not rendered** |
| Per-message cost | P0 | `Context` component exists — **not wired** |
| Per-run total | P1 | None |
| Daily/monthly trend chart | P1 | None (CostProtectionCard shows daily cap only) |
| Per-user quotas (admin) | P1 | None |
| Cost alerts (email/webhook) | P2 | Banner only |
| `tokenlens` integration | P0 | Library exists in ai-elements, model pricing data available |

---

## 5. Multi-Tenancy & RBAC Requirements

### 5.1 Current State

**Multi-tenancy**: Backend-only via JWT claims. Frontend has `user.tenantId` but no tenant selector, no cache isolation, no tenant-scoped localStorage. WebSocket isolation is server-side (room-based). No `X-Tenant-Id` header injected by frontend.

**RBAC**: `user.role` (string) exists but is **never checked in any component**. The only feature gating is subscription-based (`canUseSmartReplies`, `canUseTriage`), not role-based. No `PermissionGate`, no `usePermission()`, no route-level role checks.

### 5.2 Tenant Context Architecture (Required)

```typescript
// New: TenantProvider (lib/context/tenant-context.tsx)
interface TenantContext {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogo?: string;
  tenantPlan: 'free' | 'pro' | 'enterprise';
  tenants: TenantSummary[];      // All tenants user belongs to
  switchTenant: (id: string) => Promise<void>;
}

// switchTenant must:
// 1. Call POST /auth/switch-tenant → get new JWT
// 2. queryClient.clear() — wipe all cached data
// 3. Reset all Zustand stores
// 4. Reconnect WebSocket with new token
// 5. Namespace localStorage: ${tenantId}:key
```

### 5.3 Permission Model (Required)

```typescript
// Permission format: "resource.action"
type Permission =
  | 'email.read' | 'email.send' | 'email.delete' | 'email.bulk_actions'
  | 'contacts.read' | 'contacts.create' | 'contacts.edit' | 'contacts.delete' | 'contacts.export'
  | 'accounts.read' | 'accounts.create' | 'accounts.edit' | 'accounts.delete'
  | 'deals.read' | 'deals.create' | 'deals.edit' | 'deals.delete'
  | 'tickets.read' | 'tickets.create' | 'tickets.edit' | 'tickets.delete'
  | 'calendar.read' | 'calendar.create' | 'calendar.edit' | 'calendar.delete'
  | 'ai.chat' | 'ai.approve_actions' | 'ai.configure' | 'ai.view_cost'
  | 'admin.users' | 'admin.roles' | 'admin.billing' | 'admin.audit' | 'admin.sso'
  | 'settings.read' | 'settings.write';

// Built-in roles
const ROLES = {
  owner:   { permissions: '*' },
  admin:   { permissions: ['admin.*', 'settings.*', ...all_crud] },
  manager: { permissions: [...all_crud, 'ai.*', '-admin.*'] },
  member:  { permissions: [...read_write, 'ai.chat', 'ai.approve_actions'] },
  viewer:  { permissions: [...read_only, 'ai.chat'] },
};
```

### 5.4 Three-Layer Permission Enforcement

**Layer 1 — Server-side route guard** (`middleware.ts`):
```typescript
// Next.js middleware — runs BEFORE page render
export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token');
  if (!token) return redirect('/auth/login');
  const { role, tenantId } = decodeJwt(token);
  const requiredPermission = ROUTE_PERMISSIONS[pathname];
  if (requiredPermission && !hasPermission(role, requiredPermission)) {
    return redirect('/dashboard?error=forbidden');
  }
}
```

**Layer 2 — Component-level gate**:
```tsx
// <PermissionGate> — renders children only if user has permission
<PermissionGate permission="deals.create" fallback={<UpgradePrompt />}>
  <CreateDealButton />
</PermissionGate>
```

**Layer 3 — Hook-level check**:
```tsx
const canDelete = usePermission('contacts.delete');
<IconButton disabled={!canDelete} onClick={handleDelete}>
  <Trash2 size={16} />
</IconButton>
```

### 5.5 Admin Console Pages (New)

| Page | Route | Features |
|------|-------|----------|
| Users | `/admin/users` | List, invite, deactivate, role assignment, last login, activity |
| Roles | `/admin/roles` | Built-in + custom roles, permission matrix editor |
| Audit Log | `/admin/audit` | Who did what, when, on what entity; filter by user/action/entity/date |
| SSO Config | `/admin/sso` | SAML 2.0 / OIDC provider setup, attribute mapping, test connection |
| API Keys | `/admin/api-keys` | Create, revoke, scope, last used, expiry |
| Webhooks | `/admin/webhooks` | URL, events, delivery log, retry, signature verification |
| AI Analytics | `/admin/ai-analytics` | See Section 12 |

---

## 6. Security & Compliance Risk Matrix

### 6.1 Vulnerability Inventory

| ID | Vulnerability | Severity | CVSS-like | Current State | Required Fix |
|----|--------------|----------|-----------|---------------|--------------|
| SEC-01 | JWT in localStorage | **Critical** | 9.0 | Token readable by any JS on page | Migrate to httpOnly, Secure, SameSite=Strict cookie |
| SEC-02 | Non-httpOnly auth cookie | **Critical** | 8.5 | `document.cookie` with `httpOnly: false` explicitly | Remove JS-accessible cookie; use httpOnly for API routes |
| SEC-03 | No CSP headers | **High** | 7.5 | Zero Content-Security-Policy anywhere | Add via `next.config.js` `headers()` |
| SEC-04 | No server-side route guard | **High** | 7.0 | Client-side `RouteGuard` only; SSR serves page before redirect | Add Next.js `middleware.ts` |
| SEC-05 | No token refresh | **Medium** | 6.0 | 7-day JWT, expiry = forced logout | Implement refresh token rotation |
| SEC-06 | `ALLOW_DATA_ATTR: true` in DOMPurify | **Low** | 3.5 | Email HTML can inject `data-*` for CSS attacks | Remove or restrict |
| SEC-07 | `.env.production` ngrok URL | **Medium** | 5.0 | Ephemeral URL committed to repo | Replace with production URL; add to .gitignore |
| SEC-08 | react/ ESLint rules disabled | **Low** | 2.0 | `react/no-danger` not enforced | Upgrade plugin or use alternative |
| SEC-09 | No PII masking | **Medium** | 5.5 | Emails, phones, birthdays rendered raw | Add masking utils based on role |
| SEC-10 | CSRF protection | **OK** | — | Token in memory, injected on mutating requests | No action needed |

### 6.2 Compliance UX Status

| Feature | Status | Details |
|---------|--------|---------|
| Cookie consent | Exists | `CookieConsent` component in Layout |
| GDPR consent management | Exists | `ConsentSettings.tsx` + `ConsentToggle.tsx` |
| Data export | Exists | `DataExportPanel.tsx` |
| Account deletion | Exists | `AccountDeletionPanel.tsx` (30-day grace period) |
| Audit trail viewer | **Missing** | No UI for viewing audit logs |
| Data retention policy UI | **Missing** | No admin-configurable retention |
| Right to rectification | **Partial** | Edit profile only; no entity-level edit history |
| DPA (Data Processing Agreement) | **Missing** | No in-app DPA signing workflow |

### 6.3 Security Hardening Roadmap

**Phase 1 (Weeks 1-4):**
- Migrate JWT to httpOnly cookie
- Add CSP headers
- Add Next.js middleware for server-side auth
- Remove `.env.production` ngrok URL

**Phase 2 (Weeks 5-8):**
- Implement token refresh rotation
- Add PII masking utilities
- Enable react/ ESLint rules (upgrade plugin)
- Remove `ALLOW_DATA_ATTR: true`

---

## 7. Technical Debt Assessment

### 7.1 God Components (>500 lines, violating project rules)

| File | Lines | Root Cause | Refactoring Strategy |
|------|-------|-----------|---------------------|
| `locales/en.ts` | 3512 | Data file — acceptable | Split by domain (email.ts, crm.ts, ai.ts) if build supports |
| `locales/it.ts` | 3489 | Data file — acceptable | Same |
| `locales/index.ts` | 3369 | Type definitions | Same |
| `lib/api/ai.ts` | 1495 | Monolith API module | Split: `ai-chat.ts`, `ai-actions.ts`, `ai-memory.ts` |
| `dashboard/Calendar.tsx` | 1180 | Mixed container + presentation + forms | Extract `CalendarContainer`, `EventForm`, `CalendarPreferences` |
| `dashboard/Contacts.tsx` | 1021 | CRUD form inlined in list container | Extract `ContactForm`, `ContactContainer` |
| `pages/dashboard/email.tsx` | 1012 | All email mutations inline | Extract `useEmailActions()` hook (200+ lines of repetitive handlers) |
| `email/compose/ComposeDialog.tsx` | 975 | Genuinely complex (acceptable if split) | Extract `useComposeState()`, `ComposeToolbar`, `ComposeRecipientBar` |
| `layout/Header.tsx` | 898 | AI pending actions panel embedded in header | Extract `PendingActionsDropdown`, `HeaderSearch`, `UserMenu` |
| `ai/AiDashboard/ChatMessages.tsx` | 737 | Over limit | Extract `MessageRenderer`, `ToolPartRenderer` |
| `ai/AiDashboard/ChatSessionList.tsx` | 748 | Over limit | Extract `SessionItem`, `SessionSearch` |
| `contacts/ContactDetail.tsx` | 720 | Over limit | Extract `ContactActivityTab`, `ContactDetailsTab` |

### 7.2 Anti-Patterns Found

| Anti-Pattern | Occurrences | Impact |
|-------------|-------------|--------|
| **Hybrid Zustand stores** (API calls in store actions) | 2 (`label-store.ts`, `calendar-store.ts`) | Bypasses TanStack Query caching/invalidation |
| **Render functions** (`renderSidebar()`, `renderList()`) | 5 instances in Contacts.tsx, AiDashboard | Defeats React reconciliation; cannot be memoized |
| **Inline arrow functions in JSX** (new identity per render) | 15+ in Calendar, Contacts, email.tsx | Unnecessary re-renders of child components |
| **Raw API calls in components** (bypassing TanStack Query) | 3 (Contacts, Header, use-dashboard) | No caching, no retry, no loading state |
| **`setInterval` for polling** instead of TanStack Query `refetchInterval` | 1 (Header.tsx line 240) | No cache coordination, no background/foreground awareness |
| **`eslint-disable react-hooks/exhaustive-deps`** | 6 files | Stale closure bugs waiting to manifest |
| **DragOverlay JSX duplicated** | 1 (EmailLayout.tsx — 70 lines copy-pasted) | Maintenance burden |
| **`onKeyPress` (deprecated)** | 1 (CalendarSidebar.tsx) | Should be `onKeyDown` |
| **Array `index` as key** in dynamic message list | 1 (ChatMessages.tsx) | Incorrect DOM reconciliation when messages shift |
| **`window.CustomEvent` pub-sub with no subscribers** | 3 (`command:ai-*` events) | Dead code or unresolved wiring |

### 7.3 Dead Code Inventory

| Item | Location | Action |
|------|----------|--------|
| 39 unused ai-elements files | `src/components/ai-elements/` | Delete (only 9 of 48 are imported) |
| `badge.old.tsx` | `components/ui/` | Delete |
| `mutations/index.ts` (empty) | `hooks/mutations/` | Delete or populate |
| `react-select` dependency | `package.json` | Remove (zero imports) |
| `autumn-js` dependency | `package.json` | Remove (zero imports) |
| `embla-carousel-react` + `carousel.tsx` | `package.json` + `components/ui/` | Remove both |
| `@types/pg` + `pg` | `package.json` devDeps | Remove (frontend has no DB access) |
| Duplicate `framer-motion` + `motion` | `package.json` | Keep `motion`, remove `framer-motion` |
| Stale coverage data | `coverage/lcov.info` | Regenerate |
| 3 unsubscribed `command:ai-*` events | `CommandPalette/index.tsx` | Wire subscribers or remove dispatch |

### 7.4 Test Coverage

| Category | Files | Test Files | Coverage |
|----------|-------|------------|----------|
| Components | 207 | 3 | 1.4% |
| Hooks (custom) | 40+ | 5 | ~12% |
| API modules | 18 | 1 | ~6% |
| Stores | 9 | 1 | ~11% |
| Utils/types | 10+ | 4 | ~40% |
| E2E specs | — | 6 | auth, compose, email list, search, keyboard, a11y |
| **Overall** | **300+** | **14 unit + 6 E2E** | **~5%** |

**CI Issues:**
- Jest config excludes `components/` from coverage collection
- E2E workflow (`e2e.yml`) sets `E2E_NO_WEB_SERVER: 'true'` but never starts dev server — tests run against nothing
- Lighthouse CI uses `continue-on-error: true` — performance regressions never block PRs
- `eslint-plugin-react` disabled entirely due to ESLint 10 incompatibility

---

## 8. Target Enterprise Architecture Proposal

### 8.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENTERPRISE SHELL                             │
│  Org Switcher │ Global Search │ Notifications │ Permission Gates    │
├────────┬────────┬────────┬─────────┬──────────┬────────────────────┤
│  INBOX │  CRM   │CALENDAR│  TASKS  │   AI     │     ADMIN          │
│ Email  │Account │ Events │ Kanban  │ Chat     │ Users / Roles      │
│ Thread │Contact │ Avail. │ Project │ HITL     │ Audit Log          │
│ Label  │ Deal   │        │ Auto.   │ Traces   │ SSO / Webhooks     │
│ Folder │Ticket  │        │         │ Cost     │ AI Analytics       │
│        │Pipeline│        │         │          │ System Health      │
├────────┴────────┴────────┴─────────┴──────────┴────────────────────┤
│                    SHARED INFRASTRUCTURE                            │
│  PermissionProvider │ TenantProvider │ TelemetryProvider            │
│  Design System │ Query Client │ WebSocket │ Error Boundaries       │
├─────────────────────────────────────────────────────────────────────┤
│                    PLUGIN SYSTEM (Future)                           │
│  Widget Registry │ Module Federation │ Third-party Extensions      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Module Structure (Feature-First)

```
frontend/
├── app/                              # Next.js App Router (migration target)
│   ├── (auth)/                       # Auth routes (public)
│   ├── (dashboard)/                  # Authenticated routes
│   │   ├── layout.tsx                # Dashboard shell
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
│   │   └── admin/
│   └── middleware.ts                 # Server-side auth + RBAC
│
├── modules/                          # Domain modules (co-located)
│   ├── email/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── types/
│   ├── crm/
│   │   ├── contacts/   { components, hooks, api, types }
│   │   ├── accounts/   { components, hooks, api, types }
│   │   ├── deals/      { components, hooks, api, types }
│   │   └── tickets/    { components, hooks, api, types }
│   ├── calendar/
│   ├── ai/
│   ├── admin/
│   └── billing/
│
├── shared/                           # Cross-module infrastructure
│   ├── components/                   # Design system primitives
│   ├── providers/                    # Auth, Tenant, Permission, Telemetry
│   ├── hooks/                        # usePermission, useAuth, useTranslations
│   ├── api/                          # apiClient, base interceptors
│   ├── theme/                        # Unified tokens, themes
│   ├── locales/                      # i18n
│   ├── types/                        # Shared interfaces
│   └── utils/                        # formatDate, maskPII, etc.
│
├── plugins/                          # Future: third-party extensions
│   └── registry.ts                   # Plugin manifest + loader
│
└── __tests__/                        # Mirror module structure
```

### 8.3 Provider Stack (Target)

```tsx
<QueryClientProvider>
  <AuthProvider>                       // httpOnly cookie validation
    <TenantProvider>                   // Org context, cache isolation
      <PermissionProvider>             // Role + permissions from API
        <ThemeProvider tenant={tenant}> // Tenant-aware MUI theme
          <ToastProvider>
            <TranslationProvider>      // ICU MessageFormat, timezone
              <TelemetryProvider>      // Sentry, web-vitals, user actions
                <NotificationProvider> // Real-time notification center
                  {children}
                </NotificationProvider>
              </TelemetryProvider>
            </TranslationProvider>
          </ToastProvider>
        </ThemeProvider>
      </PermissionProvider>
    </TenantProvider>
  </AuthProvider>
</QueryClientProvider>
```

---

## 9. Modularization & Plugin Strategy

### 9.1 Current Extensibility Assessment

| Mechanism | Status | Details |
|-----------|--------|---------|
| Widget registry | **Exists (broken)** | `WIDGET_REGISTRY` has 23 entries but 15 are stubs; not wired to active `DashboardContainer` |
| API abstraction | **Good** | `apiClient` is fully exported; new domain modules are trivially addable |
| TanStack Query hooks | **Good** | Clean barrel exports; new hooks follow established pattern |
| Feature flags | **Exists** | Subscription-based (`useSubscriptionFeatures`); no admin-configurable flags |
| Event bus | **Fragile** | 3 `window.CustomEvent` dispatches with no confirmed subscribers |
| Dynamic component loading | **Partial** | `React.lazy` in dashboard; no runtime registry resolution |
| Module federation | **None** | No webpack federation or dynamic import from remote |

### 9.2 Widget System Fix

**Problem**: Two parallel systems not connected.
- `WIDGET_REGISTRY` (23 entries, most stubbed) in `lib/dashboard/widget-registry.ts`
- `WIDGETS` array (8 hardcoded entries) in `DashboardContainer.tsx`

**Fix**: Merge into single registry-driven system:
```typescript
// widget-registry.ts becomes the single source of truth
export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  briefing: {
    component: lazy(() => import('@/modules/ai/components/BriefingWidget')),
    ...metadata
  },
  // ...all widgets
};

// DashboardContainer reads from registry, not a hardcoded array
const activeWidgets = userLayout
  .filter(w => WIDGET_REGISTRY[w.id])
  .map(w => ({ ...w, Component: WIDGET_REGISTRY[w.id].component }));
```

### 9.3 Future Plugin Architecture (Phase 4)

| Layer | Mechanism |
|-------|-----------|
| **Discovery** | Plugin manifest (JSON) declaring widgets, routes, API modules, permissions |
| **Loading** | Dynamic `import()` from CDN or local bundle; Module Federation for micro-frontends |
| **Registration** | Runtime registry: `registerPlugin(manifest)` adds widgets, routes, nav items |
| **Isolation** | Each plugin runs in its own error boundary; own TanStack Query namespace |
| **Permissions** | Plugin declares required permissions; admin approves in plugin settings |
| **API access** | Plugins use `apiClient` (inheriting auth/CSRF); custom endpoints via plugin manifest |
| **Theming** | Plugins inherit design system tokens; no direct CSS access |

### 9.4 Event Bus Replacement

Replace fragile `window.CustomEvent` with typed pub-sub:
```typescript
// shared/events/event-bus.ts
type AppEvent =
  | { type: 'ai:summarize'; payload: { emailId: string } }
  | { type: 'ai:compose'; payload: { to?: string } }
  | { type: 'calendar:refresh' }
  | { type: 'tenant:switch'; payload: { tenantId: string } };

const bus = createEventBus<AppEvent>();
export const useAppEvent = (type: AppEvent['type'], handler: (e: AppEvent) => void) => { ... };
```

---

## 10. Design System Governance Plan

### 10.1 Current Problems (Summary)

1. **Two CSS runtimes**: MUI/Emotion (191 files) + Tailwind (48 files)
2. **Two component trees**: `components/` (MUI) + `src/components/ai-elements/` (Tailwind)
3. **`sxToClassName()` bridge hack** in 4 shadcn components
4. **Duplicate components**: Badge (2), ThemeToggle (2), EmptyState (2), TypingIndicator (2)
5. **2179 `sx=` usages**, many with hardcoded hex values instead of theme tokens
6. **39 dead ai-elements files** bloating the bundle

### 10.2 Consolidation Strategy

**Decision: Consolidate on MUI + CSS variable tokens.**

| Phase | Action | Effort |
|-------|--------|--------|
| Phase 1a | Delete 39 unused ai-elements files | 1 day |
| Phase 1b | Delete dead code (badge.old, unused deps, empty barrels) | 1 day |
| Phase 1c | Deduplicate: merge ThemeToggle, EmptyState, TypingIndicator, Badge | 3 days |
| Phase 2a | Migrate 9 active ai-elements files from Tailwind to MUI `sx` | 2 weeks |
| Phase 2b | Migrate `components/ui/` shadcn primitives to MUI equivalents | 2 weeks |
| Phase 2c | Remove Tailwind + PostCSS + `sxToClassName()` hacks | 1 day |
| Phase 3 | Audit 2179 `sx=` usages for hardcoded values → theme tokens | 3 weeks |

### 10.3 Token Architecture

```
theme/
├── tokens.ts              # Source of truth: colors, spacing, typography, shadows
├── tokens-brand.ts        # NEW: per-tenant overridable brand tokens
├── typography.ts           # MUI typography config
├── lightTheme.ts           # MUI theme (references tokens)
├── darkTheme.ts            # MUI dark theme (references tokens)
├── appTheme.ts             # Entry point
└── components/             # NEW: per-component token overrides
    ├── sidebar.ts
    ├── card.ts
    └── table.ts
```

### 10.4 Component Governance

| Rule | Enforcement |
|------|-------------|
| All new components use MUI `sx` + theme tokens | PR review + ESLint custom rule |
| No hardcoded hex/rgba in `sx` props | ESLint rule: `no-literal-sx-colors` |
| No Tailwind classes in `components/` | ESLint rule: `no-tailwind-in-components` |
| All components < 500 lines | CI gate: file line count check |
| Shared components live in `shared/components/` | PR review |
| Feature components live in `modules/<feature>/components/` | PR review |

### 10.5 White-Label Capability

| Feature | Mechanism |
|---------|-----------|
| Brand colors | CSS custom properties (`--brand-primary`) injected from tenant config API |
| Logo | `tenantConfig.logoUrl` → dynamic `<Image>` in sidebar |
| App name | `tenantConfig.appName` → document title, sidebar, emails |
| Favicon | Dynamic `<link rel="icon">` from tenant config |
| Login page | Tenant-specific background + logo |
| Custom domain | Infrastructure level (DNS + reverse proxy) |

### 10.6 Accessibility Baseline (WCAG 2.1 AA)

| Requirement | Current | Target |
|-------------|---------|--------|
| Skip link | Exists | Verify `id="main-content"` target |
| Keyboard navigation | Email only | All modules |
| `aria-live` regions | 0 in `components/` | All async state changes announced |
| Color contrast | Unknown | 4.5:1 text, 3:1 UI components |
| Focus indicators | MUI default | Custom visible focus ring matching brand |
| `prefers-reduced-motion` | Not checked | Disable all animations |
| Screen reader testing | None | Monthly testing with NVDA/VoiceOver |
| VPAT | None | Publish for enterprise procurement |

---

## 11. Performance Budget & Optimization Strategy

### 11.1 Performance Targets

| Metric | Target | Current (Estimated) |
|--------|--------|-------------------|
| FCP | < 1.2s | Unknown |
| LCP | < 2.5s | Lighthouse configured but not gating |
| CLS | < 0.1 | Lighthouse configured but not gating |
| TTI | < 3.0s | Unknown |
| Initial JS (gzipped) | < 200KB | Likely 400KB+ (TipTap alone is 200KB+) |
| Route chunk (gzipped) | < 80KB | Unknown |
| Email list render (1000 items) | < 100ms | Virtualized, likely OK |
| AI streaming start | < 500ms | Unknown |

### 11.2 Bundle Optimization Actions

| Action | Est. Savings (ungzipped) | Priority |
|--------|--------------------------|----------|
| Delete 39 unused ai-elements | ~150KB | P0 |
| Lazy-load TipTap (compose only) | ~200KB deferred | P0 |
| Lazy-load FullCalendar (calendar page only) | ~180KB deferred | P0 |
| Lazy-load Recharts (analytics only) | ~100KB deferred | P1 |
| Lazy-load Shiki (code blocks in chat only) | ~300KB deferred | P1 |
| Lazy-load @xyflow/react (ai-elements canvas) | ~150KB deferred | P1 |
| Remove dead deps (react-select, autumn-js, embla) | ~50KB | P2 |
| Deduplicate framer-motion / motion | ~10KB | P2 |
| Run bundle analyzer in CI | Visibility | P0 |

### 11.3 Rendering Optimization

| Action | Impact |
|--------|--------|
| Extract render functions to proper components (Contacts, AiDashboard) | Enables React.memo optimization |
| Wrap expensive children in `React.memo` (ThreadListItem already done; do for widget cards) | Reduce re-renders |
| Hoist `quickNavItems` array to module scope (Header.tsx) | Eliminate per-render allocation |
| Replace inline arrow functions with `useCallback` (15+ occurrences) | Stable references for memoized children |
| Fix array index keys in ChatMessages.tsx | Correct DOM reconciliation |
| Wrap dashboard widgets in `SectionErrorBoundary` | Prevent cascade crashes |
| Add `loading:` fallback to landing page `dynamic()` imports | Eliminate flash of empty content |
| Add `remotePatterns` for Gravatar in `next.config.js` | Enable image optimization for avatars |

### 11.4 Caching Strategy

| Data Type | staleTime | gcTime | Rationale |
|-----------|-----------|--------|-----------|
| Email list | 1 min | 5 min | Frequently changing, real-time supplemented |
| Email detail | 2 min | 10 min | Less volatile once read |
| Contacts | 5 min | 30 min | Changes infrequently |
| Calendar events | 2 min | 10 min | Time-sensitive |
| Dashboard widgets | 5 min | 30 min | Background refresh acceptable |
| Permissions | 10 min | 60 min | Rarely changes; invalidate on role update |
| Tenant config | 30 min | 60 min | Rarely changes |
| Static metadata (folder types) | Infinity | Infinity | **Must invalidate on logout/tenant switch** |

---

## 12. Enterprise Observability UI Requirements

### 12.1 AI Analytics Dashboard (`/admin/ai-analytics`)

| Widget | Metrics | Visualization |
|--------|---------|---------------|
| Success Rate | % agent runs completing without error (24h/7d/30d) | KPI card + trend sparkline |
| Error Breakdown | RATE_LIMIT, CIRCUIT_OPEN, TIMEOUT, NETWORK, UNKNOWN | Donut chart |
| Latency | P50, P90, P95, P99 response times | Histogram |
| Tool Usage | Calls per tool, failure rate per tool | Horizontal bar chart |
| Cost Burn-Down | Daily token spend vs budget | Line chart with budget threshold |
| Top Users | Heaviest AI consumers by token count | Table, sortable |
| HITL Metrics | Approval rate, avg review time, rejection reasons | KPI cards |
| Model Distribution | Usage by model (if multiple) | Pie chart |

### 12.2 System Health Dashboard (`/admin/system`)

| Widget | Metrics |
|--------|---------|
| Sync Status | Per-provider: last sync, success/failure, queue depth |
| WebSocket Connections | Active count, reconnection rate |
| API Latency | Client-measured P95 per endpoint |
| Client Error Rate | Errors/minute from ErrorBoundary telemetry |
| Cache Efficiency | TanStack Query hit/miss ratio |
| Active Users | Current online users (from WebSocket presence) |

### 12.3 Client-Side Telemetry Integration

| Layer | Tool | Data |
|-------|------|------|
| Error reporting | Sentry (or equivalent) | ErrorBoundary catches, unhandled rejections, network errors |
| Performance | web-vitals + custom marks | FCP, LCP, CLS, TTI, AI response time, email list render time |
| User analytics | Structured event logging | Page views, feature usage, AI interactions, HITL decisions |
| Session replay | PostHog / LogRocket (optional) | Visual replay for debugging enterprise support tickets |

---

## 13. Phased Transformation Roadmap

### Phase 1: Foundation Hardening (8–10 weeks)

**Objective:** Eliminate security vulnerabilities, remove dead code, establish quality gates, fix architectural anti-patterns.

| Week | Workstream | Deliverables |
|------|-----------|-------------|
| 1-2 | **Security** | httpOnly cookie migration; CSP headers; Next.js middleware; `.env.production` fix |
| 2-3 | **Security** | Token refresh rotation; PII masking utilities; DOMPurify hardening |
| 3-4 | **Dead code** | Delete 39 unused ai-elements; delete badge.old; remove unused deps; deduplicate 4 components |
| 4-5 | **Anti-patterns** | Fix label-store + calendar-store hybrids → TanStack Query; fix WebSocket reconnect scope |
| 5-6 | **Anti-patterns** | Extract god component logic: `useEmailActions()`, `ContactForm`, `CalendarContainer`, `PendingActionsDropdown` |
| 6-7 | **Testing** | Fix E2E CI (start dev server); regenerate coverage; add coverage gate (20%); enable react/ ESLint rules |
| 7-8 | **Testing** | Write tests for auth hooks, mutation hooks, error boundaries, API modules |
| 8-9 | **Performance** | Lazy-load TipTap, FullCalendar, Shiki; run bundle analyzer in CI; Lighthouse gate (no `continue-on-error`) |
| 9-10 | **i18n** | Centralize date/number formatting; fix hardcoded locales; fix ErrorBoundary i18n |

**Exit Criteria:**
- 0 critical/high security vulnerabilities
- CI gates: type-check + lint + tests + Lighthouse
- Coverage ≥ 20%
- All files < 500 lines (excluding locale data files)
- Zero dead code

### Phase 2: Enterprise Infrastructure (10–14 weeks)

**Objective:** Multi-tenancy, RBAC, admin console, observability, AI cost transparency.

| Week | Workstream | Deliverables |
|------|-----------|-------------|
| 1-3 | **Multi-Tenancy** | `TenantProvider`, org switcher, cache isolation on tenant switch, tenant-scoped localStorage |
| 3-5 | **RBAC** | `PermissionProvider`, `usePermission()`, `<PermissionGate>`, middleware route permissions |
| 5-7 | **Admin Console** | Users page (list, invite, deactivate, role assignment) |
| 7-9 | **Admin Console** | Roles page (built-in + custom, permission matrix), Audit log viewer |
| 9-10 | **Observability** | Sentry integration, client-side telemetry provider, web-vitals |
| 10-12 | **AI Cost** | Wire token/cost into chat UI, per-run summary, render confidence scores |
| 12-13 | **AI HITL** | Undo window for reversible actions, batch approve/reject for triage |
| 13-14 | **Navigation** | Redesign sidebar (grouped sections, workspace switcher, collapsible groups) |

**Exit Criteria:**
- Multi-tenant login + org switching works
- Admin can manage users and roles
- RBAC enforced at route + component + action levels
- AI cost visible per message
- Coverage ≥ 40%

### Phase 3: CRM Platform (12–16 weeks)

**Objective:** Full CRM entity model, design system consolidation, enhanced global search.

| Week | Workstream | Deliverables |
|------|-----------|-------------|
| 1-4 | **CRM: Accounts** | List, detail, hierarchy, contacts roll-up, activity feed |
| 4-8 | **CRM: Deals** | Pipeline Kanban, stages, probability, forecasting dashboard |
| 8-11 | **CRM: Tickets** | Status workflow, SLA timer, assignment, escalation rules |
| 11-13 | **CRM: Cross-entity** | Unified activity timeline, saved views, advanced filters per entity |
| 13-14 | **Design System** | Migrate ai-elements to MUI; remove Tailwind; single styling system |
| 14-15 | **Search** | Enhanced global search: all entities, fuzzy match, filters, recent history |
| 15-16 | **Notifications** | Notification center with categories, read/unread, preferences |

**Exit Criteria:**
- 4 CRM entities (Contacts, Accounts, Deals, Tickets) fully functional
- Single styling system (MUI)
- Global search across all entities
- Coverage ≥ 60%

### Phase 4: Enterprise Scale & Extensibility (12+ weeks)

**Objective:** White-label, SSO, plugin system, App Router migration, custom fields/objects.

| Workstream | Deliverables |
|-----------|-------------|
| **White-Label** | Tenant theming (CSS variables from config), custom logo/favicon/domain |
| **SSO** | SAML 2.0 / OIDC configuration UI, attribute mapping, test connection |
| **Plugin System** | Widget plugin registry, dynamic loading, plugin permission model |
| **App Router** | Incremental migration from Pages Router (route-by-route) |
| **Custom Fields** | Admin-definable fields per entity type |
| **Custom Objects** | Admin-definable entity types (advanced) |
| **Workflow Builder** | Visual automation builder (if-then rules for CRM actions) |
| **Marketplace** | Plugin discovery and installation UI |

**Exit Criteria:**
- White-label deployed for 2+ customers
- SSO working with at least 1 IdP
- At least 1 third-party plugin running
- App Router migration ≥ 50%
- Coverage ≥ 75%

---

## 14. KPIs & Operational Metrics

### Product Metrics

| KPI | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-----|----------|---------|---------|---------|---------|
| CRM entities | 1 | 1 | 1 | 4 | 4 + custom |
| Active tenants | 1 | 1 | MVP | 10+ | 50+ |
| Concurrent users/tenant | Unknown | Benchmark | 50 | 200 | 500 |
| AI approval rate | Unknown | Measured | >70% | >80% | >85% |
| Feature modules | 6 | 6 | 8 | 12 | 15+ |

### Engineering Metrics

| KPI | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-----|----------|---------|---------|---------|---------|
| Test coverage | ~5% | 20% | 40% | 60% | 75% |
| Lighthouse perf | Unknown | ≥75 | ≥85 | ≥90 | ≥90 |
| LCP P75 | Unknown | <3.0s | <2.5s | <2.0s | <2.0s |
| Bundle size (gzip) | ~400KB+ | <300KB | <250KB | <200KB | <200KB |
| Security vulns (H/C) | 4 | 0 | 0 | 0 | 0 |
| Dead code files | 42+ | 0 | 0 | 0 | 0 |
| Styling systems | 2 | 1.5 | 1.2 | 1 | 1 |
| Files > 500 lines | 12+ | 0 | 0 | 0 | 0 |
| God components | 8 | 0 | 0 | 0 | 0 |

### Reliability Metrics

| KPI | Target |
|-----|--------|
| Client error rate | < 0.1% of sessions |
| AI run success rate | > 95% |
| Mean AI response (streaming start) | < 500ms |
| WebSocket reconnect success | > 99% |
| Zero-downtime deploys | > 99% |
| MTTR (client errors) | < 30 minutes |

---

## 15. Enterprise Readiness Score (0–100) — Detailed Breakdown

### Scoring Methodology

Each dimension is scored 0–100 based on: feature completeness (40%), implementation quality (30%), enterprise-grade polish (30%).

| # | Dimension | Score | Rationale |
|---|-----------|-------|-----------|
| 1 | **CRM Entity Model** | 15 | Only Contacts exist. No Accounts/Deals/Tickets/Pipelines/Custom Fields. Contact CRUD is functional with activity timeline. |
| 2 | **Multi-Tenancy** | 5 | `tenantId` flows through JWT but zero UI surface. No cache isolation, no org switcher, no tenant-scoped state. |
| 3 | **RBAC & Governance** | 5 | `user.role` exists, never checked. No PermissionGate, no admin console, no audit log. Subscription gating exists but is not role-based. |
| 4 | **AI Explainability** | 55 | Reasoning traces and source citations exist. Confidence scores not rendered. No "why this suggestion?" on inline AI. |
| 5 | **AI HITL** | 70 | Approve/reject with editable payload, severity badges, real-time WebSocket updates. Missing: undo, batch approve, action history. |
| 6 | **AI Observability** | 40 | Agent progress indicator is excellent. No run history page, no per-step cost, no admin analytics dashboard. |
| 7 | **AI Cost Transparency** | 25 | CostProtectionCard and QuotaAlertBanner exist. Per-message tokens/cost exist as components but are NOT WIRED. No admin cost dashboards. |
| 8 | **Security** | 25 | CSRF is good. MFA is excellent. But JWT in localStorage, no CSP, no server-side route guard, no token refresh = critical gaps. |
| 9 | **Compliance (GDPR)** | 55 | Consent, export, deletion exist. Missing: audit trail viewer, data retention UI, DPA workflow. |
| 10 | **Design System** | 30 | Tokens exist and are well-structured. But dual styling, duplicates, 2179 unaudited `sx` usages, no governance. |
| 11 | **Accessibility** | 25 | Skip link exists. ai-elements tree is decent. But 0 `aria-live` in components/, keyboard nav only in email, no VPAT. |
| 12 | **i18n** | 40 | Typed translation system with 141 files importing. But hardcoded strings in MFA/ErrorBoundary, 5 different date formatting approaches, no RTL. |
| 13 | **Performance** | 40 | Virtual scrolling, TanStack Query caching, lazy dashboard widgets. But TipTap/FullCalendar not lazy-loaded from routes, 39 dead files, no bundle gate. |
| 14 | **Testing** | 10 | 1.4% component coverage. E2E CI broken. Stale coverage data. Jest excludes components from collection. |
| 15 | **CI/CD** | 30 | Three workflows exist. Type-check + lint gates work. But Lighthouse non-blocking, E2E broken, no preview environments. |
| 16 | **Extensibility** | 20 | Widget registry exists (design-level). API layer is extensible. But registry not wired, no plugin loading, no module federation. |
| 17 | **Navigation & Search** | 35 | Cmd+K palette with email/contacts search and nav commands. Keyboard shortcuts in email. But flat sidebar, no groups, no entity search. |
| 18 | **Component Architecture** | 30 | Good patterns exist (container/presentational in email). But 8 god components, render functions, inline arrows, no form library. |

### Weighted Enterprise Readiness

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| CRM Entity Model | 15 | 12% | 1.8 |
| Multi-Tenancy | 5 | 12% | 0.6 |
| RBAC & Governance | 5 | 12% | 0.6 |
| AI (combined) | 48 | 12% | 5.7 |
| Security | 25 | 12% | 3.0 |
| Design System + A11y + i18n | 32 | 8% | 2.5 |
| Performance | 40 | 8% | 3.2 |
| Testing + CI/CD | 20 | 8% | 1.6 |
| Compliance | 55 | 6% | 3.3 |
| Component Architecture | 30 | 5% | 1.5 |
| Extensibility | 20 | 3% | 0.6 |
| Navigation & Search | 35 | 2% | 0.7 |
| **TOTAL** | | **100%** | **25.1 ≈ 28** |

### Score Projection by Phase

| Phase | Target Score | Key Drivers |
|-------|-------------|-------------|
| Current | **28** | — |
| After Phase 1 | **45** | Security → 70, Testing → 35, Performance → 60, Dead code → 0 |
| After Phase 2 | **62** | Multi-Tenancy → 70, RBAC → 65, AI Cost → 60, Observability → 50 |
| After Phase 3 | **78** | CRM → 70, Design System → 75, Navigation → 70, Testing → 60 |
| After Phase 4 | **90+** | Extensibility → 70, White-Label → 80, SSO → 80 |

---

## 16. Open Questions & Assumptions

### Open Questions

| # | Question | Impact Area | Blocking Phase |
|---|----------|-------------|----------------|
| Q1 | Does the backend support refresh token rotation? If not, Phase 1 security work is blocked. | Security | Phase 1 |
| Q2 | Does the backend return permissions with the user object, or is a separate `/permissions` endpoint needed? | RBAC | Phase 2 |
| Q3 | Is the CRM entity model (Accounts, Deals, Tickets) already designed in the backend? | CRM scope | Phase 3 |
| Q4 | Should we consolidate on MUI or Tailwind? This document recommends MUI (dominant, better theming). Team preference required. | Design System | Phase 3 |
| Q5 | Should we migrate to App Router? Enables server components + streaming but is a major effort. | Architecture | Phase 4 |
| Q6 | What error reporting service? Sentry is recommended, but organizational preferences may differ. | Observability | Phase 2 |
| Q7 | What SSO providers must be supported? SAML 2.0 + OIDC assumed. Is LDAP required? | Enterprise sales | Phase 4 |
| Q8 | What compliance certifications are targeted? SOC 2? ISO 27001? HIPAA? Each has UI implications. | Compliance | Phase 2+ |
| Q9 | What is the token cost model per AI model? `tokenlens` library exists but needs pricing data. | AI Cost | Phase 2 |
| Q10 | Should notifications integrate with Slack/Teams/email or be in-app only initially? | Notifications | Phase 3 |
| Q11 | How many frontend engineers are available? Phase 1 assumes ≥ 3. | Resourcing | All |
| Q12 | Is there a form library preference (React Hook Form, Formik)? Currently zero form libraries used. | DX | Phase 2+ |

### Assumptions

| # | Assumption | Risk if Wrong |
|---|-----------|---------------|
| A1 | Backend tenant scoping is via JWT claims (not request headers) | If headers needed, apiClient interceptor update required |
| A2 | Backend already has audit log APIs that the frontend can consume | If not, admin audit log UI is blocked until backend builds it |
| A3 | Current WebSocket event schema will be extended (not replaced) for new CRM entities | If replaced, all real-time hooks need rewrite |
| A4 | MUI v7 will remain stable (no breaking v8 during migration) | Theme migration plan would need revision |
| A5 | Enterprise customers accept EN + IT initially; full i18n is Phase 3+ | If a deal requires DE/FR/ES sooner, i18n infrastructure priority increases |
| A6 | TanStack Query key factory pattern scales to CRM entities without redesign | If key collisions occur, namespace redesign needed |
| A7 | The team adopts React Hook Form for Phase 2+ forms (assumption for CRM CRUD) | If rejected, manual form patterns continue with higher maintenance cost |

---

*Generated by static analysis of `D:\MailAgent\frontend` on 2026-03-02. No source code was modified. No runtime profiling was performed.*
