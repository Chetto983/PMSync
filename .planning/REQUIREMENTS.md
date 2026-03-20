# Requirements: PMSync

**Defined:** 2026-03-20
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v7.0 Requirements

Requirements for v7.0 System Audit & Hardening. Each maps to roadmap phases.

### Backend API Testing

- [x] **BAPI-01**: User can authenticate via all auth flows (login, register, forgot-password, reset-password, verify-email, 2FA, OAuth)
- [x] **BAPI-02**: User can perform all email operations (list, get, send, reply, forward, draft, delete, bulk read/star/flag/move/labels)
- [x] **BAPI-03**: User can manage folders (list, create, rename, move, delete, sync)
- [x] **BAPI-04**: User can manage signatures (list, create, update, delete, set-default)
- [x] **BAPI-05**: User can manage email templates (list, create, update, delete, duplicate, set-default)
- [x] **BAPI-06**: User can perform all calendar operations (list calendars, CRUD events, sync, conflicts, focus-time, meeting-prep)
- [x] **BAPI-07**: User can perform all contact operations (list, create, update, delete, bulk-delete, VIP toggle, import vCard, sync, extract-from-emails)
- [ ] **BAPI-08**: User can manage labels (list, create, update, delete, add/remove emails, reorder)
- [ ] **BAPI-09**: User can manage providers (list, connect Google/Microsoft/IMAP, test connections, delete, sync)
- [ ] **BAPI-10**: User can manage subscription (get status, usage, limits, features, cost-breakdown, cancel)
- [ ] **BAPI-11**: User can manage compliance (consent status/update, data export, data deletion, GDPR status, legal acceptance)
- [x] **BAPI-12**: User can manage reminders (create, list, get, update, complete, delete)
- [ ] **BAPI-13**: User can use AI features (compose, summarize, smart-reply, categorize, sentiment, priority, triage, follow-ups, briefing, drafts)
- [x] **BAPI-14**: User can use AI chat (stream message, CRUD conversations, HITL approve/reject)
- [ ] **BAPI-15**: User can manage knowledge base (backfill, list/delete embeddings, semantic search)
- [ ] **BAPI-16**: Admin can access AI observability (list runs, cost summary)
- [ ] **BAPI-17**: Admin can manage users (list, ban/unban, impersonate, revoke sessions)
- [ ] **BAPI-18**: Admin can manage tenants (list, create, update, delete)
- [ ] **BAPI-19**: User can manage Telegram integration (settings, link/unlink, webhook)
- [ ] **BAPI-20**: User can get realtime auth token and WebSocket connects successfully
- [ ] **BAPI-21**: Health endpoints respond correctly (health, ready, live, queues)
- [ ] **BAPI-22**: Webhook endpoints process notifications (Gmail push, Microsoft Graph, Calendar, Contacts)
- [x] **BAPI-23**: Calendar invite operations work (get invite, respond, send, cancel)
- [x] **BAPI-24**: User profile operations work (get/update me, avatar upload/delete, preferences, dashboard preferences, clear AI memory)
- [x] **BAPI-25**: Email attachment download works (both controller paths)

### Frontend Verification

- [x] **FE-01**: Auth pages render and function (login, register, forgot-password, reset-password, verify-email, 2FA)
- [x] **FE-02**: Onboarding wizard completes all steps (avatar, name, provider, workspace, MFA, legal consent)
- [x] **FE-03**: Email list loads, filters, searches, and paginates correctly
- [x] **FE-04**: Email thread view renders messages, attachments, and actions
- [x] **FE-05**: Email compose works (new, reply, forward, draft save, schedule send, undo send)
- [ ] **FE-06**: AI chat interface works (send message, receive stream, HITL approval, conversation history)
- [x] **FE-07**: Calendar view renders events, create/edit/delete works, RSVP functions
- [x] **FE-08**: Contacts list loads, create/edit/delete works, VIP toggle, import vCard
- [ ] **FE-09**: Dashboard renders with all widgets, customization drawer works, layout persists
- [ ] **FE-10**: Settings pages function (general, security, email accounts, notifications, AI, billing)
- [ ] **FE-11**: Admin pages function (user list, ban/unban, impersonation, organization management)
- [x] **FE-12**: Labels sidebar renders, create/edit/delete/reorder works, drag-drop assigns
- [x] **FE-13**: Folders sidebar renders, create/rename/delete works, email drag-drop moves
- [x] **FE-14**: Reminders page works (list, create, complete, delete, Kanban view)
- [ ] **FE-15**: Tasks page renders correctly (not demo/placeholder content)
- [ ] **FE-16**: Analytics page renders with real data
- [ ] **FE-17**: Landing page renders all sections (hero, features, testimonials, CTA, footer)
- [ ] **FE-18**: Legal pages render (privacy, terms)
- [ ] **FE-19**: Organization flows work (create, invite, switch, accept invitation)
- [ ] **FE-20**: Provider connection flows work (Google OAuth, Microsoft OAuth, generic IMAP/SMTP)

