# Phase 133 — UX Unification & Auto-Population

## Goal

Make PMSync a **self-populating, context-aware system** per the PMS design philosophy (`docs/Sistema_Logico_PMS_COMPLETO.md`). The user works with Mail, Calendar, Contacts — the system automatically creates CRM accounts, links deals, opens tickets, and populates analytics. Today CRM pages are sparse and disconnected: empty dashboards, no data flowing in, inconsistent UX. After this phase, the system fills itself from the user's daily workflow.

## Design Principles

### From PMS Document

> "L'utente non vuole gestire sistemi. Vuole gestire il proprio lavoro."

### From 2026 UX Best Practices Research

Five patterns adopted from industry leaders (Attio, Superhuman, Linear, Folk, Streak):

**1. Contextual Sidebar — "Data comes to you"** (Superhuman, Streak, HubSpot)
Never force the user to navigate away. Surface related CRM data (deals, tickets, company info) in a right-side context panel that updates based on what the user is looking at. This is the single most important UI component.

**2. Auto-CRM — "Zero manual entry"** (Attio, Folk)
The system silently builds CRM from communication signals: emails sent/received, meetings attended, response times. Users never "create a contact" or "log an activity" manually. The email/calendar sync IS the primary data source.

**3. Progressive Disclosure — "Three layers max"** (Linear, Notion)
- Layer 1: Core task UI (Mail, Calendar, Contacts, Tasks)
- Layer 2: Click to reveal detail (deals, tickets, activity timeline in sidebar)
- Layer 3: Settings/configuration (pipeline setup, AI governance, analytics)
Analytics and governance should NOT appear in main navigation — they belong in a settings/insights area.

**4. Activity-Centric over Module-Centric** (Attio, Superhuman)
Users think "what happened with Acme Corp today?" not "open the deals page, filter by Acme." An activity timeline per contact/company showing all interactions (emails, meetings, deal changes, notes) in one chronological stream replaces 5 separate pages.

**5. Object-Centric Design** (Attio, Notion)
A "deal" is not a separate page — it's a property bag on a Contact/Company record. A "ticket" is a Task with a support type. Pipeline stages are filtered Task views. Entities carry cross-functional context with them.

## Current State (Problems)

### P1. CRM pages are empty — no auto-population

- Accounts must be manually created — system never suggests or auto-creates from email contacts
- Deals must be manually created — system doesn't detect commercial intent in emails
- Tickets must be manually created — email-to-ticket exists but requires explicit `[SUPPORT]` subject prefix
- Service Analytics shows "Nessun dato disponibile" because no tickets flow through automatically
- Forecast/Churn pages are empty because no deal history exists

### P2. No correlation between existing PMSync data and CRM

- Contact page has contacts but CRM Accounts page is separate — no auto-linking
- Emails arrive daily but CRM doesn't learn from them
- Calendar meetings with clients don't create activity entries in CRM deals
- AI triage labels emails but doesn't feed CRM pipeline stages

### P3. UX inconsistency across CRM pages

- Sidebar active state broken on sub-pages (strict `===` matching)
- Sidebar collapsed by default — new users see only icons
- Layout varies: Accounts/Deals (no maxWidth) vs Tickets/Analytics (maxWidth: 1200)
- Empty states inconsistent: some have CTA, some don't. Reusable EmptyState component unused
- Breadcrumbs missing on list pages, inconsistent depth on detail pages
- Tickets pagination not localized, dates use wrong formatter
- Only Deals syncs filters to URL — others lose state on refresh
- Hardcoded hex colors in analytics components instead of theme tokens
- Delete action missing from Tickets list (Accounts/Deals have it)

### P4. Module-centric architecture fights the user

- 10 CRM sidebar items = 10 separate worlds with no cross-linking
- No contextual sidebar showing CRM data when reading email
- No activity timeline unifying emails + meetings + deal changes + notes per entity
- Dashboard home is disconnected from CRM state

## Requirements

### Sprint A — Auto-Population Engine (Backend + AI)

#### R-AUTO: Automatic CRM Data Creation

- [ ] AUTO-01: **Email→Account auto-discovery.** When AI triage processes an email, extract sender domain. If domain is not a freemail provider (gmail, outlook, yahoo, hotmail, etc.) and no CRM account exists for it, create a CRM suggestion: "New company detected: acme.com." Shown in the AI suggestions feed. User approves → account created with domain, name extracted from email signature.
- [ ] AUTO-02: **Email→Deal detection.** When AI triage detects commercial intent (quotes, proposals, pricing, contract, invoice, renewal keywords), auto-create a deal draft linked to the contact/account. Deal appears in pipeline as "AI Suggested" stage with source email linked. User confirms or dismisses.
- [ ] AUTO-03: **Email→Ticket auto-creation.** Expand email-to-ticket beyond `[SUPPORT]` prefix. AI triage classifies emails as "support request" based on content analysis (complaints, bug reports, "help", "not working", "issue"). Auto-create ticket in "Open" status linked to contact + account. Configurable per-tenant: on/off, confidence threshold.
- [ ] AUTO-04: **Contact→Account linking.** When a contact's email domain matches a CRM account's website domain, auto-link them. Run as BullMQ background job on existing contacts + trigger on new contact creation. Log linked count in activity feed.
- [ ] AUTO-05: **Calendar→Activity logging.** When calendar sync completes, scan events for attendees who are CRM contacts. Auto-log activity entries on their linked deal/account: "Meeting: {event title} with {contact} on {date}". No duplicates (idempotent on eventId + contactId).

