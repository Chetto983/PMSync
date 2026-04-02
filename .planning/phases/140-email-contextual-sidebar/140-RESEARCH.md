# Phase 140: Email Contextual Sidebar - Research

**Researched:** 2026-04-02
**Domain:** Frontend contextual sidebar + Backend CRM context API enrichment
**Confidence:** HIGH

## Summary

Phase 140 is largely already implemented. The `EntityContextSidebar` component exists at `frontend/components/common/EntityContextSidebar.tsx` and is already wired into both the email list reading pane (`pages/dashboard/email.tsx`) and the standalone thread detail page (`pages/dashboard/email/thread/[threadId].tsx`). The backend `ContextService` already returns contact profile, company/account, open deals, active tickets, relationship strength, and recent activities.

The remaining gaps are narrow: (1) the backend context response does not include contact **tags** (required by CTX-01: "name, email, company, tags"), (2) the sidebar lacks a contact tags display, and (3) the collapse/expand behavior needs verification against the success criteria for persistence and non-blocking load.

**Primary recommendation:** This phase requires minimal work -- add `tags` to the backend context response, display tags in the sidebar, and verify existing collapse/expand + non-blocking load behavior satisfies all success criteria.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | User sees sender's contact profile (name, email, company, tags) in right sidebar when viewing an email | Backend `ContextService.getByContactId` returns name, email, company but NOT tags. Contact model has `tags: String[]`. Frontend `EntityContextSidebar` renders ContactCard with name/email/company but no tags. **Gap: add tags to backend response + frontend display.** |
| CTX-02 | User sees sender's company, open deals, and recent tickets in email right sidebar | **Already implemented.** Backend returns `account`, `deals` (top 5), `tickets` (active, top 5). Frontend renders all three sections with clickable navigation to CRM detail pages. |
| CTX-06 | User can collapse/expand the contextual sidebar to reclaim reading space | **Already implemented.** `EntityContextSidebar` uses MUI `Drawer variant="persistent"` with open/close toggle via `PanelRightOpen`/`PanelRightClose` icons. State managed via `useState` in parent. Collapse state does NOT persist across sessions (localStorage not used). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

### Mandatory
- Post-edit validation: `cd frontend && npx tsc --noEmit` and `cd backend && npx tsc --noEmit` after every edit
- Translations first: add strings to `frontend/locales/en.ts` and `it.ts` before component changes
- Multi-tenant: every backend query MUST include `tenantId`
- No hardcoded strings, colors, or CSS -- use translations + MUI theme `sx` props
- Max 500 lines per file
- Loading/error/empty states required for all data-driven UI
- TanStack Query wrapping for all API calls (`staleTime: 5min`, `gcTime: 30min`, `retry: 1`)
- Follow existing patterns -- never invent new approaches
- NEVER run `prisma db push` -- use migration workflow

### Relevant Anti-patterns
- No raw `apiClient.get()` in components -- use query hooks
- No inventing endpoints -- use existing API modules in `frontend/lib/api/*.ts`

## Standard Stack

No new libraries needed. Everything uses existing project stack:

### Core (already installed)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| MUI (Material UI) | All UI components (Drawer, Chip, Avatar, etc.) | Project-wide UI framework |
| TanStack Query | Data fetching + caching | Project standard for all API calls |
| lucide-react | Icons (PanelRightOpen, PanelRightClose, etc.) | Project icon library |
| Allotment | Resizable panel layout | Already used in EmailLayout |

### No New Dependencies
This phase requires zero new packages. All functionality builds on existing components and APIs.

## Architecture Patterns

### Existing Component Structure (DO NOT CHANGE)
```
frontend/
  components/common/EntityContextSidebar.tsx    # THE sidebar component (already exists)
  hooks/queries/use-crm-context.ts              # Query hooks (already exist)
  hooks/queries/crm-context-keys.ts             # Query key factory
  lib/api/crm-context.ts                        # API module (already exists)
  locales/en.ts, it.ts                          # Translations (crmContext section exists)

backend/
  src/modules/crm/context/services/context.service.ts     # Data assembly
  src/modules/crm/context/controllers/context.controller.ts
  src/modules/crm/context/dto/context.dto.ts
```

