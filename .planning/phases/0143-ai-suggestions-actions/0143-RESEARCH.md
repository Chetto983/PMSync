# Phase 143: AI Suggestions & Actions - Research

**Researched:** 2026-04-02
**Domain:** Rule-based email suggestion generation + sidebar UI integration
**Confidence:** HIGH

## Summary

This phase adds rule-based action suggestions to the email contextual sidebar. When a user views an email, the sidebar fetches suggestions (generated from existing AI triage fields like `aiCategory`, `aiActionability`, `aiIntent`) and displays them as actionable cards that can be accepted or dismissed.

The heavy lifting is already done: `CrmSuggestionService` handles CRUD + accept/dismiss with entity creation, `SuggestionCard` provides the UI component, and `EntityContextSidebar` has a clear section pattern to follow. The work is: (1) a new backend service that generates suggestions from triage data, (2) a new endpoint that generates-if-absent + returns suggestions for a given emailId, (3) frontend wiring in the sidebar with a new query hook, and (4) adding `task` type support to `CrmSuggestionService.accept()`.

**Primary recommendation:** Build an `EmailSuggestionGeneratorService` that reads triage fields from the email record and creates `CrmSuggestion` rows via the existing service. Expose it through a new controller endpoint `GET /crm/suggestions/for-email/:emailId`. Frontend adds a `useEmailSuggestions` hook and a new section in `EntityContextSidebar`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Suggestions are generated rule-based using existing AI triage fields (aiCategory, aiLabels, aiIntent, aiActionability) -- NO additional LLM calls
- D-02: Generation happens on-demand when the sidebar loads for an email (lazy), not during sync (eager)
- D-03: Backend endpoint generates and persists suggestions for an email if none exist, returns existing ones if already generated
- D-04: Suggestion rules map triage data to action types:
  - aiCategory=support + no linked ticket -> suggest create_ticket
  - aiCategory=sales + no linked deal -> suggest create_deal
  - aiActionability=action-required -> suggest create_task
  - No linked contact (contactId null) -> suggest link_contact
  - Email has linked contact with open deals -> suggest update_deal (stage advancement)
- D-05: Four suggestion types for email context: create_task, create_deal, create_ticket, link_contact
- D-06: These map to existing CrmSuggestionService types: ticket (create_ticket), deal (create_deal), link (link_contact). Add new type task for create_task.
- D-07: Each suggestion includes: type, title (human-readable action description), reasoning (why this is suggested), confidence (0-1), sourceEmailId
- D-08: New "Suggested Actions" section in EntityContextSidebar, positioned BELOW the "Active Tickets" section
- D-09: Section only renders when pending suggestions exist for the current email
- D-10: Reuse existing SuggestionCard component from crm-nba -- adapt props if needed but follow same visual pattern
- D-11: Accept button executes the action (creates entity via CrmSuggestionService.accept) and removes the card
- D-12: Dismiss button marks suggestion as dismissed and removes the card
- D-13: Use existing CrmSuggestion model with status='dismissed' -- dismissed suggestions filtered out on query
- D-14: Suggestions are scoped to sourceEmailId -- dismissing for one email doesn't affect others
- D-15: No "undo dismiss" in this phase -- dismissed is final

### Claude's Discretion
- Exact confidence thresholds for each suggestion rule
- Whether to show confidence score in the UI (impact bar) or hide it
- Ordering of suggestions within the section (by confidence, by type, or by relevance)
- Whether to batch-generate suggestions for all emails in a thread or just the viewed message