#### R-CORR: Correlation Engine (PMS Levels 1-3)

- [ ] CORR-01: **Level 1 — Strong correlation.** Same contact + same email thread + same deal → auto-link. No user confirmation needed. Implemented as a post-triage hook.
- [ ] CORR-02: **Level 2 — Probable correlation.** Same contact + same company + similar timeframe (7 days) → suggest link. "This email may be related to Deal X." Shown in context panel, user clicks to confirm.
- [ ] CORR-03: **Level 3 — Weak correlation.** Similar context (same industry, similar keywords) → show as "Related" in context panel, no auto-link. Read-only suggestion.
- [ ] CORR-04: **Deduplication guard.** Before creating any suggestion, check existing CRM entities by domain, contact email, and thread ID. Never create duplicate suggestions for the same source.

### Sprint B — Contextual Sidebar & Activity Timeline (Frontend)

#### R-CTX: CRM Context Panel (the core UX component)

- [ ] CTX-01: **Entity Context Sidebar.** A reusable right-side panel (320px, collapsible) that appears when viewing any entity. Shows: contact card, company info, open deals (stage + value), active tickets, relationship strength score (computed from email frequency), and recent activity timeline. Same component used from Email view, Contact view, and CRM detail views.
- [ ] CTX-02: **Email thread context.** When viewing an email thread, the context sidebar auto-loads CRM data for the sender/recipients: their account, deals, tickets, last interaction date. If no CRM data exists, show "No CRM data — AI will analyze this contact after sync."
- [ ] CTX-03: **Contact detail CRM tab.** Contact detail page gets a "CRM" tab: linked account (with inline-edit), open deals list, ticket history, and unified activity timeline (emails + meetings + deal changes + notes, chronological).
- [ ] CTX-04: **Activity timeline component.** A shared `ActivityTimeline` component that shows a chronological stream of all interactions for an entity: emails sent/received, meetings, deal stage changes, ticket updates, notes. Each item is clickable. Used on Contact CRM tab, Account detail, and Deal detail.

#### R-FEED: AI Suggestions & Dashboard

- [ ] FEED-01: **AI Suggestions feed widget.** Dashboard home shows a card: "AI Suggestions — N pending." Lists: new companies detected, deals suggested, tickets auto-created. Each with Accept/Dismiss buttons. Bulk accept/dismiss all.
- [ ] FEED-02: **Dashboard CRM summary.** Dashboard home shows a CRM health card: total accounts, pipeline value (open deals), unresolved tickets, CSAT average. Each metric links to its CRM page. Shows trend arrows (vs. last period).
- [ ] FEED-03: **Getting-started checklist.** When CRM has no data (no accounts, no deals, no tickets), Dashboard shows a checklist: "Connect email ✓, Sync contacts ✓, First account detected ✗, First deal created ✗." Disappears after all items are checked.

### Sprint C — UX Consistency Pass (Frontend)

#### R-NAV: Navigation Fixes

- [ ] NAV-01: Fix sidebar active state to use `startsWith` matching for sub-routes
- [ ] NAV-02: Default sidebar expanded on desktop, persist collapse preference to localStorage
- [ ] NAV-03: Add breadcrumbs to ALL CRM list pages (shared `CrmBreadcrumb` component)
- [ ] NAV-04: Fix TicketDetail breadcrumb to include "CRM" level
- [ ] NAV-05: Move analytics/governance/forecast to a "CRM Insights" sub-section (progressive disclosure layer 3) — visible only when CRM section is expanded, not as top-level nav items

#### R-LAYOUT: Layout Normalization

- [ ] LAYOUT-01: All CRM pages use `maxWidth: 1200` + responsive padding `p: { xs: 2, md: 3 }`
- [ ] LAYOUT-02: All CRM empty states use shared `EmptyState` component with CTA button
- [ ] LAYOUT-03: Add delete action to Tickets list (matching Accounts/Deals pattern)
- [ ] LAYOUT-04: Use shared `ConfirmDialog` everywhere (replace inline Dialog in AccountsList)
- [ ] LAYOUT-05: Standardize page header pattern: h5 title + body2 subtitle + action buttons

#### R-I18N: Internationalization & State

- [ ] I18N-01: Localize Tickets pagination (labelRowsPerPage + labelDisplayedRows)
- [ ] I18N-02: All CRM dates use shared `formatDateInTz` utility
- [ ] I18N-03: All CRM list pages sync filters/search/page to URL query params

#### R-THEME: Design System Compliance

