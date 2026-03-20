# Roadmap: PMSync

## Milestones

- ✅ **v1 Stability & Code Quality Refactor** — Phases 1-8 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** — Phases 1-8 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** — Phases 01-03 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** — Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** — Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** — Phases 23-28 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** — Phases 31-41 (shipped 2026-03-04)
- ✅ **v4.1 Security Hardening & Debt Reduction** — Phases 42-49 (shipped 2026-03-06)
- ✅ **v5.0 better-auth Migration** — Phases 50-65 (shipped 2026-03-10)
- ✅ **v5.1 Test Coverage & Polish** — Phases 66-76 (shipped 2026-03-15)
- ✅ **v6.0 Enterprise Platform & AI Governance** — Phases 77-88 (partial, archived 2026-03-20)
- 🚧 **v7.0 System Audit & Hardening** — Phases 89-98 (in progress)

## Phases

<details>
<summary>✅ v1 Stability & Code Quality Refactor (Phases 1-8) — SHIPPED 2026-02-02</summary>

8 phases, 40 plans. See `milestones/v1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.0 Professional Email Client (Phases 1-8) — SHIPPED 2026-02-04</summary>

8 phases, 21 plans, 24/24 requirements. See `milestones/v2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.1 Optimization & Polish (Phases 01-03) — SHIPPED 2026-02-05</summary>

3 phases, 5 plans. See `milestones/v2.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.0 AI Intelligence & Scalability (Phases 1-12) — SHIPPED 2026-02-09</summary>

12 phases, 42 plans, 19/19 requirements. See `milestones/v3.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) — SHIPPED 2026-02-27</summary>

10 phases, 34 plans, 31/32 requirements (ENC-03 deferred). See `milestones/v3.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.2 AI Rebuild & Cleanup (Phases 23-28) — SHIPPED 2026-03-03 (partial)</summary>

6 phases, 20 plans, 25/33 requirements (8 carried to v4.0). See `milestones/v3.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.0 Enterprise Stabilization (Phases 31-41) — SHIPPED 2026-03-04</summary>

11 phases, 22 plans, 19/19 requirements. See `milestones/v4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.1 Security Hardening & Debt Reduction (Phases 42-49) — SHIPPED 2026-03-06</summary>

8 phases, 28 plans, 65/66 requirements. See `milestones/v4.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.0 better-auth Migration (Phases 50-65) — SHIPPED 2026-03-10</summary>

15 phases, 34 plans, 51/51 requirements. See `milestones/v5.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.1 Test Coverage & Polish (Phases 66-76) — SHIPPED 2026-03-15</summary>

11 phases, 30 plans. See `milestones/v5.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v6.0 Enterprise Platform & AI Governance (Phases 77-88) — PARTIAL, archived 2026-03-20</summary>

12 phases (77-88), 4/66 requirements completed. Phases 86-88 (bug fixes) completed. Phases 77-85 (enterprise features) deferred to v8.0+. See `milestones/v6.0-ROADMAP.md` for full details.

</details>

### v7.0 System Audit & Hardening (In Progress)

**Milestone Goal:** Test every endpoint and feature, clean dead code and inconsistencies, polish UI/UX -- verify everything works before adding new functionality.

- [ ] **Phase 89: Auth & Onboarding Verification** - Verify all auth flows, user profile, onboarding wizard
- [ ] **Phase 90: Email Operations Verification** - Verify all email CRUD, folders, signatures, templates, attachments, compose, labels
- [ ] **Phase 91: Calendar, Contacts & Reminders Verification** - Verify calendar events, contacts management, reminders, invites
- [ ] **Phase 92: AI & Knowledge Base Verification** - Verify AI features, chat streaming, HITL, knowledge base, observability
- [ ] **Phase 93: Admin, Subscriptions & Integrations** - Verify admin panel, settings, billing, compliance, providers, org flows, Telegram
- [ ] **Phase 94: Infrastructure & Remaining Pages** - Verify WebSocket, health, webhooks, dashboard, tasks, analytics, landing, legal
- [ ] **Phase 95: Dead Code & Cleanup** - Remove dead code, stale shims, unused deps, console.logs, dead routes
- [ ] **Phase 96: UI/UX Polish** - Empty states, loading skeletons, error states, mobile, dark mode, keyboard nav, i18n
- [ ] **Phase 97: MUI Chat Migration** - Migrate chat CSS to MUI sx, remove ChatThemeBridge, remove Tailwind
- [ ] **Phase 98: Security Verification** - Auth guards, tenant isolation, CSRF, rate limiting, RBAC on all routes