### Deferred Ideas (OUT OF SCOPE)
- LLM-based suggestion generation (analyzing email content for more nuanced suggestions)
- "Undo dismiss" functionality
- Suggestion learning from user patterns (which suggestions they accept/dismiss)
- Bulk suggestion management UI (already exists in dashboard)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AI-04 | User sees suggested actions after reading an email (create task, update deal, link to ticket) | EmailSuggestionGeneratorService generates from triage fields; new endpoint serves them; EntityContextSidebar displays SuggestionCard components |
| AI-05 | User can accept or dismiss AI suggestions with one click | Existing CrmSuggestionService.accept/dismiss + useAcceptSuggestion/useDismissSuggestion hooks already handle this; need to add `task` type to accept() |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Post-edit validation mandatory: `npx tsc --noEmit` for both frontend and backend
- Never hardcode strings -- use i18n translations
- Max 500 lines per file
- Multi-tenant: every query MUST include `tenantId`
- Follow existing patterns -- never invent new approaches
- API modules in `frontend/lib/api/*.ts`, query hooks in `frontend/hooks/queries/use-*.ts`
- TanStack Query: `staleTime: 5min`, `gcTime: 30min`, `retry: 1`
- NEVER run `prisma db push` -- use migrations only
- Backend provider pattern: Interface > Factory > Implementation

## Standard Stack

No new libraries needed. This phase uses only existing infrastructure:

### Core (Already Installed)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| `@nestjs/common` | Backend controller + service | Existing NestJS pattern |
| `@prisma/client` | Database access | Existing ORM |
| `@tanstack/react-query` | Frontend data fetching | Existing query pattern |
| `@mui/material` | UI components | Existing UI framework |
| `lucide-react` | Icons | Existing icon library |

### No New Packages Required

**Installation:** None needed.

## Architecture Patterns

### Backend: EmailSuggestionGeneratorService

New service in `backend/src/modules/crm/suggestion/services/` that:
1. Loads email record with triage fields (`aiCategory`, `aiActionability`, `aiIntent`, `contactId`, `dealId`)
2. Checks which entities are already linked (tickets via `Ticket.emailId`, deals via `email.dealId`, contact via `email.contactId`)
3. Applies rule engine to determine applicable suggestions
4. Creates `CrmSuggestion` rows via existing `CrmSuggestionService.create()` (dedup built in)
5. Returns pending suggestions for that email

```
backend/src/modules/crm/suggestion/
  services/
    crm-suggestion.service.ts         # Existing -- add 'task' case to accept()
    crm-suggestion-trigger.service.ts  # Existing -- sync-time triggers (separate concern)
    email-suggestion-generator.service.ts  # NEW -- on-demand rule engine
  controllers/
    suggestion.controller.ts          # Existing -- add GET for-email/:emailId endpoint
```

### Backend: New Endpoint

```
GET /crm/suggestions/for-email/:emailId
```

Logic:
1. Check if pending suggestions already exist for this `sourceEmailId` -> return them if yes
2. If none exist, load email triage data, run rule engine, persist suggestions
3. Return generated suggestions

This is idempotent: calling it multiple times returns the same results (dedup in `CrmSuggestionService.create()`).

### Backend: Add `task` Type to accept()

Current `CrmSuggestionService.accept()` handles: `account`, `deal`, `ticket`, `link`. Must add `task` case that creates a `ManualTask`:

```typescript
case 'task':
  createdEntityId = await this.createTask(tenantId, entityData, req.user.id);
  break;
```

The `ManualTask` model requires `userId` -- this means `accept()` needs the user context. Currently it only receives `tenantId`. This is a key integration point: the controller must pass `req.user.id` to `accept()`.

### Frontend: Query Hook Pattern

```typescript
// New query options for email-scoped suggestions
export function emailSuggestionsOptions(emailId: string) {
  return queryOptions({
    queryKey: [...crmSuggestionsKeys.all, 'for-email', emailId],
    queryFn: () => crmSuggestionsApi.forEmail(emailId).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!emailId,
  });
}
```

### Frontend: Sidebar Integration