- [ ] THEME-01: Replace all hardcoded hex colors with MUI theme tokens
- [ ] THEME-02: Fix all hardcoded fallback strings to use translation keys
- [ ] THEME-03: Add missing aria-labels (TicketDetail back button, etc.)

### Sprint D — Guided Empty States & Polish

#### R-EMPTY: Meaningful Empty States

- [ ] EMPTY-01: Service Analytics: "No resolved tickets in this period. Resolve tickets to see response times, SLA compliance, and CSAT metrics." + link to Tickets page.
- [ ] EMPTY-02: Forecast: "Add deals with expected close dates to see revenue projections." + link to Deals.
- [ ] EMPTY-03: Churn: "Track account activity over time to detect churn risk." + link to Accounts.
- [ ] EMPTY-04: Each KPI card in analytics: contextual "no data" with explanation (not just "Nessun dato disponibile")

#### R-POLISH: Final Touches

- [ ] POLISH-01: Audit all CRM components for hardcoded strings missed in THEME-02
- [ ] POLISH-02: Mobile validation at 375px for all modified pages
- [ ] POLISH-03: Performance check: context sidebar must load in <200ms (parallel queries, no waterfalls)

## Success Criteria

1. **Auto-population works:** New emails from business domains auto-suggest CRM accounts (no manual entry)
2. **Commercial intent detected:** Emails with quotes/proposals auto-suggest deals
3. **Support detection works:** Support-intent emails auto-create tickets (beyond `[SUPPORT]` prefix)
4. **Context sidebar exists:** Email thread view shows CRM data (account, deal, tickets) for known contacts
5. **Activity timeline exists:** Contact/Account/Deal detail pages show unified chronological activity
6. **Dashboard is alive:** Home shows AI suggestions feed + CRM health summary + getting-started checklist
7. **Visual consistency:** All CRM pages identical in layout structure (width, padding, breadcrumb, empty state)
8. **Navigation works:** Active sidebar highlights correctly on sub-routes, expanded by default
9. **Zero hardcoded colors:** All CRM components use MUI theme tokens
10. **State persists:** All CRM list pages sync filters to URL
11. **Empty states guide:** Every empty page explains WHY it's empty and HOW to populate it

## Architecture

### Auto-population flow

```text
Email arrives → AI Triage (existing) → Enhanced triage:
  ├── Label classification (existing)
  ├── Domain extraction → Account suggestion (NEW: AUTO-01)
  ├── Intent detection → Deal suggestion (NEW: AUTO-02)
  └── Support detection → Ticket creation (NEW: AUTO-03)

Calendar sync → Activity scanner (NEW: AUTO-05):
  └── For each event with CRM contact attendees → Activity log entry

Contact created/updated → Domain linker (NEW: AUTO-04):
  └── Match email domain → CRM account website → Auto-link
```

### New Backend Services

- `crm-suggestion.service.ts` — manages pending suggestions (CRUD, accept/dismiss)
- `crm-auto-populate.processor.ts` — BullMQ processor for background auto-population jobs
- `contact-account-linker.service.ts` — domain-matching logic for contact→account linking
- Extend `email-analysis.service.ts` — add domain extraction + intent classification hooks

### New Prisma Model

```prisma
model CrmSuggestion {
  id            String   @id @default(cuid())
  tenantId      String
  type          String   // "account" | "deal" | "ticket" | "link"
  status        String   @default("pending") // "pending" | "accepted" | "dismissed"
  entityData    Json     // proposed entity fields
  sourceEmailId String?
  sourceType    String   // "email-triage" | "calendar-sync" | "domain-match"
  confidence    Float    @default(0.5)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  @@index([tenantId, status])
  @@index([tenantId, type])
}
```

### New Frontend Components

- `EntityContextSidebar` — the core contextual panel (320px, collapsible, reusable)
- `ActivityTimeline` — chronological event stream per entity
- `CrmSuggestionsFeed` — dashboard widget for pending AI suggestions
- `CrmHealthCard` — dashboard widget with summary metrics
- `GettingStartedChecklist` — onboarding widget
- `CrmBreadcrumb` — shared breadcrumb component for all CRM pages

## Out of Scope

- Telegram chatbot integration (PMS document mentions it, deferred)
- Restructuring sidebar to only 4 items (keep current structure, just fix inconsistencies)
- Pipeline stage auto-advancement from email signals (future phase)
- Custom user-configurable correlation rules UI (AI handles it for now)
- Data enrichment from external sources (Clearbit, etc.)

## Dependencies

- Phase 132 (billing-backend-hardening) complete
- AI triage pipeline operational (it is)
- CRM backend fully functional (18 sprints complete)
- Calendar sync operational (it is)

## Estimated Effort

~65 SP across 4 sprints:

- Sprint A: Auto-Population Engine — 20 SP (backend + AI, 9 tasks)
- Sprint B: Contextual Sidebar & Activity Timeline — 18 SP (frontend, 7 tasks)
- Sprint C: UX Consistency Pass — 15 SP (frontend, 12 tasks)
- Sprint D: Empty States & Polish — 12 SP (frontend, 7 tasks)

Total: 35 tasks, ~65 SP
