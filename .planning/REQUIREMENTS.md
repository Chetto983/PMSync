# Requirements: PMSync v12.0

**Defined:** 2026-04-01
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v12.0 Requirements

Requirements for UX Unification — 4-Pillar Simplification. Each maps to roadmap phases.

### Navigation

- [x] **NAV-01**: User sees only 4 pillars in sidebar: Mail, Calendar, Contacts, Tasks + Settings
- [x] **NAV-02**: User can access all former CRM/AI routes via Command Palette (Cmd+K) without sidebar entry
- [ ] **NAV-03**: User can search across emails, contacts, deals, tasks, and KB articles from Command Palette
- [x] **NAV-04**: User can execute actions from Command Palette (create deal, create task, compose email, navigate to any route)
- [ ] **NAV-05**: User sees AI-curated "Today" dashboard as home: due tasks, pending replies, deal alerts, upcoming meetings
- [x] **NAV-06**: User can still deep-link to any CRM page directly (URLs remain functional)

### Contextual Panels

- [ ] **CTX-01**: User sees sender's contact profile in right sidebar when viewing an email
- [ ] **CTX-02**: User sees sender's company, open deals, and recent tickets in email right sidebar
- [ ] **CTX-03**: User sees activity timeline (emails, deals, tasks, meetings, notes) on contact detail page
- [ ] **CTX-04**: User sees related emails, deal history, and upcoming tasks when viewing a contact
- [ ] **CTX-05**: User sees mini-CRM hover card (name, company, deal status, last interaction) when hovering any contact name in the app
- [ ] **CTX-06**: User can collapse/expand the contextual right sidebar to reclaim reading space

### Unified Tasks

- [ ] **TASK-01**: User sees a single Tasks page listing follow-ups, reminders, CRM deal actions, ticket actions, and manual to-dos
- [ ] **TASK-02**: User can create a manual task from anywhere via Cmd+K or quick-add button
- [ ] **TASK-03**: User can filter tasks by type (follow-up, reminder, deal, ticket, manual), contact, due date, and status
- [ ] **TASK-04**: User can save filter combinations as named smart views (e.g., "My Follow-ups", "Open Tickets")
- [ ] **TASK-05**: User can pin smart views to the Tasks sidebar for quick access
- [ ] **TASK-06**: User can toggle between list view and kanban board view on Tasks
- [ ] **TASK-07**: User can drag tasks between kanban columns to change status

### AI Automation

- [ ] **AI-01**: System auto-links incoming emails to matching contacts in background
- [ ] **AI-02**: System auto-links incoming emails to relevant deals/tickets based on contact + context
- [ ] **AI-03**: System auto-categorizes emails by type (support, sales, internal, newsletter)
- [ ] **AI-04**: User sees suggested actions after reading an email (create task, update deal, link to ticket)
- [ ] **AI-05**: User can accept or dismiss AI suggestions with one click
- [ ] **AI-06**: User can open AI Assistant as overlay panel from any screen via keyboard shortcut
- [ ] **AI-07**: AI Assistant overlay is context-aware (knows current email/contact/deal being viewed)

## Future Requirements

### Advanced Personalization

- **PERS-01**: User can customize which smart views appear per-role (sales vs support vs management)
- **PERS-02**: System learns user patterns and auto-promotes frequently used smart views
- **PERS-03**: User can create custom dashboard widgets beyond the default "Today" layout

### Advanced Automation

- **AUTO-01**: System auto-creates follow-up tasks from email content without user intervention
- **AUTO-02**: System auto-updates deal stages based on email conversation signals
- **AUTO-03**: System auto-generates meeting summaries and links to relevant contacts/deals

## Out of Scope

| Feature | Reason |
|---------|--------|
| CRM data deletion or schema changes | Existing CRM modules stay intact; only navigation changes |
| Mobile app (native) | PWA provides native-like experience; web-first continues |
| Custom object types (Attio-style) | Existing data model (contacts, deals, tickets) is sufficient |
| Real-time collaboration | Single-user focus; team features deferred |
| Telegram/WhatsApp integration | Input channels beyond email deferred to future milestone |
| Split Inbox (Superhuman-style) | AI categorization (AI-03) covers the intent; split UX is separate effort |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAV-01 | Phase 135 | Complete |
| NAV-02 | Phase 136 | Complete |
| NAV-03 | Phase 136 | Pending |
| NAV-04 | Phase 136 | Complete |
| NAV-05 | Phase 145 | Pending |
| NAV-06 | Phase 135 | Complete |
| CTX-01 | Phase 140 | Pending |
| CTX-02 | Phase 140 | Pending |
| CTX-03 | Phase 141 | Pending |
| CTX-04 | Phase 141 | Pending |
| CTX-05 | Phase 141 | Pending |
| CTX-06 | Phase 140 | Pending |
| TASK-01 | Phase 137 | Pending |
| TASK-02 | Phase 138 | Pending |
| TASK-03 | Phase 138 | Pending |
| TASK-04 | Phase 139 | Pending |
| TASK-05 | Phase 139 | Pending |
| TASK-06 | Phase 138 | Pending |
| TASK-07 | Phase 138 | Pending |
| AI-01 | Phase 142 | Pending |
| AI-02 | Phase 142 | Pending |
| AI-03 | Phase 142 | Pending |
| AI-04 | Phase 143 | Pending |
| AI-05 | Phase 143 | Pending |
| AI-06 | Phase 144 | Pending |
| AI-07 | Phase 144 | Pending |

**Coverage:**
- v12.0 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