## Phase Details

### Phase 89: Auth & Onboarding Verification
**Goal**: Users can authenticate through every supported flow and complete onboarding without errors
**Depends on**: Nothing (first phase of v7.0)
**Requirements**: BAPI-01, BAPI-24, FE-01, FE-02
**Success Criteria** (what must be TRUE):
  1. User can register, log in, log out, reset password, verify email, and complete 2FA -- all 7 auth endpoints return correct responses
  2. User profile operations work end-to-end: get/update profile, upload/delete avatar, update preferences, clear AI memory
  3. Auth pages render correctly in the browser and form submissions produce expected results (success redirects, error messages)
  4. Onboarding wizard completes all steps (avatar, name, provider, workspace, MFA, legal consent) without getting stuck or skipping required steps
**Plans:** 1/2 plans executed
Plans:
- [ ] 89-01-PLAN.md -- Auth flow E2E tests (login, register, forgot-password, reset-password, verify-email, 2FA)
- [ ] 89-02-PLAN.md -- Profile API tests + onboarding wizard rewrite

### Phase 90: Email Operations Verification
**Goal**: Users can perform the complete email workflow -- list, read, compose, reply, forward, organize with folders and labels, manage signatures and templates
**Depends on**: Phase 89 (auth must work to access email)
**Requirements**: BAPI-02, BAPI-03, BAPI-04, BAPI-05, BAPI-25, FE-03, FE-04, FE-05, FE-12, FE-13
**Success Criteria** (what must be TRUE):
  1. Email list loads, filters, searches, and paginates -- both backend API and frontend rendering verified
  2. Email thread view displays messages and attachments correctly, and all actions (reply, forward, delete, star, flag, move) execute successfully
  3. Email compose works for new messages, replies, and forwards -- draft save, schedule send, and undo send all function
  4. Folder operations (list, create, rename, move, delete, sync) work via API and sidebar drag-drop in the frontend
  5. Labels sidebar renders with create/edit/delete/reorder, drag-drop assigns labels to emails, and signatures/templates CRUD all work via API
**Current audit status (2026-03-20):**
- Fixed: Gmail Inbox aggregation now includes label-backed inbox mail (category-backed messages no longer disappear from Inbox queries)
- Fixed: reply recipient resolution now handles display-name senders, reply-to headers, and self-sent messages
- Fixed: provider-folder reorder no longer collides with email drop targets in the same DnD context
- Fixed: thread row drag no longer owns the whole row; checkbox and quick actions are isolated from row-open behavior
- Remaining: thread-route reply/forward UI still needs live revalidation, label reorder persistence is still open, and move dialog UX still exposes raw Gmail categories
**Plans**: TBD (live audit hotfix stream active)

### Phase 91: Calendar, Contacts & Reminders Verification
**Goal**: Users can manage their calendar events, contacts, and reminders through both API and frontend
**Depends on**: Phase 89 (auth must work)
**Requirements**: BAPI-06, BAPI-07, BAPI-12, BAPI-23, FE-07, FE-08, FE-14
**Success Criteria** (what must be TRUE):
  1. Calendar events can be listed, created, edited, deleted, and synced -- conflict detection and focus-time work via API
  2. Calendar invite operations work: get invite details, RSVP (accept/decline/tentative), send invites, cancel events
  3. Contacts can be listed, created, edited, deleted, bulk-deleted, VIP toggled, imported via vCard, synced, and extracted from emails
  4. Reminders page works end-to-end: list, create, complete, delete, and Kanban view renders correctly
**Plans**: TBD

