# Phase 141: Contact 360 & Hover Cards - Research

**Researched:** 2026-04-02
**Domain:** Frontend contact UI enhancement + backend timeline aggregation
**Confidence:** HIGH

## Summary

Phase 141 builds a unified "Contact 360" view and hover cards. The codebase already has substantial infrastructure: a contact detail page with 4 tabs (Details, Activity, Notes, CRM), a `ContactActivityFeed` component backed by `GET /contacts/:id/history`, a `ContactCrmTab` showing deals/tickets/activities via the CRM context API, and an `EntityContextSidebar` (from Phase 140) that displays contact CRM context in a collapsible drawer.

The main gaps are: (1) the existing activity feed only shows email interactions -- it lacks deals, tasks, meetings, and notes in a unified timeline; (2) the contact detail page has no "related emails" section showing actual email threads; (3) there is no hover card component anywhere in the app; and (4) the Notes tab is a stub with no backend persistence.

**Primary recommendation:** Build a new unified timeline backend endpoint that aggregates emails, deals, tasks, calendar events, and CRM activities into a single paginated stream. For the hover card, use MUI `Popover` with `mouseEnter`/`mouseLeave` delay logic, reusing the existing CRM context API (`/crm/context/:contactId` or `/crm/context/by-email`) which already returns all required fields (name, company, deals, last interaction). No new schema changes required.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-03 | User sees activity timeline (emails, deals, tasks, meetings, notes) on contact detail page | Existing `ContactActivityFeed` shows emails only. Need new unified timeline endpoint aggregating all entity types. `CrmActivity` model covers deal activities, `ManualTask` has `contactId`, `CalendarEvent` has `attendees` JSON. Backend must merge + sort by date. |
| CTX-04 | User sees related emails, deal history, and upcoming tasks when viewing a contact | Contact detail `ContactCrmTab` already shows deals and tickets. Missing: related email threads panel, upcoming tasks section. `ManualTask.contactId` FK exists. Emails linked via contact email addresses (same pattern as `getContactHistory`). |
| CTX-05 | User sees mini-CRM hover card (name, company, deal status, last interaction) when hovering any contact name in the app | No hover card exists. CRM context API (`/crm/context/:contactId` and `/crm/context/by-email`) already returns all required data. Need `ContactHoverCard` component using MUI `Popover`, plus `ContactName` wrapper component for hover trigger. |

</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MUI (`@mui/material`) | 7.x | UI components (Popover, Timeline, List) | Project standard, CLAUDE.md mandates MUI only |
| MUI Lab (`@mui/lab`) | 7.x | Timeline component (already used in `ActivityTimeline.tsx`) | Already imported and used |
| TanStack Query | 5.x | Data fetching with caching, pagination | Project standard for all API calls |
| lucide-react | 0.4x | Icons | Project standard icon library |

### No New Dependencies Required
All features can be built with existing packages. The `@mui/lab` Timeline component is already used in `ActivityTimeline.tsx`. MUI `Popover` is already used in multiple places (color picker, folder picker, compose menu).

## Architecture Patterns

### Existing Component Structure (Contact Detail)
```
frontend/components/contacts/
  ContactDetail.tsx              # Main detail view (4 tabs)
  ContactLayout.tsx              # 3-panel layout (sidebar, list, detail)
  contact-detail/
    ContactInfoPanel.tsx         # Tab 0: contact fields
    ContactActivityFeed.tsx      # Tab 1: email-only history (NEEDS UPGRADE)
    ContactNotesTab.tsx          # Tab 2: stub (no backend)
    ContactCrmTab.tsx            # Tab 3: deals, tickets, activity timeline
    ContactAccountsSection.tsx   # Linked accounts (in InfoPanel)
```

### Backend Entity Relationships (for unified timeline)
```
Contact
  ├── emails (JSON field: [{value, type, primary}])
  │   └── Email (linked by matching email address, NOT FK)
  ├── dealContacts → DealContact → CrmDeal → CrmActivity
  ├── accountContacts → AccountContact → CrmAccount → CrmActivity
  ├── manualTasks (FK: ManualTask.contactId)
  ├── tickets (FK: Ticket.contactId)
  └── CalendarEvent (linked by attendees JSON, NOT FK)
```

### Pattern 1: Unified Timeline Endpoint
**What:** New `GET /contacts/:id/timeline` endpoint that aggregates all activity types
**When to use:** CTX-03 (activity timeline on contact detail page)
**Implementation:**
```typescript
// Backend: new method in contacts.controller.ts or a dedicated timeline service
// Aggregate from multiple sources into a single sorted, paginated stream

interface TimelineEntry {
  id: string;
  type: 'email_sent' | 'email_received' | 'deal_activity' | 'task' | 'meeting' | 'ticket' | 'note';
  title: string;
  summary: string | null;
  date: string;           // ISO date for sorting
  metadata: Record<string, unknown>;  // type-specific data
  entityId: string;       // link back to source entity
}

// Response shape
interface TimelineResponse {
  entries: TimelineEntry[];
  nextCursor: string | null;
  total: number;
}
```