The `EntityContextSidebar` currently does NOT receive `emailId`. It receives `email` (the sender's email address string). The thread page needs to also pass the latest email's `id` to the sidebar.

Prop addition to `EntityContextSidebarProps`:
```typescript
emailId?: string;  // The email record ID (for suggestions)
```

The thread page already has `emails` array with `id` field (line 76: `emails?.map((e) => e.id)`), so deriving the latest email ID is trivial.

### Frontend: SuggestionCard Adaptation

The existing `SuggestionCard` component expects `NBAAction` type which has:
- `actionType: NBAActionType` (EMAIL, CALL, MEETING, etc.)
- `title: string`
- `reasoning: string`
- `expectedImpact: number` (0-100)
- `status: NBAStatus` (SUGGESTED, ACCEPTED, etc.)

Our `CrmSuggestion` has a different shape:
- `type: string` (task, deal, ticket, link)
- `entityData: Record<string, unknown>` (contains title, reasoning)
- `confidence: number` (0-1)
- `status: string` (pending, accepted, dismissed)

**Recommendation:** Create a thin `EmailSuggestionCard` wrapper component that:
1. Maps `CrmSuggestion` to a simplified card UI following the SuggestionCard visual pattern
2. Uses email-specific icons (ListTodo for task, Handshake for deal, Ticket for ticket, UserPlus for link_contact)
3. Shows confidence as impact bar (confidence * 100)
4. Maps status: pending -> SUGGESTED for accept/dismiss buttons

This avoids modifying the existing `SuggestionCard` which is tightly coupled to `NBAAction` types.

### Anti-Patterns to Avoid
- **Calling LLM for suggestions:** Decision D-01 explicitly forbids this. Rule engine only.
- **Generating during sync:** Decision D-02 says lazy/on-demand only. Do not hook into email indexing events.
- **Creating a new Prisma model:** Decision D-13 says reuse existing `CrmSuggestion` model.
- **Modifying SuggestionCard directly:** It's coupled to NBA types. Create adapter/wrapper instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Suggestion CRUD | Custom storage | `CrmSuggestionService` | Has dedup, accept/dismiss, entity creation |
| Entity creation on accept | Direct Prisma calls | `CrmSuggestionService.accept()` | Already handles deal/ticket/link creation |
| Query invalidation | Manual cache management | `useAcceptSuggestion`/`useDismissSuggestion` hooks | Already invalidate `crmSuggestionsKeys.all` |
| Suggestion dedup | Custom dedup logic | `CrmSuggestionService.create()` | Skips identical pending suggestions automatically |

**Key insight:** 80% of the backend logic already exists. The new code is a thin rule engine that decides WHICH suggestions to create, delegating creation to existing services.

## Common Pitfalls

### Pitfall 1: Missing tenantId in queries
**What goes wrong:** Security vulnerability -- suggestions leak across tenants.
**Why it happens:** Easy to forget tenant filter on new queries.
**How to avoid:** Every Prisma query in EmailSuggestionGeneratorService must include `tenantId` in WHERE clause.
**Warning signs:** Tests pass without tenant isolation checks.

### Pitfall 2: accept() for task type needs userId
**What goes wrong:** `ManualTask` requires `userId` field. `CrmSuggestionService.accept()` currently only receives `tenantId`.
**Why it happens:** Original accept() only created entities that don't need a user reference (account, deal, ticket, link).
**How to avoid:** Add optional `userId` parameter to `accept()` method signature. Controller passes `req.user.id`.
**Warning signs:** Runtime error on task creation -- "null value in column userId".

### Pitfall 3: SuggestionCard type mismatch
**What goes wrong:** Trying to pass `CrmSuggestion` directly to `SuggestionCard` component causes type errors.
**Why it happens:** `SuggestionCard` expects `NBAAction` with `actionType: NBAActionType`, not `CrmSuggestion` with `type: string`.
**How to avoid:** Create a wrapper component or adapter function that maps between types.
**Warning signs:** TypeScript errors on `actionType` prop.

### Pitfall 4: Sidebar doesn't have emailId
**What goes wrong:** Cannot fetch suggestions because `EntityContextSidebar` only receives sender email string, not email record ID.
**Why it happens:** Original sidebar design was contact-centric, not email-centric.
**How to avoid:** Add `emailId` prop to `EntityContextSidebarProps`, pass from thread page.
**Warning signs:** Suggestions section never loads -- no emailId to query.

### Pitfall 5: ListSuggestionsQueryDto missing sourceEmailId filter
**What goes wrong:** Cannot filter suggestions by email using existing list endpoint.
**Why it happens:** The DTO only supports `type` and `status` filters, not `sourceEmailId`.
**How to avoid:** Either add `sourceEmailId` to the DTO, or use a dedicated endpoint (recommended per D-03).
**Warning signs:** Frontend gets ALL suggestions instead of email-specific ones.

### Pitfall 6: Duplicate suggestions on sidebar re-open
**What goes wrong:** Each sidebar load creates new suggestions, causing duplicates.
**Why it happens:** Not checking for existing suggestions before generating.
**How to avoid:** Endpoint MUST check for existing suggestions first (D-03). `CrmSuggestionService.create()` has dedup, but the rule engine should still check to avoid unnecessary DB calls.
**Warning signs:** Multiple identical suggestion cards appearing.

## Code Examples

### Rule Engine Pattern (Backend)
```typescript
// Source: Derived from existing triage fields in schema.prisma + CONTEXT.md D-04
interface SuggestionRule {
  type: string;
  check: (email: EmailWithTriage) => boolean;
  buildEntityData: (email: EmailWithTriage) => Record<string, unknown>;
  confidence: number;
  titleKey: string;
  reasoning: string;
}

// Example rules (D-04):
const rules: SuggestionRule[] = [
  {
    type: 'ticket',
    check: (e) => e.aiCategory === 'support' && !hasLinkedTicket(e),
    buildEntityData: (e) => ({ subject: e.subject, sourceEmailId: e.id, contactId: e.contactId }),
    confidence: 0.8,
    titleKey: 'Create support ticket',
    reasoning: 'Email categorized as support with no linked ticket',
  },
  {
    type: 'deal',
    check: (e) => e.aiCategory === 'sales' && !e.dealId,
    buildEntityData: (e) => ({ title: e.subject, sourceEmailId: e.id, contactId: e.contactId }),
    confidence: 0.7,
    titleKey: 'Create sales deal',
    reasoning: 'Email categorized as sales with no linked deal',
  },
  {
    type: 'task',
    check: (e) => e.aiActionability === 'todo',
    buildEntityData: (e) => ({ title: e.subject, description: e.snippet, emailId: e.id }),
    confidence: 0.75,
    titleKey: 'Create follow-up task',
    reasoning: 'Email requires action (actionability: todo)',
  },
  {
    type: 'link',
    check: (e) => !e.contactId,
    buildEntityData: (e) => ({ emailAddress: extractEmail(e.from), emailId: e.id }),
    confidence: 0.6,
    titleKey: 'Link to contact',
    reasoning: 'No contact linked to this email',
  },
];
```

### Endpoint Pattern (Backend)
```typescript
// Source: Follows existing SuggestionController pattern
@Get('for-email/:emailId')
@ApiOperation({ summary: 'Get/generate suggestions for an email' })
async forEmail(@Req() req: any, @Param('emailId') emailId: string) {
  return this.emailSuggestionGenerator.getOrGenerate(req.user.tenantId, emailId);
}
```

### Frontend API Addition
```typescript
// Source: Follows existing crmSuggestionsApi pattern
forEmail(emailId: string) {
  return apiClient.get<CrmSuggestion[]>(`/crm/suggestions/for-email/${emailId}`);
}
```

### EntityContextSidebar Section Pattern
```typescript
// Source: Follows existing deals/tickets section pattern in EntityContextSidebar
<Divider sx={{ my: 1.5 }} />
<Box sx={{ mb: 2 }}>
  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
    {tc?.suggestedActions ?? 'Suggested Actions'} ({suggestions.length})
  </Typography>
  {suggestions.map((suggestion) => (
    <EmailSuggestionCard
      key={suggestion.id}
      suggestion={suggestion}
      onAccept={handleAccept}
      onDismiss={handleDismiss}
    />
  ))}
</Box>
```

## Discretion Recommendations

### Confidence Thresholds
- `create_ticket` (support category): 0.8 -- high confidence, clear category signal
- `create_deal` (sales category): 0.7 -- moderate, sales category is reliable
- `create_task` (actionability=todo): 0.75 -- good signal from triage
- `link_contact` (no contactId): 0.6 -- lower, since contact may not exist in system
- `update_deal` (contact has open deals): 0.5 -- speculative, just because contact has deals doesn't mean this email is about advancing them

### Show Confidence as Impact Bar
**Recommendation:** Yes, show it. The SuggestionCard already has impact bar UI. Map `confidence * 100` to `expectedImpact`. This gives users a quick visual signal of suggestion quality without adding UI complexity.

### Ordering
**Recommendation:** Sort by confidence descending. Highest-confidence suggestions first. This is the most intuitive ordering and matches how NBA suggestions work.

### Thread vs Single Email
**Recommendation:** Just the viewed message (last email in thread). Generating for all thread emails would create noise (older emails may already have had their suggestions acted on). The `lastEmail` pattern is already established in the thread page.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest) |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="email-suggestion" --forceExit` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-04 | Rule engine generates correct suggestions from triage fields | unit | `cd backend && npx jest --testPathPattern="email-suggestion-generator" --forceExit` | No -- Wave 0 |
| AI-04 | Endpoint returns existing suggestions without regenerating | unit | `cd backend && npx jest --testPathPattern="email-suggestion-generator" --forceExit` | No -- Wave 0 |
| AI-05 | accept() creates ManualTask for type='task' | unit | `cd backend && npx jest --testPathPattern="crm-suggestion.service" --forceExit` | No -- Wave 0 |
| AI-05 | dismiss() marks suggestion as dismissed | unit | Already covered by existing CrmSuggestionService tests (if any) | Check |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/crm/suggestion/services/email-suggestion-generator.service.spec.ts` -- covers AI-04
- [ ] Test for `task` type in `CrmSuggestionService.accept()` -- covers AI-05

