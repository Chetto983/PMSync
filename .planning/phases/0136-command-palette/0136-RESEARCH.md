# Phase 136: Command Palette - Research

**Researched:** 2026-04-01
**Domain:** Frontend UX -- global command palette with unified search and action execution
**Confidence:** HIGH

## Summary

Phase 136 enhances the existing `CommandPalette` component (`frontend/components/ai/CommandPalette/index.tsx`, ~504 lines) to satisfy three requirements: CRM route navigation without sidebar entries (NAV-02), cross-entity unified search (NAV-03), and action execution from the palette (NAV-04). The existing component already has the core scaffold -- Cmd+K trigger, MUI Dialog, keyboard navigation, debounced search, grouped commands, and i18n. However, it is missing: (1) CRM route commands for hidden pages like pipelines, deals, tickets, accounts, KB, forecast, churn, service-analytics, and AI governance; (2) search across deals, tasks/reminders, tickets, and KB articles (currently only emails + contacts); (3) action commands for "create deal", "create task", and other write operations.

The backend already has individual search endpoints for each entity: `emailsApi.searchEmails`, `contactsApi.listContacts({search})`, `crmDealsApi.list({search})`, `crmTicketsApi.list({search})`, `crmKBApi.search(q)`. There is also a `HybridSearchService` with pgvector+FTS unified search, but it is internal to the AI chat module and not exposed via HTTP. The frontend approach should call existing individual APIs in parallel from the client side, which avoids backend changes and keeps the phase frontend-only.

**Primary recommendation:** Extend the existing CommandPalette component -- add CRM navigation commands, wire additional search APIs (deals, tickets, KB), and add action commands. No new libraries needed. No backend changes required.

## Project Constraints (from CLAUDE.md)

- All components use MUI -- no Radix/shadcn, no Tailwind utilities
- i18n required -- all strings via `frontend/locales/en.ts` and `it.ts`, types in `index.ts`
- Max 500 lines per file -- current CommandPalette is 504 lines, will need to be split
- NEVER hardcode strings -- use `t.section.key` pattern
- Query hooks in `frontend/hooks/queries/` with `queryOptions()` export
- Raw `apiClient.get()` in components forbidden -- use API modules in `frontend/lib/api/*.ts`
- Handle loading/error/empty states
- Post-edit: run `cd frontend && npx tsc --noEmit` after every edit
- SCOPE CONTROL -- do exactly what was asked, nothing more
- Performance: TanStack Query `staleTime: 5min`, `gcTime: 30min`, `retry: 1`

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-02 | User can access all former CRM/AI routes via Command Palette (Cmd+K) without sidebar entry | Add navigation commands for all CRM routes (pipelines, deals, tickets, accounts, KB, forecast, churn, service-analytics, AI governance). Existing command structure supports this directly. |
| NAV-03 | User can search across emails, contacts, deals, tasks, and KB articles from Command Palette | Extend search to call `crmDealsApi.list({search})`, `crmTicketsApi.list({search})` (tasks proxy until unified task model exists), `crmKBApi.search(q)` in parallel with existing email+contact searches. |
| NAV-04 | User can execute actions from Command Palette: create deal, create task, compose email, navigate to any route | Add action commands that navigate to creation forms: compose email (exists), create deal (route to `/dashboard/crm/deals?action=create`), create task (route to `/dashboard/tasks?action=create`). |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mui/material` | (project standard) | Dialog, List, TextField, all UI | Project mandate -- no alternatives |
| `use-debounce` | ^10.1.0 | Debounce search input | Already used in current CommandPalette |
| `lucide-react` | (project standard) | Icons for commands and results | Already used throughout |
| `next/router` | (project standard) | Client-side navigation | Already used in current CommandPalette |

### No New Dependencies Needed
The existing component uses MUI Dialog + List + keyboard handling. No need for `cmdk`, `kbar`, or any third-party command palette library. The MUI-based implementation is already functional and consistent with the project's MUI-only mandate.

## Architecture Patterns

### File Split Strategy (500-line limit)
The current `CommandPalette/index.tsx` is 504 lines and will grow significantly. Split into:

```
frontend/components/ai/CommandPalette/
  index.tsx              # Main component -- Dialog shell, keyboard handling, state (~200 lines)
  CommandList.tsx         # Grouped command list rendering (~120 lines)
  SearchResults.tsx       # Unified search results rendering (~150 lines)
  commands.ts            # Command definitions (navigation, actions, AI, system) (~150 lines)
  use-command-search.ts  # Custom hook: parallel API calls, result merging (~120 lines)
  types.ts               # CommandItem, SearchResult, SearchResultGroup interfaces (~40 lines)