### Pattern 2: Hover Card with Delayed Popover
**What:** MUI Popover with mouseEnter/mouseLeave delay (300ms open, 100ms close)
**When to use:** CTX-05 (hover card on any contact name)
**Implementation approach:**
```typescript
// Reusable ContactHoverCard component
// Uses existing CRM context API which already returns:
// - contact.displayName, contact.company, contact.email
// - deals (with stage, amount)
// - lastInteraction, emailCount
// - account info

// Trigger: wrap contact name renders with <ContactName> component
// that manages Popover open/close with delay timers
```

### Pattern 3: Reuse EntityContextSidebar Data
**What:** The `EntityContextSidebar` (Phase 140) and `ContactCrmTab` both use `useCrmContextByContact` hook
**When to use:** CTX-04 and CTX-05 -- the same CRM context API powers the hover card
**Key insight:** No new backend endpoint needed for the hover card. `GET /crm/context/:contactId` already returns name, company, deals, tickets, recent activities, email count, and last interaction.

### Anti-Patterns to Avoid
- **Fetching all history at once:** The current `getContactHistory` fetches up to 50 emails. A unified timeline must be cursor-paginated to handle large volumes.
- **Hover card fetching on every hover:** Use TanStack Query caching (`staleTime: 5min`). The hover card query uses the same key as the sidebar, so data is often already cached.
- **N+1 queries in timeline:** The unified timeline must batch queries per entity type, then merge in-memory, not query per-entry.
- **Direct DB queries from controller:** Follow existing pattern -- controller > service > prisma.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timeline UI | Custom timeline layout | `@mui/lab` Timeline (already used in `ActivityTimeline.tsx`) | Already styled and tested in the app |
| Hover popover | Custom portal + positioning | MUI `Popover` with `anchorEl` | Handles z-index, scroll containment, responsive positioning |
| Hover delay logic | setTimeout soup | Reusable `useHoverPopover` hook (simple open/close with delays) | Prevents flicker, handles edge cases (fast mouse movement) |
| CRM data for hover | New endpoint | Existing `/crm/context/:contactId` and `/crm/context/by-email` | Already returns all needed fields |

## Common Pitfalls

### Pitfall 1: Hover Card Flicker
**What goes wrong:** Popover opens/closes rapidly as mouse moves between trigger and popover
**Why it happens:** mouseLeave fires on trigger before mouseEnter fires on popover
**How to avoid:** Use a single hover state manager with `onMouseEnter`/`onMouseLeave` on BOTH the trigger and popover, plus a close delay (200-300ms). When mouse enters popover before delay expires, cancel the close.
**Warning signs:** Users report "flashing" popover when moving mouse slowly

### Pitfall 2: Email-Contact Linking is String-Based
**What goes wrong:** Assuming there's a FK between Email and Contact
**Why it happens:** Emails link to contacts by matching email addresses in the JSON `emails` field, not by FK. The `from` field on Email is "Name <email>" format.
**How to avoid:** Use the same pattern as `getContactHistory` in `contact-provider-ops.service.ts`: extract email addresses from contact's JSON, then query `Email.to`/`Email.from` with those addresses.
**Warning signs:** Empty timeline despite having emails

### Pitfall 3: CalendarEvent-Contact Linking is JSON-Based
**What goes wrong:** Assuming there's a FK between CalendarEvent and Contact
**Why it happens:** CalendarEvent has an `attendees` JSON field, not a contactId FK. Matching requires extracting email from attendees and cross-referencing with contact emails.
**How to avoid:** For the timeline, query CalendarEvents where attendees JSON contains any of the contact's email addresses. Use raw SQL with JSONB operators for performance.
**Warning signs:** Missing calendar events in timeline

### Pitfall 4: Over-fetching for Hover Card
**What goes wrong:** Hover card triggers a heavy endpoint on every hover
**Why it happens:** Not leveraging TanStack Query cache
**How to avoid:** The CRM context query already has `staleTime: 5min, gcTime: 30min`. If the user already viewed the sidebar or contact detail, data is cached. Additionally, consider a lightweight `/contacts/:id/summary` endpoint if full CRM context is too heavy for hover.
**Warning signs:** Network waterfall on rapid hovering