### Cleanup

- [ ] **CLN-01**: Dead code removed (orphaned `bulk_email_actions` renderer, unused exports, stale shims)
- [ ] **CLN-02**: All hardcoded strings replaced with i18n keys (en.ts + it.ts)
- [ ] **CLN-03**: `PendingAction` type and legacy HITL API methods in ai.ts cleaned up
- [ ] **CLN-04**: Unused API client methods removed (deprecated `voltAgentApi` alias, `multiAgentApi` shim)
- [ ] **CLN-05**: Stale contract test assertions updated (SEC-01 status, missing coverage)
- [ ] **CLN-06**: Console.log/debug statements removed from production code
- [ ] **CLN-07**: Unused dependencies removed from package.json (both backend and frontend)
- [ ] **CLN-08**: Dead routes and controllers removed (if any found during testing)

### UI/UX Polish

- [ ] **UIPOL-01**: Every page has proper empty state (not blank or placeholder)
- [ ] **UIPOL-02**: Every async operation shows loading skeleton (not spinner or blank)
- [ ] **UIPOL-03**: Every error shows user-friendly message with retry action
- [ ] **UIPOL-04**: Mobile responsiveness verified on all pages (no overflow, no hidden content)
- [ ] **UIPOL-05**: Dark mode renders correctly on all pages (no white flash, no unthemed elements)
- [ ] **UIPOL-06**: Keyboard navigation works on all interactive elements
- [ ] **UIPOL-07**: Italian translation complete (no missing keys, no English fallbacks visible)
- [ ] **UIPOL-08**: All components use MUI theme exclusively (no raw CSS, no Tailwind utilities, no hardcoded colors in .tsx files)
- [ ] **UIPOL-09**: Chat CSS files (~950 lines) migrated to MUI sx props
- [ ] **UIPOL-10**: ChatThemeBridge removed after CSS migration
- [ ] **UIPOL-11**: tailwindcss package removed from frontend dependencies

### Security Verification