```

### Pattern 1: Parallel Client-Side Search
**What:** Fire all search APIs concurrently with `Promise.allSettled`, merge results by type
**When to use:** When no backend unified search endpoint exists (current state)
**Example:**
```typescript
// use-command-search.ts
const results = await Promise.allSettled([
  emailsApi.searchEmails(query, 5),
  contactsApi.listContacts({ search: query, limit: 5 }),
  crmDealsApi.list({ search: query, limit: 5 }),
  crmTicketsApi.list({ search: query, limit: 5 }),
  crmKBApi.search(query, 5),
]);
// Map settled results into SearchResultGroup[], skip rejected
```

### Pattern 2: Static Commands Registry
**What:** Define all commands in a pure `commands.ts` file, parameterized by router and translations
**When to use:** Commands are static data, not component logic
**Example:**
```typescript
// commands.ts
export function buildCommands(
  router: NextRouter,
  t: Translations,
  handleLogout: () => void,
): CommandItem[] {
  return [
    // Navigation -- existing 4 pillars
    { id: 'inbox', name: t.commandPalette.commands.goToInbox, ... },
    // Navigation -- CRM routes (NAV-02)
    { id: 'crm-pipelines', name: t.commandPalette.commands.goToPipelines, icon: Workflow, action: () => router.push('/dashboard/crm/pipelines'), group: 'navigation', keywords: ['pipelines', 'crm', 'sales'] },
    { id: 'crm-deals', name: t.commandPalette.commands.goToDeals, icon: Handshake, action: () => router.push('/dashboard/crm/deals'), group: 'navigation', keywords: ['deals', 'crm', 'sales'] },
    // ... all CRM routes
    // Actions (NAV-04)
    { id: 'create-deal', name: t.commandPalette.commands.createDeal, icon: PlusCircle, action: () => router.push('/dashboard/crm/deals?action=create'), group: 'actions', keywords: ['new deal', 'create deal'] },
    { id: 'create-task', name: t.commandPalette.commands.createTask, icon: PlusCircle, action: () => router.push('/dashboard/tasks?action=create'), group: 'actions', keywords: ['new task', 'create task', 'todo'] },
  ];
}
```

### Pattern 3: Search Result Type Discrimination
**What:** Use discriminated union types for search results with per-type rendering
**Example:**
```typescript
type SearchResult =
  | { type: 'email'; id: string; subject: string; from: string; receivedAt: string }
  | { type: 'contact'; id: string; displayName: string; company: string }
  | { type: 'deal'; id: string; name: string; amount: string; stage: string }
  | { type: 'ticket'; id: string; subject: string; status: string; priority: string }
  | { type: 'kb'; id: string; title: string; snippet: string };