### Pattern: Sidebar Integration in Email Pages
The sidebar is already integrated in two places:

1. **Email list reading pane** (`pages/dashboard/email.tsx` line 579): `EntityContextSidebar` rendered inside the `readingPane` memo, alongside `ExpandedMessage`. Sidebar state in `contextSidebarOpen` useState.

2. **Thread detail page** (`pages/dashboard/email/thread/[threadId].tsx` line 419): `EntityContextSidebar` rendered conditionally `{!isMobile && (...)}` next to `ThreadView`. Sidebar state in `sidebarOpen` useState, defaults to `!isMobile`.

### Pattern: Backend Context Response Assembly
`ContextService.getByContactId()` assembles data from multiple Prisma queries in sequence:
1. Fetch contact (with select)
2. Fetch account link (AccountContact join)
3. Fetch deals (filtered by contact OR account)
4. Fetch tickets (filtered by contact OR account)
5. Fetch recent activities (filtered by account/deals)

Tags are available on the Contact model (`tags: String[] @default([])`) but not included in the current `select` clause or response shape.

### Anti-Patterns to Avoid
- **Creating a new sidebar component:** The existing `EntityContextSidebar` is correct. Extend it, don't replace it.
- **Fetching tags in a separate API call:** Add tags to the existing context response; don't create a new endpoint.
- **Persisting sidebar state in Zustand/Redux:** Keep it in component state (matches existing pattern). If persistence is needed, use localStorage directly (matches `email-layout-*` panel persistence pattern in EmailLayout.tsx).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent drawer | Custom slide animation | MUI `Drawer variant="persistent"` | Already in use, handles transitions |
| Collapse state persistence | Custom state manager | localStorage with a key like `pmsync:crm-sidebar-open` | Matches EmailLayout panel persistence pattern |
| Contact tags display | Custom tag list | MUI `Chip` components in a flex row | Already used for ticket status chips in sidebar |

## Common Pitfalls

### Pitfall 1: Breaking the Existing Sidebar
**What goes wrong:** Refactoring `EntityContextSidebar` breaks existing wiring in both email.tsx and [threadId].tsx.
**Why it happens:** Two different pages use the same component with slightly different props.
**How to avoid:** Only ADD to the component (tags display). Do not restructure or rename props. Test both integration points.
**Warning signs:** Type errors in email.tsx or [threadId].tsx after editing the component.

### Pitfall 2: N+1 Backend Queries for Tags
**What goes wrong:** Fetching tags separately from the main context query adds latency.
**Why it happens:** Tags are on the Contact model, which is already queried but tags aren't in the `select` clause.
**How to avoid:** Just add `tags: true` to the existing `prisma.contact.findUnique({ select: { ... } })` call.
**Warning signs:** Additional API calls in network tab.

### Pitfall 3: Sidebar Blocking Email Content
**What goes wrong:** If the CRM context query is slow, it blocks the entire reading pane.
**Why it happens:** Tight coupling between email content and sidebar rendering.
**How to avoid:** The current architecture already handles this correctly -- `EntityContextSidebar` manages its own loading state independently via its own `useQuery` hook. The email content renders separately. No change needed here.

### Pitfall 4: Missing Tags on Unknown Contacts
**What goes wrong:** When the sidebar shows "Unknown Contact" (no CRM match), trying to display tags causes errors.
**Why it happens:** The `data` object is null for unknown contacts.
**How to avoid:** Tags display should only render inside `SidebarContent` (which only renders when `data` is non-null).

## Code Examples

### Gap 1: Add tags to backend context response

Current `select` in `context.service.ts` line 54-66:
```typescript
// CURRENT (missing tags)
const contact = await this.prisma.contact.findUnique({
  where: { id_tenantId: { id: contactId, tenantId } },
  select: {
    id: true,
    displayName: true,
    company: true,
    emails: true,
    lastInteractedAt: true,
    totalInteractions: true,
    sentCount: true,
    receivedCount: true,
    isDeleted: true,
  },
});

// FIX: Add tags to select
select: {
  // ... existing fields ...
  tags: true,  // <-- ADD THIS
}
```

