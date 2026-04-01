# Phase 133 — UX Unification & Auto-Population

## Goal

Make PMSync a **self-populating system** per the PMS design philosophy (`docs/Sistema_Logico_PMS_COMPLETO.md`). The user works with Mail, Calendar, Contacts — the system automatically creates CRM accounts, links deals, opens tickets, and populates analytics. Today CRM pages are sparse and disconnected: empty dashboards, no data flowing in, inconsistent UX. After this phase, the system fills itself from the user's daily workflow.

## Design Principle (from PMS document)

> "L'utente non vuole gestire sistemi. Vuole gestire il proprio lavoro."

The user keeps working with email and calendar. The system:
1. Recognizes contacts and companies from emails
2. Auto-creates CRM accounts when new business domains appear
3. Auto-creates deals when commercial intent is detected in email threads
4. Auto-creates tickets when support requests arrive
5. Auto-populates analytics from all the above
6. Surfaces related CRM context when viewing emails/contacts

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

## Requirements

### Sprint A — Auto-Population Engine (Backend + AI)

#### R-AUTO: Automatic CRM Data Creation

- [ ] AUTO-01: **Email→Account auto-discovery.** When AI triage processes an email, extract sender domain. If domain is not a freemail provider (gmail, outlook, etc.) and no CRM account exists for it, create a suggestion: "New company detected: acme.com — create account?" Shown as an AI action in the email view.
- [ ] AUTO-02: **Email→Deal detection.** When AI triage detects commercial intent (quotes, proposals, pricing, contract keywords), auto-create a deal draft linked to the contact/account. Deal appears in pipeline as "AI Suggested" stage. User confirms or dismisses.
- [ ] AUTO-03: **Email→Ticket auto-creation.** Expand email-to-ticket beyond `[SUPPORT]` prefix. AI triage labels emails as "support request" based on content analysis (complaints, bug reports, help requests). Auto-create ticket in "Open" status, linked to contact.
- [ ] AUTO-04: **Contact→Account linking.** When a contact's email domain matches a CRM account's website domain, auto-link them. Run as a background job on existing contacts + trigger on new contact creation.
- [ ] AUTO-05: **Calendar→Activity logging.** When a calendar event includes attendees who are CRM contacts, auto-log an activity entry on their linked deal/account: "Meeting with {contact} on {date}".

#### R-CORR: Correlation Engine (PMS Levels 1-3)

- [ ] CORR-01: **Level 1 — Strong correlation.** Same contact + same email thread + same deal → auto-link. No user confirmation needed.
- [ ] CORR-02: **Level 2 — Probable correlation.** Same contact + same company + similar timeframe → suggest link. "This email may be related to Deal X — link it?"
- [ ] CORR-03: **Level 3 — Weak correlation.** Similar context (same industry, similar keywords) → show as "Related" in sidebar panel, no auto-link.
- [ ] CORR-04: **Deduplication.** Before creating any auto-suggestion, check existing CRM entities. Don't suggest an account that already exists. Don't create duplicate deals for the same thread.

### Sprint B — Contextual CRM Surfacing (Frontend)

#### R-CTX: CRM Context in Existing Pages

- [ ] CTX-01: **Email thread CRM chip.** When viewing an email, if sender/recipient is a CRM contact, show a small inline panel: account name, open deal (stage + value), active ticket count. Clickable to jump to the CRM entity.
- [ ] CTX-02: **Contact detail CRM panel.** Contact detail page shows a "CRM" tab or section: linked account, open deals, ticket history, recent activities. All from existing CRM data, no new API needed (combine existing endpoints).
- [ ] CTX-03: **Dashboard home CRM summary widget.** The main dashboard (`/dashboard`) shows a CRM summary card: total accounts, open deals (pipeline value), unresolved tickets, CSAT score. Links to each CRM section.
- [ ] CTX-04: **AI suggestions feed.** A new section on the dashboard or in the AI panel showing pending auto-suggestions: "3 new companies detected", "2 deals suggested from emails", "1 ticket auto-created". User approves/dismisses in bulk.

### Sprint C — UX Consistency Pass (Frontend)

#### R-NAV: Navigation Fixes
- [ ] NAV-01: Fix sidebar active state to use `startsWith` matching
- [ ] NAV-02: Default sidebar expanded on desktop, persist preference to localStorage
- [ ] NAV-03: Add breadcrumbs to ALL CRM list pages
- [ ] NAV-04: Fix TicketDetail breadcrumb to include "CRM" level