```

### Anti-Patterns to Avoid
- **Calling HybridSearchService directly:** It's internal to AI chat, not exposed via HTTP. Use individual API modules.
- **Building a new backend unified search endpoint for this phase:** Scope creep. Individual APIs already support `search` parameter. Backend change deferred.
- **Putting all logic in one file:** 500-line limit will be violated. Split early.
- **Forgetting `Promise.allSettled`:** Using `Promise.all` would cause all results to fail if one API errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounced input | Custom setTimeout | `useDebounce` from `use-debounce` | Already in package.json, handles cleanup |
| Keyboard navigation | Custom key tracking state | Existing pattern in CommandPalette | Arrow keys, Enter, Escape already implemented |
| Dialog overlay | Custom portal/backdrop | MUI `Dialog` | Already used, handles focus trap, backdrop, a11y |
| Route navigation | window.location | `next/router` `router.push()` | Existing pattern, SPA transitions |

## Common Pitfalls

### Pitfall 1: 500-Line File Limit Violation
**What goes wrong:** Adding CRM commands, search results for 5 entity types, and action commands to the existing 504-line file.
**Why it happens:** It's tempting to keep everything in one file since the scaffold exists.
**How to avoid:** Split into separate files FIRST (commands, search hook, result rendering), then add new features.
**Warning signs:** File exceeds 500 lines after first edit.

### Pitfall 2: Race Conditions in Search
**What goes wrong:** Fast typing triggers multiple search batches; stale results from earlier query overwrite newer results.
**Why it happens:** `useDebounce` mitigates but doesn't prevent overlapping requests.
**How to avoid:** Use an AbortController per search batch. Cancel previous request when a new search starts. Or use a monotonically increasing request ID and discard stale responses.
**Warning signs:** Results flicker or show wrong data when typing quickly.

### Pitfall 3: Missing i18n for New Commands
**What goes wrong:** New CRM route names and action labels are hardcoded in English.
**Why it happens:** Easy to forget when adding 10+ new command entries.
**How to avoid:** Add ALL translation keys to `en.ts`, `it.ts`, and type definitions in `index.ts` BEFORE writing component code (per Frontend Procedure).
**Warning signs:** TypeScript error on `t.commandPalette.commands.goToPipelines` if key doesn't exist.

### Pitfall 4: Search Results Not Showing When Commands Also Match
**What goes wrong:** The current component shows commands OR search results, never both together for queries >= 2 chars.
**Why it happens:** Line 218: `if (hasSearchResults && !isSearching)` returns search results only; line 221: `const showCommands = !search || search.length < 2` hides commands when typing.
**How to avoid:** Redesign to show BOTH matching commands AND search results simultaneously when user types. Commands filtered by keyword match appear above; API search results appear below with a divider.
**Warning signs:** User types "deals" -- sees search results but not the "Go to Deals" navigation command.

### Pitfall 5: No "Recent" or "Suggested" Section
**What goes wrong:** Empty palette on open is okay for Superhuman, but the current component shows ALL commands which is fine. However, with many more CRM commands the initial list gets overwhelming.
**How to avoid:** Group CRM navigation into a collapsible "CRM" section, or show only top-level groups initially.
**Warning signs:** Opening Cmd+K shows 25+ items with no visual hierarchy.

## CRM Routes to Add (NAV-02)

All routes that exist in `frontend/pages/dashboard/` but are NOT in the 5-pillar sidebar:

| Route | Path | Icon Suggestion |
|-------|------|-----------------|
| Pipelines | `/dashboard/crm/pipelines` | `Workflow` |
| Deals | `/dashboard/crm/deals` | `Handshake` |
| Tickets | `/dashboard/crm/tickets` | `Ticket` |
| Accounts | `/dashboard/crm/accounts` | `Building2` |
| Knowledge Base | `/dashboard/crm/kb` | `BookOpen` |
| Forecast | `/dashboard/crm/forecast` | `TrendingUp` |
| Churn Analysis | `/dashboard/crm/churn` | `UserMinus` |
| Service Analytics | `/dashboard/crm/service-analytics` | `BarChart3` |
| AI Governance | `/dashboard/crm/ai-governance` | `Shield` |
| AI Assistant | `/dashboard/ai` | `Sparkles` (exists) |
| Analytics | `/dashboard/analytics` | `BarChart3` (exists) |
| Reminders | `/dashboard/reminders` | `Bell` |
| Agent | `/dashboard/agent` | `Bot` |
| Admin | `/dashboard/admin` | `ShieldCheck` |

## Search APIs Available (NAV-03)

| Entity | API Module | Method | Search Param | Response Shape |
|--------|-----------|--------|-------------|----------------|
| Emails | `emailsApi` | `searchEmails(query, limit)` | positional | `Email[]` |
| Contacts | `contactsApi` | `listContacts({search, limit})` | `search` in params | `{contacts: Contact[]}` |
| Deals | `crmDealsApi` | `list({search, limit})` | `search` in params | `{data: CrmDeal[], total}` |
| Tickets | `crmTicketsApi` | `list({search, limit})` | `search` in params | `{data: Ticket[], total}` |
| KB Articles | `crmKBApi` | `search(q, limit)` | positional | `{data: KBSearchResult[], total}` |

**Note:** Tasks do not have a dedicated search API yet (Phase 137 creates the unified task model). Use reminders API as partial proxy, or skip tasks search until Phase 137 lands. Since Phase 136 can run in parallel with Phase 137, the plan should handle this gracefully -- search reminders now, extend to unified tasks later.

## Actions to Add (NAV-04)

| Action | Command Name | Implementation |
|--------|-------------|----------------|
| Compose Email | "Compose Email" | `router.push('/dashboard/email?compose=true')` (EXISTS) |
| Create Deal | "Create New Deal" | `router.push('/dashboard/crm/deals?action=create')` -- requires deals page to read `action` query param |
| Create Task | "Create New Task" | `router.push('/dashboard/tasks?action=create')` -- requires tasks page to read `action` query param |
| Create Ticket | "Create New Ticket" | `router.push('/dashboard/crm/tickets?action=create')` |
| Create Contact | "Create New Contact" | `router.push('/dashboard/contacts?action=create')` |

**Note:** Some target pages may not yet handle `?action=create` query param. The plan should include verifying or adding that handling. Alternatively, actions could dispatch custom events like the existing `command:ai-*` pattern, but router-based is simpler and more debuggable.

## Translation Keys Needed

New keys to add under `commandPalette.commands`:
- `goToPipelines`, `goToDeals`, `goToTickets`, `goToAccounts`, `goToKB`, `goToForecast`, `goToChurn`, `goToServiceAnalytics`, `goToAiGovernance`, `goToReminders`, `goToAdmin`
- `createDeal`, `createTask`, `createTicket`, `createContact`

New keys under `commandPalette`:
- `dealResults`, `ticketResults`, `kbResults`, `contactResults`, `emailResults` (exists), `searchResults` (exists)
- CRM navigation group label: `crmNavigation`

Both `en.ts` and `it.ts` need updates, plus type definitions in `locales/index.ts`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (if configured) or manual type-check |
| Config file | `frontend/vitest.config.ts` (if exists) |
| Quick run command | `cd frontend && npx tsc --noEmit` |
| Full suite command | `cd frontend && npx tsc --noEmit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-02 | CRM route commands exist and navigate correctly | manual + type-check | `cd frontend && npx tsc --noEmit` | N/A |
| NAV-03 | Unified search returns results from 5 entity types | manual E2E via browser | Edge CDP Playwright | N/A |
| NAV-04 | Action commands execute (compose, create deal, create task) | manual E2E via browser | Edge CDP Playwright | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit`
- **Per wave merge:** `cd frontend && npx tsc --noEmit`
- **Phase gate:** Full type-check + manual E2E in browser

### Wave 0 Gaps
None -- existing type-check infrastructure covers all phase requirements. No new test files needed for a UI component phase.

## Code Examples

### Parallel Search Hook Pattern
```typescript
// use-command-search.ts
import { useState, useEffect, useRef } from 'react';
import { emailsApi } from '@/lib/api/emails';
import { contactsApi } from '@/lib/api/contacts';
import { crmDealsApi } from '@/lib/api/crm-deals';
import { crmTicketsApi } from '@/lib/api/crm-tickets';
import { crmKBApi } from '@/lib/api/crm-kb';
import type { SearchResult, SearchResultGroup } from './types';