Update `CrmContextResponse.contact` shape:
```typescript
contact: {
  id: string;
  displayName: string | null;
  company: string | null;
  email: string | null;
  tags: string[];  // <-- ADD THIS
};
```

### Gap 2: Add tags to frontend type and display

In `frontend/lib/api/crm-context.ts`, update `CrmContactContext.contact`:
```typescript
contact: {
  id: string;
  displayName: string | null;
  company: string | null;
  email: string | null;
  tags: string[];  // <-- ADD THIS
};
```

In `EntityContextSidebar.tsx`, add tags display after ContactCard:
```typescript
{data.contact.tags.length > 0 && (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
    {data.contact.tags.map((tag) => (
      <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
    ))}
  </Box>
)}
```

### Gap 3: Collapse state persistence (optional enhancement)

If persistence across sessions is required:
```typescript
const STORAGE_KEY = 'pmsync:crm-sidebar-open';
const [sidebarOpen, setSidebarOpen] = useState(() => {
  if (typeof window === 'undefined') return !isMobile;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== null ? stored === 'true' : !isMobile;
});

const handleToggle = useCallback(() => {
  setSidebarOpen((prev) => {
    const next = !prev;
    localStorage.setItem(STORAGE_KEY, String(next));
    return next;
  });
}, []);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No contextual sidebar | EntityContextSidebar with CRM context API | Pre-Phase 140 (already exists) | Most of CTX-01, CTX-02, CTX-06 already satisfied |

**What already works:**
- Contact profile (name, email, company) -- displayed in ContactCard
- Company/account info -- displayed with Building2 icon
- Open deals (top 5) -- displayed with Handshake icon, clickable to deal detail
- Active tickets (top 5) -- displayed with Ticket icon, clickable to ticket detail  
- Relationship strength meter -- based on email count
- Collapse/expand toggle -- PanelRightOpen/PanelRightClose icons
- Non-blocking load -- sidebar has independent loading skeleton
- Unknown contact handling -- shows "Unknown Contact" with optional "Create Contact" chip

**What's missing:**
- Contact tags in backend response and frontend display
- (Possibly) Collapse state persistence across sessions

## Open Questions

1. **Should collapse state persist across sessions?**
   - What we know: Currently `useState` with no persistence. EmailLayout uses localStorage for panel sizes.
   - What's unclear: Success criteria say "can collapse/expand" but don't mention persistence.
   - Recommendation: Add localStorage persistence to match EmailLayout pattern. Low effort, better UX.

2. **Should tags be editable from the sidebar?**
   - What we know: CTX-01 says "sees" tags, not "edits" tags. Contact detail page likely handles editing.
   - Recommendation: Display-only. Editing is out of scope for this phase.

3. **Are there tags in production data?**
   - What we know: `tags: String[] @default([])` exists on Contact model. AI triage or manual contact editing may populate them.
   - Recommendation: Handle empty tags gracefully (don't show section if empty).

## Sources

### Primary (HIGH confidence)
- `frontend/components/common/EntityContextSidebar.tsx` -- existing sidebar implementation (485 lines)
- `frontend/pages/dashboard/email.tsx` -- reading pane integration (704 lines)
- `frontend/pages/dashboard/email/thread/[threadId].tsx` -- thread detail integration (484 lines)
- `backend/src/modules/crm/context/services/context.service.ts` -- backend data assembly (354 lines)
- `backend/src/modules/crm/context/controllers/context.controller.ts` -- API endpoints
- `frontend/lib/api/crm-context.ts` -- frontend API types
- `frontend/hooks/queries/use-crm-context.ts` -- query hooks
- `backend/prisma/schema.prisma` -- Contact model (line 877, tags at line 898)
- `frontend/locales/en.ts` -- crmContext translations (line 5656)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing
- Architecture: HIGH - component and API already exist, verified by reading source
- Pitfalls: HIGH - narrow scope, well-understood integration points

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable, minimal external dependencies)
