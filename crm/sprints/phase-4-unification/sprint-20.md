# Sprint 20 — Contextual Sidebar & Activity Timeline

| Campo            | Valore                                           |
| ---------------- | ------------------------------------------------ |
| **Fase**         | Phase 4 — UX Unification & Auto-Population       |
| **Date**         | 2026-04-14 → 2026-04-28                          |
| **Obiettivo**    | CRM data surfaces contextually when viewing emails and contacts. Unified activity timeline replaces fragmented module views. |
| **Capacita**     | 18 SP                                            |

---

## Sprint Backlog

- [ ] T-2001 — **Entity Context Sidebar component.** Create `frontend/components/common/EntityContextSidebar.tsx`: a 320px right-side drawer (collapsible via toggle button). Accepts `contactId` or `email` prop. Shows: contact card (name, email, company), linked CRM account, open deals (stage chip + value), active tickets (count + status), relationship strength indicator (email frequency). Uses parallel TanStack queries. Same component reused across Email, Contact, and CRM views. — [4 SP]
- [ ] T-2002 — **Backend: CRM context endpoint.** Create `GET /api/v1/crm/context/:contactId` — returns aggregated CRM data for a contact in one call: { account, deals[], tickets[], recentActivities[], emailCount, lastInteraction }. Avoids N+1 by joining in a single Prisma query with select/include. — [2 SP]
- [ ] T-2003 — **Email thread context integration.** Wire `EntityContextSidebar` into the email thread view. When user opens an email, extract sender email → resolve to contactId → pass to sidebar. If no contact found, show "Unknown contact — create?" with quick-add button. If contact exists but no CRM data, show "No CRM data yet — AI will analyze after next sync." — [3 SP]
- [ ] T-2004 — **Activity Timeline component.** Create `frontend/components/common/ActivityTimeline.tsx`: chronological stream of events for an entity. Event types: email_sent, email_received, meeting, deal_stage_change, ticket_update, note. Each item: icon + timestamp + description + clickable link. Virtualized for performance (max 100 visible, load more on scroll). — [3 SP]
- [ ] T-2005 — **Backend: activity timeline endpoint.** Create `GET /api/v1/crm/activities/:entityType/:entityId` — returns paginated activities (cursor-based, limit 50). Aggregates from CrmActivity table + deal stage change history + ticket status changes. Sorted by date desc. — [2 SP]
- [ ] T-2006 — **Contact detail CRM tab.** Add a "CRM" tab to the existing Contact detail page. Contents: linked account (with change button), open deals table (name, stage, value), ticket history table (subject, status, date), and ActivityTimeline component. Uses existing CRM query hooks + new context endpoint. — [2 SP]
- [ ] T-2007 — **AI Suggestions feed widget.** Create `frontend/components/dashboard/CrmSuggestionsFeed.tsx`: Dashboard card showing "AI Suggestions — N pending." Lists suggestions grouped by type (accounts, deals, tickets). Each item: icon + description + Accept/Dismiss buttons. Bulk "Accept All" / "Dismiss All" actions. Uses `POST /api/v1/crm/suggestions/:id/accept` and `dismiss`. — [2 SP]

**Totale: 18 SP**

---

## Dipendenze

- Sprint 19 complete (CrmSuggestion model + suggestion service + auto-population hooks)
- Existing email thread view component
- Existing contact detail page

## Rischi

1. **Context sidebar may slow email view.** Mitigazione: queries are parallel, cached with TanStack Query (staleTime: 5min). Sidebar loads asynchronously — email content renders immediately.
2. **Activity timeline aggregation query may be slow.** Mitigazione: CrmActivity table has index on [tenantId, entityType, entityId, date]. Cursor-based pagination limits result set.
3. **Contact detail page already complex (tabs).** Mitigazione: CRM tab is lazy-loaded, only queries when tab is selected.

## Definition of Done

- [ ] Entity Context Sidebar renders when viewing any email with a known sender
- [ ] Contact detail page has a "CRM" tab with account, deals, tickets, and timeline
- [ ] Activity Timeline shows chronological events (emails, meetings, deal changes)
- [ ] AI Suggestions feed widget appears on dashboard with pending suggestions
- [ ] Accept/Dismiss actions on suggestions create/discard CRM entities
- [ ] Context sidebar loads in <200ms (parallel queries)
- [ ] Frontend tsc: passing
- [ ] Backend tsc: passing