### Phase 92: AI & Knowledge Base Verification
**Goal**: Users can use all AI-powered features including chat, compose assistance, and knowledge base search
**Depends on**: Phase 89 (auth must work)
**Requirements**: BAPI-13, BAPI-14, BAPI-15, BAPI-16, FE-06
**Success Criteria** (what must be TRUE):
  1. AI non-chat features work: compose, summarize, smart-reply, categorize, sentiment, priority scoring, triage, follow-ups, briefing, and draft generation all return valid responses
  2. AI chat streams messages correctly, conversation CRUD works, and HITL approve/reject flow completes without errors
  3. Knowledge base operations work: backfill embeddings, list/delete embeddings, semantic search returns relevant results
  4. AI observability endpoints return run history and cost summaries for admin users
  5. AI chat frontend displays streaming responses, tool results render correctly, and HITL approval UI functions in the browser
**Plans**: TBD

### Phase 93: Admin, Subscriptions & Integrations
**Goal**: Admin operations, settings, billing, compliance, provider connections, and organization management all work correctly
**Depends on**: Phase 89 (auth must work)
**Requirements**: BAPI-08, BAPI-09, BAPI-10, BAPI-11, BAPI-17, BAPI-18, BAPI-19, FE-10, FE-11, FE-19, FE-20
**Success Criteria** (what must be TRUE):
  1. Admin can list users, ban/unban, impersonate, and revoke sessions -- admin pages render and function in the browser
  2. Label management API works (list, create, update, delete, add/remove emails, reorder) beyond what Phase 90 covers in the frontend
  3. Provider management works end-to-end: list, connect Google/Microsoft/IMAP, test connections, delete -- frontend OAuth flows complete successfully
  4. Subscription, compliance, and tenant management APIs all return correct responses (get status, usage, GDPR export/delete, tenant CRUD)
  5. Organization flows work in the frontend: create org, invite members, switch orgs, accept invitations -- and settings pages function for all categories
**Plans**: TBD

### Phase 94: Infrastructure & Remaining Pages
**Goal**: WebSocket connectivity, health monitoring, webhook processing, and all remaining frontend pages work correctly
**Depends on**: Phase 89 (auth must work)
**Requirements**: BAPI-20, BAPI-21, BAPI-22, FE-09, FE-15, FE-16, FE-17, FE-18
**Success Criteria** (what must be TRUE):
  1. Realtime auth token endpoint returns a valid token and WebSocket connects successfully with it
  2. Health endpoints (health, ready, live, queues) all respond correctly and reflect actual system state
  3. Webhook endpoints process incoming notifications (Gmail push, Microsoft Graph, Calendar, Contacts) without errors
  4. Dashboard renders all widgets, customization drawer works, and layout persists across sessions
  5. Tasks page renders real content (not placeholder), analytics page shows real data, landing page renders all sections, and legal pages render
**Plans**: TBD

### Phase 95: Dead Code & Cleanup
**Goal**: Codebase is clean -- no dead code, stale shims, unused dependencies, debug statements, or orphaned routes
**Depends on**: Phases 89-94 (testing phases identify what is actually dead vs. used)
**Requirements**: CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06, CLN-07, CLN-08
**Success Criteria** (what must be TRUE):
  1. Orphaned renderers (bulk_email_actions), unused exports, and stale compatibility shims are deleted from the codebase
  2. All hardcoded user-visible strings are replaced with i18n keys in both en.ts and it.ts -- no English text in .tsx files
  3. Legacy API artifacts removed: PendingAction type, deprecated voltAgentApi alias, multiAgentApi shim, stale HITL methods
  4. Console.log/debug statements removed from production code, unused dependencies removed from both package.json files
  5. Stale contract test assertions updated and any dead routes/controllers discovered during testing are removed
**Plans**: TBD