- [ ] **SEC-01**: All protected routes reject unauthenticated requests (401)
- [ ] **SEC-02**: Tenant isolation verified (user A cannot access user B's data)
- [ ] **SEC-03**: CSRF protection verified on all mutation endpoints
- [ ] **SEC-04**: Rate limiting verified on sensitive endpoints (login, send email, AI chat)
- [ ] **SEC-05**: Role-based access verified (member cannot access admin endpoints)

## Future Requirements

Deferred to v8.0+. Tracked but not in current roadmap.

### Enterprise Features (from v6.0)

- **CRM-01..12**: CRM domain expansion (Accounts, Deals, Activities, Pipelines)
- **WF-01..08**: Workflow automation engine
- **AUTHZ-01..07**: Resource-scoped authorization
- **OTEL-01..06**: OpenTelemetry distributed tracing
- ~~MUI-01..04~~: Absorbed into v7.0 as UIPOL-08..11
- **EMUIX-01..06**: Email UI/UX polish (professional density)
- **UIUX-01..05**: UI/UX audit fixes
- **AICP-05..14**: AI control plane completion (memory, prompts, legacy removal, tests)
- **SEC-01..04**: v6.0 security fixes (CSRF mandatory, metrics restriction, HNSW indexes)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New features (CRM, Workflow, OTel, Authorization) | v7.0 is test/clean/polish only — new features deferred to v8.0+ |
| Automated test coverage expansion | v7.0 focuses on manual/E2E verification; coverage expansion is separate effort |
| Performance optimization | Not in scope unless testing reveals performance bugs |
| Database schema changes | Hardening only — no schema migrations |
| Dependency upgrades | Unless required to fix a discovered bug |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BAPI-01 | Phase 89 | Complete |
| BAPI-02 | Phase 90 | Complete |
| BAPI-03 | Phase 90 | Complete |
| BAPI-04 | Phase 90 | Complete |
| BAPI-05 | Phase 90 | Complete |
| BAPI-06 | Phase 91 | Complete |
| BAPI-07 | Phase 91 | Complete |
| BAPI-08 | Phase 93 | Pending |
| BAPI-09 | Phase 93 | Pending |
| BAPI-10 | Phase 93 | Pending |
| BAPI-11 | Phase 93 | Pending |
| BAPI-12 | Phase 91 | Complete |
| BAPI-13 | Phase 92 | Pending |
| BAPI-14 | Phase 92 | Complete |
| BAPI-15 | Phase 92 | Pending |
| BAPI-16 | Phase 92 | Pending |
| BAPI-17 | Phase 93 | Pending |
| BAPI-18 | Phase 93 | Pending |
| BAPI-19 | Phase 93 | Pending |
| BAPI-20 | Phase 94 | Pending |
| BAPI-21 | Phase 94 | Pending |
| BAPI-22 | Phase 94 | Pending |
| BAPI-23 | Phase 91 | Complete |
| BAPI-24 | Phase 89 | Complete |
| BAPI-25 | Phase 90 | Complete |
| FE-01 | Phase 89 | Complete |
| FE-02 | Phase 89 | Complete |
| FE-03 | Phase 90 | Complete |
| FE-04 | Phase 90 | Complete |
| FE-05 | Phase 90 | Complete |
| FE-06 | Phase 92 | Pending |
| FE-07 | Phase 91 | Complete |
| FE-08 | Phase 91 | Complete |
| FE-09 | Phase 94 | Pending |
| FE-10 | Phase 93 | Pending |
| FE-11 | Phase 93 | Pending |
| FE-12 | Phase 90 | Complete |
| FE-13 | Phase 90 | Complete |
| FE-14 | Phase 91 | Complete |
| FE-15 | Phase 94 | Pending |
| FE-16 | Phase 94 | Pending |
| FE-17 | Phase 94 | Pending |
| FE-18 | Phase 94 | Pending |
| FE-19 | Phase 93 | Pending |
| FE-20 | Phase 93 | Pending |
| CLN-01 | Phase 95 | Pending |
| CLN-02 | Phase 95 | Pending |
| CLN-03 | Phase 95 | Pending |
| CLN-04 | Phase 95 | Pending |
| CLN-05 | Phase 95 | Pending |
| CLN-06 | Phase 95 | Pending |
| CLN-07 | Phase 95 | Pending |
| CLN-08 | Phase 95 | Pending |
| UIPOL-01 | Phase 96 | Pending |
| UIPOL-02 | Phase 96 | Pending |
| UIPOL-03 | Phase 96 | Pending |
| UIPOL-04 | Phase 96 | Pending |
| UIPOL-05 | Phase 96 | Pending |
| UIPOL-06 | Phase 96 | Pending |
| UIPOL-07 | Phase 96 | Pending |
| UIPOL-08 | Phase 97 | Pending |
| UIPOL-09 | Phase 97 | Pending |
| UIPOL-10 | Phase 97 | Pending |
| UIPOL-11 | Phase 97 | Pending |
| SEC-01 | Phase 98 | Pending |
| SEC-02 | Phase 98 | Pending |
| SEC-03 | Phase 98 | Pending |
| SEC-04 | Phase 98 | Pending |
| SEC-05 | Phase 98 | Pending |

**Coverage:**
- v7.0 requirements: 69 total
- Mapped to phases: 69
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after roadmap creation*