#### R-LAYOUT: Layout Normalization
- [ ] LAYOUT-01: All CRM pages use `maxWidth: 1200` + responsive padding `p: { xs: 2, md: 3 }`
- [ ] LAYOUT-02: All CRM empty states use shared `EmptyState` component with CTA
- [ ] LAYOUT-03: Add delete action to Tickets list (matching Accounts/Deals pattern)
- [ ] LAYOUT-04: Use shared `ConfirmDialog` everywhere (replace inline Dialog in AccountsList)
- [ ] LAYOUT-05: Standardize page header pattern across all CRM pages

#### R-I18N: Internationalization & State
- [ ] I18N-01: Localize Tickets pagination (labelRowsPerPage + labelDisplayedRows)
- [ ] I18N-02: All CRM dates use shared `formatDateInTz` utility
- [ ] I18N-03: All CRM list pages sync filters/search/page to URL query params

#### R-THEME: Design System Compliance
- [ ] THEME-01: Replace all hardcoded hex colors with MUI theme tokens
- [ ] THEME-02: Fix all hardcoded fallback strings to use translation keys
- [ ] THEME-03: Add missing aria-labels (TicketDetail back button, etc.)

### Sprint D — Empty State & Analytics Population

#### R-EMPTY: Guided Empty States
- [ ] EMPTY-01: Service Analytics: guided empty state explaining what generates data + link to Tickets
- [ ] EMPTY-02: Forecast: explain that deals with close dates generate forecast data + link to Deals
- [ ] EMPTY-03: Churn: explain that account activity history drives churn prediction + link to Accounts
- [ ] EMPTY-04: Dashboard CRM widget: getting-started checklist ("Connect email ✓, Import contacts ✓, First account ✗, First deal ✗")

## Success Criteria

1. New emails from business domains auto-suggest CRM account creation (no manual entry needed)
2. Commercial-intent emails auto-suggest deal creation in pipeline
3. Support-intent emails auto-create tickets (beyond just `[SUPPORT]` prefix)
4. Email thread view shows CRM context (account, deal, tickets) for known contacts
5. Contact detail page shows related CRM entities
6. All CRM pages visually consistent (width, padding, breadcrumb, empty state, i18n)
7. Active sidebar item highlights correctly on sub-routes
8. Zero hardcoded hex colors in CRM components
9. All CRM list pages persist filters in URL
10. Empty pages show guided explanations with actionable CTAs

## Architecture Notes

### Auto-population flow
```
Email arrives → AI Triage (existing) → Enhanced triage:
  ├── Label classification (existing)
  ├── Domain extraction → Account suggestion (NEW)
  ├── Intent detection → Deal suggestion (NEW)
  └── Support detection → Ticket creation (NEW)
```

### Backend changes
- Extend `email-analysis.service.ts` to emit CRM suggestions
- New `crm-suggestion.service.ts` for managing pending suggestions
- New `CrmSuggestion` Prisma model: { type, entityData, sourceEmailId, status: pending|accepted|dismissed }
- Background job: `contact-account-linker` — runs on new contacts, matches email domains to account websites
- Background job: `calendar-activity-logger` — runs after calendar sync, logs meetings as CRM activities

### Frontend changes
- `EmailThreadView`: add CRM context chip (read-only, queries existing endpoints)
- `ContactDetail`: add CRM tab with related entities
- `DashboardHome`: add CRM summary widget
- All CRM list/detail pages: layout normalization (Sprint C)

## Out of Scope

- Telegram chatbot integration (PMS document mentions it, but not MVP)
- CSV/bulk import automation (already exists manually)
- Pipeline stage automation based on email content (future phase)
- Custom correlation rules UI (system uses AI for now, user-configurable rules later)

## Dependencies

- Phase 132 (billing-backend-hardening) complete
- AI triage pipeline operational (it is)
- CRM backend fully functional (it is — 18 sprints complete)

## Estimated Effort

~60-70 SP across 4 sprints:
- Sprint A: Auto-Population Engine — 20 SP (backend + AI)
- Sprint B: Contextual Surfacing — 15 SP (frontend)
- Sprint C: UX Consistency — 15 SP (frontend)
- Sprint D: Empty States & Polish — 10 SP (frontend)