### Phase 96: UI/UX Polish
**Goal**: Every page has proper empty states, loading skeletons, error feedback, mobile responsiveness, dark mode support, keyboard navigation, and complete Italian translation
**Depends on**: Phase 95 (cleanup first, then polish -- avoid polishing dead code)
**Requirements**: UIPOL-01, UIPOL-02, UIPOL-03, UIPOL-04, UIPOL-05, UIPOL-06, UIPOL-07
**Success Criteria** (what must be TRUE):
  1. Every page that can be empty shows a designed empty state with illustration and actionable guidance -- not a blank area or generic "no data"
  2. Every async data fetch shows a loading skeleton matching the content layout -- not a spinner or blank screen
  3. Every error shows a user-friendly message with a retry action -- no raw error codes or silent failures visible to users
  4. All pages render correctly on mobile (375px+) with no overflow or hidden content, and dark mode works across all pages without white flash or unthemed elements
  5. Keyboard navigation works on all interactive elements, and Italian translation is complete with no missing keys or English fallbacks visible
**Plans**: TBD

### Phase 97: MUI Chat Migration
**Goal**: Chat UI uses MUI exclusively -- all chat CSS files migrated to sx props, ChatThemeBridge deleted, Tailwind removed from project
**Depends on**: Phase 96 (UI polish establishes patterns that chat migration follows)
**Requirements**: UIPOL-08, UIPOL-09, UIPOL-10, UIPOL-11
**Success Criteria** (what must be TRUE):
  1. All components use MUI theme exclusively -- no raw CSS classes, no Tailwind utilities, no hardcoded colors in any .tsx file
  2. The 3 chat CSS files (~950 lines total) are deleted and their styles are expressed via MUI sx props
  3. ChatThemeBridge component/file no longer exists in the codebase
  4. tailwindcss package is removed from frontend package.json and no Tailwind config files remain
**Plans**: TBD

### Phase 98: Security Verification
**Goal**: All security controls are verified working -- auth guards reject unauthorized access, tenant isolation holds, CSRF protects mutations, rate limiting throttles abuse, RBAC enforces roles
**Depends on**: Phase 95 (cleanup may remove dead routes that would otherwise need security testing)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05
**Success Criteria** (what must be TRUE):
  1. Every protected route returns 401 for unauthenticated requests -- no routes accidentally left unprotected
  2. Tenant isolation holds: authenticated user A cannot read, update, or delete user B's data across all tested endpoints
  3. CSRF protection rejects mutation requests that lack a valid CSRF token
  4. Rate limiting activates on sensitive endpoints (login, send email, AI chat) -- exceeding the limit returns 429
  5. Role-based access enforced: member-role user cannot access admin-only endpoints (returns 403)
**Plans**: TBD

## Progress

**Execution Order:**
Phases 89 must complete first (auth is prerequisite).
Phases 90-94 can be worked in sequence (domain by domain) or partially parallel.
Phase 95 depends on 89-94 (testing reveals dead code).
Phase 96 depends on 95 (polish after cleanup).
Phase 97 depends on 96 (MUI migration follows polish patterns).
Phase 98 can run after 95 (security testing on clean codebase).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 89. Auth & Onboarding Verification | 1/2 | In Progress|  |
| 90. Email Operations Verification | 0/? | In Progress | - |
| 91. Calendar, Contacts & Reminders Verification | 0/? | Not started | - |
| 92. AI & Knowledge Base Verification | 0/? | Not started | - |
| 93. Admin, Subscriptions & Integrations | 0/? | Not started | - |
| 94. Infrastructure & Remaining Pages | 0/? | Not started | - |
| 95. Dead Code & Cleanup | 0/? | Not started | - |
| 96. UI/UX Polish | 0/? | Not started | - |
| 97. MUI Chat Migration | 0/? | Not started | - |
| 98. Security Verification | 0/? | Not started | - |

---
*Roadmap created: 2026-02-09*
*v5.0 completed: 2026-03-10 -- 15 phases, 34 plans, 51/51 requirements*
*v5.1 completed: 2026-03-15 -- 11 phases, 30 plans*
*v6.0 archived: 2026-03-20 -- 12 phases (77-88), 4/66 completed, remainder deferred to v8.0+*
*v7.0 roadmap added: 2026-03-20 -- 10 phases, 69 requirements across 5 categories*