### Pitfall 5: Duplicate Entries in Unified Timeline
**What goes wrong:** Same event appears twice (e.g., email in both `getContactHistory` and CRM activity)
**Why it happens:** CRM activities may include EMAIL type entries alongside actual email records
**How to avoid:** Deduplicate by source: use actual Email records for email events, CrmActivity only for non-email types (STAGE_CHANGE, NOTE, CALL, MEETING, TASK).
**Warning signs:** Duplicate timeline entries

## Code Examples

### Existing: CRM Context API (reuse for hover card)
```typescript
// frontend/lib/api/crm-context.ts -- already exists
export const crmContextApi = {
  getByContactId(contactId: string) {
    return apiClient.get<CrmContactContext>(`/crm/context/${contactId}`);
  },
  getByEmail(email: string) {
    return apiClient.get<CrmContactContext | null>('/crm/context/by-email', {
      params: { email },
    });
  },
};
```

### Existing: Contact History (email-only, will be supplemented)
```typescript
// frontend/hooks/queries/use-contacts.ts -- already exists
export function contactHistoryOptions(id: string, limit: number = 50) {
  return queryOptions({
    queryKey: ['contacts', 'history', id, limit],
    queryFn: async () => {
      return await contactsApi.getContactHistory(id, limit);
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}
```

### Existing: ActivityTimeline Component (reuse for unified timeline)
```typescript
// frontend/components/common/ActivityTimeline.tsx -- already exists
// Uses @mui/lab Timeline components
// Already handles: loading, load more, activity type icons
// Activity types supported: email_sent, email_received, meeting, 
//   deal_stage_change, ticket_update, note, call, task, STAGE_CHANGE, etc.
```

### Existing: MUI Popover Pattern (used in codebase)
```typescript
// Pattern from frontend/components/common/ColorPicker.tsx
// MUI Popover with anchorEl state management
<Popover
  open={!!anchorEl}
  anchorEl={anchorEl}
  onClose={handleClose}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
>
  {/* content */}
</Popover>
```