## Key Integration Points Summary

| Component | Current State | Change Needed |
|-----------|---------------|---------------|
| `CrmSuggestionService.accept()` | Handles account/deal/ticket/link | Add `task` case creating ManualTask |
| `CrmSuggestionService.accept()` | Only takes `tenantId` | Add optional `userId` param for task creation |
| `SuggestionController` | No email-scoped endpoint | Add `GET for-email/:emailId` |
| `ListSuggestionsQueryDto` | No sourceEmailId filter | Not needed if using dedicated endpoint |
| `SuggestionModule` | Missing new service | Register `EmailSuggestionGeneratorService` |
| `crmSuggestionsApi` | No forEmail method | Add `forEmail(emailId)` |
| `crmSuggestionsKeys` | No email-scoped key | Add `forEmail(emailId)` key factory |
| `use-crm-suggestions.ts` | No email-scoped hook | Add `useEmailSuggestions(emailId)` |
| `EntityContextSidebarProps` | No emailId prop | Add `emailId?: string` |
| `EntityContextSidebar` | No suggestions section | Add section below tickets |
| `[threadId].tsx` | Passes email/contactName | Also pass `emailId` (last email ID) |
| Translation files (en.ts, it.ts) | No suggestion sidebar keys | Add `crmContext.suggestedActions`, action type labels |

## Sources

### Primary (HIGH confidence)
- `backend/prisma/schema.prisma` -- CrmSuggestion model, Email triage fields, ManualTask model
- `backend/src/modules/crm/suggestion/services/crm-suggestion.service.ts` -- Full accept/dismiss/create logic
- `backend/src/modules/crm/suggestion/services/crm-suggestion-trigger.service.ts` -- Existing rule patterns for deal/ticket/account detection
- `frontend/components/common/EntityContextSidebar.tsx` -- Section layout pattern
- `frontend/components/dashboard/crm-nba/SuggestionCard.tsx` -- Card UI and NBAAction type coupling
- `frontend/hooks/queries/use-crm-suggestions.ts` -- Query hook pattern
- `frontend/pages/dashboard/email/thread/[threadId].tsx` -- Sidebar prop wiring

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing infrastructure
- Architecture: HIGH -- clear patterns from existing CrmSuggestion and EntityContextSidebar code
- Pitfalls: HIGH -- identified from direct code reading (type mismatch, missing userId, missing emailId prop)

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- no external dependencies)