export function useCommandSearch(query: string) {
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const currentReqId = ++reqIdRef.current;
    setIsSearching(true);

    Promise.allSettled([
      emailsApi.searchEmails(query, 5),
      contactsApi.listContacts({ search: query, limit: 5 }),
      crmDealsApi.list({ search: query, limit: 5 }),
      crmTicketsApi.list({ search: query, limit: 5 }),
      crmKBApi.search(query, 5),
    ]).then(([emails, contacts, deals, tickets, kb]) => {
      if (reqIdRef.current !== currentReqId) return; // stale
      const groups: SearchResultGroup[] = [];
      // Map each settled result into a group...
      setResults(groups);
      setIsSearching(false);
    });
  }, [query]);

  return { results, isSearching };
}
```

### Command Registry Pattern
```typescript
// commands.ts -- excerpt showing CRM navigation group
{ id: 'crm-pipelines', name: t.commandPalette.commands.goToPipelines, icon: Workflow,
  action: () => router.push('/dashboard/crm/pipelines'),
  group: 'crm', keywords: ['pipelines', 'crm', 'sales', 'funnel'] },
```

## Open Questions

1. **Action=create query param handling**
   - What we know: Compose email via `?compose=true` works. Deals page and tickets page may not read `?action=create`.
   - What's unclear: Whether existing deal/ticket/contact pages open a creation dialog based on URL params.
   - Recommendation: Check during implementation. If not supported, add the query-param handling as a sub-task.

2. **Tasks search before Phase 137**
   - What we know: Phase 137 creates the unified task model. Phase 136 can run in parallel.
   - What's unclear: Should we search reminders as a proxy for "tasks"?
   - Recommendation: Search reminders now (they're the closest thing to tasks). Add a TODO comment for extending to unified tasks once Phase 137 lands.

3. **Should commands and search results show simultaneously?**
   - What we know: Current logic shows commands OR search results, never both.
   - What's unclear: UX intent -- Superhuman shows both command matches and search results.
   - Recommendation: Show both. Matching commands at top, search results below. This is the standard pattern.

## Sources

### Primary (HIGH confidence)
- `frontend/components/ai/CommandPalette/index.tsx` -- existing 504-line component
- `frontend/lib/api/crm-deals.ts` -- deals API with `search` param
- `frontend/lib/api/crm-tickets.ts` -- tickets API with `search` param
- `frontend/lib/api/crm-kb.ts` -- KB API with `search(q, limit)` method
- `frontend/lib/api/emails.ts` -- email API with `searchEmails(query, limit)`
- `frontend/lib/api/contacts.ts` -- contacts API with `listContacts({search})`
- `frontend/pages/dashboard/crm/` -- all CRM routes that need palette entries
- `frontend/locales/en.ts` -- existing commandPalette translation keys

### Secondary (MEDIUM confidence)
- `backend/src/modules/ai-chat/services/hybrid-search.service.ts` -- confirmed NOT exposed via HTTP controller

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all libraries already in use
- Architecture: HIGH -- extending existing component with well-understood patterns
- Pitfalls: HIGH -- based on direct codebase analysis, 500-line limit is concrete

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- no fast-moving dependencies)