### Recommended: Hover Popover Hook
```typescript
// New: frontend/hooks/use-hover-popover.ts
import { useState, useRef, useCallback } from 'react';

export function useHoverPopover(openDelay = 300, closeDelay = 200) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseEnter = useCallback((event: React.MouseEvent<HTMLElement>) => {
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => {
      setAnchorEl(event.currentTarget);
    }, openDelay);
  }, [openDelay]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => {
      setAnchorEl(null);
    }, closeDelay);
  }, [closeDelay]);

  const handlePopoverMouseEnter = useCallback(() => {
    clearTimeout(closeTimer.current);
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => {
      setAnchorEl(null);
    }, closeDelay);
  }, [closeDelay]);

  return {
    anchorEl,
    open: !!anchorEl,
    triggerProps: { onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave },
    popoverProps: { onMouseEnter: handlePopoverMouseEnter, onMouseLeave: handlePopoverMouseLeave },
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Email-only history (`getContactHistory`) | Unified timeline aggregating all entity types | This phase | Single endpoint replaces multiple tab-specific queries |
| No hover preview | Hover card with CRM context | This phase | Reduces context-switching (user stays on current page) |
| Notes tab is stub | Notes tab still stub | N/A | Notes persistence is NOT in scope for this phase (no `Note` model exists in schema) |

**Key schema observations:**
- There is NO `Note` model in Prisma schema. The `ContactNotesTab` is a stub with no backend. The `notes` field on Contact is a single string, not a collection of notes. For CTX-03 "notes" in the timeline, only the CrmActivity type `NOTE` entries are available.
- `CalendarEvent` has NO direct FK to Contact. Linking is via `attendees` JSON field which contains email addresses.
- `Email` has NO direct FK to Contact. Linking is via matching email addresses.
- `ManualTask` HAS a direct FK to Contact (`contactId`).
- `Ticket` HAS a direct FK to Contact (`contactId`).
- `DealContact` is a join table linking deals to contacts.

## Open Questions

1. **Notes persistence scope**
   - What we know: ContactNotesTab is a stub. There is no Note model. CrmActivity has NOTE type entries but they're scoped to deals/accounts, not contacts directly.
   - What's unclear: Should this phase create a ContactNote model, or just show CrmActivity NOTE entries in the timeline?
   - Recommendation: OUT OF SCOPE for this phase. Show CrmActivity NOTEs in the unified timeline. Creating a proper ContactNote model is a separate feature.

2. **Calendar event matching performance**
   - What we know: CalendarEvent.attendees is a JSON field. Matching against contact emails requires JSONB array element extraction.
   - What's unclear: Volume of calendar events per tenant and query performance.
   - Recommendation: Use a raw SQL query with GIN index on attendees if performance is an issue. For MVP, filter in-application after a bounded date range query.

3. **Hover card placement scope**
   - What we know: CTX-05 says "when hovering any contact name in the app." Contact names appear in: email list (ThreadListItem), email thread (ExpandedMessage from field), contacts list, CRM deal detail, ticket detail, calendar events.
   - What's unclear: Is "any contact name in the app" literal, or just the most common surfaces?
   - Recommendation: Start with the highest-traffic surfaces: (1) email thread sender name, (2) email list sender name, (3) contacts list. Provide a reusable `<ContactName>` component that other surfaces can adopt incrementally.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend), React Testing Library (frontend) |
| Config file | `backend/jest.config.ts`, `frontend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern=contacts --no-coverage -t "timeline" --bail` |
| Full suite command | `cd backend && npx jest --no-coverage && cd ../frontend && npx jest --no-coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-03 | Unified timeline returns mixed entity types sorted by date | unit | `cd backend && npx jest --testPathPattern=timeline -x` | No - Wave 0 |
| CTX-03 | Unified timeline pagination (cursor-based) | unit | `cd backend && npx jest --testPathPattern=timeline -x` | No - Wave 0 |
| CTX-04 | Contact detail shows related emails section | unit (frontend) | `cd frontend && npx jest --testPathPattern=ContactDetail -x` | No - Wave 0 |
| CTX-04 | Contact detail shows upcoming tasks for contact | unit (frontend) | `cd frontend && npx jest --testPathPattern=ContactCrmTab -x` | Partial (`ContactCrmTab.test.tsx` exists) |
| CTX-05 | Hover card renders on mouse enter with delay | unit (frontend) | `cd frontend && npx jest --testPathPattern=ContactHoverCard -x` | No - Wave 0 |
| CTX-05 | Hover card shows correct CRM data | unit (frontend) | `cd frontend && npx jest --testPathPattern=ContactHoverCard -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **Per wave merge:** Full type-check + relevant Jest tests
- **Phase gate:** All type-checks green, hover card manual verification

### Wave 0 Gaps
- [ ] `backend/src/modules/contacts/services/__tests__/contact-timeline.service.spec.ts` -- covers CTX-03
- [ ] `frontend/components/contacts/__tests__/ContactHoverCard.test.tsx` -- covers CTX-05
- [ ] `frontend/hooks/__tests__/use-hover-popover.test.ts` -- covers hover delay logic

## Sources

### Primary (HIGH confidence)
- Prisma schema (`backend/prisma/schema.prisma`) - all entity relationships verified
- `backend/src/modules/contacts/controllers/contacts.controller.ts` - existing endpoints
- `backend/src/modules/contacts/services/contact-provider-ops.service.ts` - history implementation
- `backend/src/modules/crm/context/services/context.service.ts` - CRM context aggregation
- `frontend/components/contacts/ContactDetail.tsx` - current detail view structure
- `frontend/components/contacts/contact-detail/ContactActivityFeed.tsx` - current activity feed
- `frontend/components/contacts/contact-detail/ContactCrmTab.tsx` - CRM tab with deals/tickets
- `frontend/components/common/EntityContextSidebar.tsx` - Phase 140 sidebar (reusable data)
- `frontend/lib/api/contacts.ts` - contact API module with types
- `frontend/lib/api/crm-context.ts` - CRM context API module
- `frontend/hooks/queries/use-contacts.ts` - existing query hooks
- `frontend/hooks/queries/use-crm-context.ts` - CRM context hooks

### Secondary (MEDIUM confidence)
- MUI Popover documentation - hover behavior patterns
- MUI Lab Timeline - already used in `ActivityTimeline.tsx`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - existing patterns clearly documented in codebase
- Pitfalls: HIGH - identified from actual schema analysis (no FK assumptions)

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable - internal codebase patterns)

## Project Constraints (from CLAUDE.md)

- **Post-edit validation mandatory:** Run `npx tsc --noEmit` after every file edit (both frontend and backend)
- **Multi-tenant rule:** Every query MUST include `tenantId`
- **No hardcoded strings:** Use translation files (`locales/en.ts`, `locales/it.ts`)
- **MUI only:** No Tailwind utilities, use MUI `sx` props
- **Query hooks pattern:** Use `queryOptions()` + hooks in `hooks/queries/use-*.ts`, API modules in `lib/api/*.ts`
- **Loading states:** Skeleton > error Alert > empty state > data
- **Max 500 lines per file**
- **Never `prisma db push`** -- use migrations only
- **SCOPE CONTROL:** Do exactly what was asked, nothing more
- **Follow existing patterns:** Never invent new approaches when codebase patterns exist
