# Phase 142: AI Background Automation - Research

**Researched:** 2026-04-02
**Domain:** Email auto-linking (contact/deal) + auto-categorization via existing NestJS event pipeline
**Confidence:** HIGH

## Summary

This phase adds three background automation behaviors to the email sync pipeline: (1) auto-linking emails to contacts by sender address match, (2) auto-linking emails to deals via contact-deal FK traversal, and (3) auto-categorizing emails by type (support/sales/internal/newsletter). All three build on well-established codebase patterns with no new technology or external dependencies.

Contact and deal linking are pure DB operations triggered by the existing `EmailIndexedEvent` -- the same event the `EmailToTicketHandler` already listens to. Categorization piggybacks on the existing `EmailAnalysisService.analyzeEmailUnified()` LLM call by extending its JSON schema. The CrmSuggestion system handles ambiguous multi-match cases via HITL. The UI changes are limited to adding a category chip in ThreadListItem and ExpandedMessage.

**Primary recommendation:** Follow the `EmailToTicketHandler` + `ContactAccountLinkerService` patterns exactly. Contact/deal linking is an `@OnEvent` handler; categorization extends the existing LLM prompt schema. No new jobs, no new queues, no new services beyond one handler class.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Exact sender email match against Contact.emails JSONB -> auto-link (confidence 1.0), no LLM needed
- **D-02:** Domain match with single contact -> auto-link (confidence 0.9+)
- **D-03:** Multiple contacts matching -> create CrmSuggestion for HITL review (mirrors ContactAccountLinkerService pattern)
- **D-04:** Add `contactId` + `contactTenantId` composite FK to Email model (same pattern as Ticket.contactId)
- **D-05:** Run contact linking on every EmailIndexedEvent (cheap -- pure DB lookup, no LLM)
- **D-06:** Primary signal: contact->deal association via DealContact join table. If sender's contact has open deal(s), link to most recent active deal
- **D-07:** Multiple open deals for same contact -> create CrmSuggestion for HITL (avoid wrong association)
- **D-08:** Add `dealId` + `dealTenantId` composite FK to Email model
- **D-09:** Run deal linking after contact linking (depends on resolved contactId)
- **D-10:** No LLM for deal linking -- use contact->deal FK traversal only
- **D-11:** Add `aiCategory` field to Email model (separate from existing `aiIntent`)
- **D-12:** Categories: `support`, `sales`, `internal`, `newsletter` -- exactly 4
- **D-13:** Extend existing EmailAnalysisService LLM prompt schema to include `category` in JSON output
- **D-14:** Category assigned during existing triage flow (piggybacked on AI triage pipeline)
- **D-15:** Categorization is part of triage, NOT a separate background job
- **D-16:** Contact linking hooks into EmailIndexedEvent (same pattern as EmailToTicketHandler)
- **D-17:** Deal linking runs as chained step after contact linking within same event handler
- **D-18:** Category assignment runs during existing EmailTriageService.triageEmails() flow
- **D-19:** New event EmailAutoLinkedEvent emitted after successful link creation
- **D-20:** Category shown as colored chip/badge in ThreadListItem and ExpandedMessage
- **D-21:** Contact/deal links visible in existing Phase 140 contextual sidebar
- **D-22:** Category color mapping: support=orange, sales=green, internal=blue, newsletter=gray

### Claude's Discretion
- Exact Prisma migration field names and index choices
- BullMQ vs direct event handler for contact/deal linking
- Whether to backfill existing emails or only process new ones going forward
- CrmSuggestion confidence thresholds (exact numbers)

### Deferred Ideas (OUT OF SCOPE)
- LLM-based deal detection from email content (Phase 143)
- Split inbox by category (separate effort per REQUIREMENTS.md)
- Backfill UI (admin interface to trigger re-linking/re-categorization)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AI-01 | System auto-links incoming emails to matching contacts in background | EmailIndexedEvent handler + Contact.emails JSONB lookup + composite FK on Email model. Pattern: EmailToTicketHandler.findContactBySender() |
| AI-02 | System auto-links incoming emails to relevant deals/tickets based on contact + context | DealContact join table traversal after contact resolution. CrmDeal has `deletedAt` for soft-delete filtering |
| AI-03 | System auto-categorizes emails by type (support, sales, internal, newsletter) | Extend UnifiedEmailAnalysis type + LLM prompt schema + persist to new `aiCategory` field on Email model during triage |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **NEVER run `prisma db push`** -- use `npx prisma migrate dev --name <name>` for schema changes
- **Multi-tenant rule**: Every query MUST include `tenantId`
- **Post-edit validation**: Run `npx tsc --noEmit` after every file edit
- **Frontend procedure**: Translations first, then query hooks, then components
- **Max 500 lines per file**
- **FOLLOW EXISTING PATTERNS** -- never invent new approaches when codebase patterns exist
- **SCOPE CONTROL** -- do exactly what was asked, nothing more

## Standard Stack

### Core (already in project -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS EventEmitter2 | (bundled) | `@OnEvent(EmailIndexedEvent.eventName)` handler | Already used by EmailToTicketHandler, embedding handlers |
| Prisma | (project ver) | Schema migration + queries | Existing ORM, composite FK pattern established |
| Mistral AI | (project ver) | LLM for categorization | Already used by EmailAnalysisService |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| BullMQ | (project ver) | Optional: queue-based linking for reliability | Only if latency is acceptable (~seconds delay). Direct @OnEvent is simpler |
| MUI Chip | (project ver) | Category badge in email list/thread | Frontend display |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct @OnEvent handler | BullMQ queue | Queue adds retry/persistence but adds latency. Contact lookup is fast (<50ms), so direct handler is preferred |
| New `aiCategory` field on Email | Existing `aiIntent` field | aiIntent has different semantics (request/update/alert/sales/billing/personal/fyi) -- separate axis per D-11 |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended File Structure
```
backend/src/
  modules/
    email-sync/
      handlers/
        email-auto-linker.handler.ts     # NEW: @OnEvent handler for contact+deal linking
    ai/
      services/
        email-analysis.service.ts        # MODIFY: extend LLM schema for category
      types/
        email-insights.types.ts          # MODIFY: add category to UnifiedEmailAnalysis
  common/
    events/
      email.events.ts                    # MODIFY: add EmailAutoLinkedEvent

frontend/
  components/
    email/
      CategoryChip.tsx                   # NEW: colored chip component
      list/ThreadListItem.tsx            # MODIFY: add CategoryChip
      thread/ExpandedMessage.tsx         # MODIFY: add CategoryChip
  locales/
    en.ts, it.ts                         # MODIFY: add category translation keys
```

### Pattern 1: Event Handler for Auto-Linking (mirrors EmailToTicketHandler)
**What:** An `@OnEvent(EmailIndexedEvent.eventName)` handler that runs contact + deal linking sequentially
**When to use:** Every time a new email is synced

```typescript
// Source: backend/src/modules/crm/ticket/services/email-to-ticket.handler.ts (existing pattern)
@Injectable()
export class EmailAutoLinkerHandler {
  @OnEvent(EmailIndexedEvent.eventName)
  async handleEmailIndexed(event: EmailIndexedEvent): Promise<void> {
    // 1. Extract sender email from event.from
    // 2. Find matching contact(s) by Contact.emails JSONB
    // 3. If exactly 1 match: link email.contactId = contact.id
    // 4. If multiple matches: create CrmSuggestion (type: 'link', HITL)
    // 5. If contact found with open deals: link email.dealId = deal.id (most recent)
    // 6. If multiple deals: create CrmSuggestion (type: 'deal', HITL)
    // 7. Emit EmailAutoLinkedEvent
  }
}
```

### Pattern 2: Contact Lookup by Email (existing in EmailToTicketHandler)
**What:** Extract sender email from "Name <email>" format, then search Contact.emails JSONB array
**When to use:** For contact matching

```typescript
// Source: backend/src/modules/crm/ticket/services/email-to-ticket.handler.ts:76-113
// CRITICAL: Current implementation loads ALL contacts for a tenant and loops.
// For auto-linking on every email, this MUST be optimized to a raw SQL query
// using JSON containment (@>) or GIN index, not in-memory iteration.
```

### Pattern 3: Composite FK on Email Model (mirrors Ticket pattern)
**What:** Add `contactId`/`contactTenantId` and `dealId`/`dealTenantId` pairs to Email model
**When to use:** Schema migration

```prisma
// Source: Ticket model (schema.prisma:2335-2364)
model Email {
  // ... existing fields ...
  contactId      String?
  contactTenant  String?
  dealId         String?
  dealTenant     String?
  
  contact        Contact?  @relation(fields: [contactId, contactTenant], references: [id, tenantId], onDelete: SetNull)
  deal           CrmDeal?  @relation(fields: [dealId, dealTenant], references: [id, tenantId], onDelete: SetNull)
}
```

### Pattern 4: Extending LLM Prompt Schema (existing EmailAnalysisService)
**What:** Add `category` field to the JSON schema in the system prompt and parse it from LLM output
**When to use:** During triage

The `analyzeEmailUnified()` method already parses structured JSON from the LLM. Add `category` to:
1. The system prompt JSON schema description
2. The `UnifiedEmailAnalysis` interface
3. The persist block (`email.updateMany` at line 215-218)

### Anti-Patterns to Avoid
- **Loading all contacts into memory:** The existing `findContactBySender()` in EmailToTicketHandler loads ALL tenant contacts. For auto-linking on every email, use a raw SQL query with JSONB containment operator instead.
- **Separate LLM call for categorization:** Category MUST be part of the existing unified analysis prompt, not a second LLM call.
- **New BullMQ queue for contact linking:** Overkill. Contact lookup is a fast DB query (<50ms). Use direct `@OnEvent` handler.
- **Modifying EmailCategory enum for aiCategory:** The existing `EmailCategory` enum on `EmailAnalysis` model has different values (SALES_INQUIRY, SUPPORT_REQUEST, etc.). The new `aiCategory` on Email is a plain String with values `support|sales|internal|newsletter`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Contact matching by email | Custom string matching | Raw SQL with JSONB containment or Contact.emails lookup | Edge cases: "Name <email>", case sensitivity, multiple email formats |
| HITL for ambiguous matches | Custom approval flow | CrmSuggestion model + CrmSuggestionService.create() | Full HITL pipeline already exists: pending/accepted/dismissed states, API, frontend |
| LLM-based email categorization | New prompt + new API call | Extend existing EmailAnalysisService prompt schema | Already makes 1 LLM call per email; adding one field to JSON costs zero extra tokens |
| Event-driven pipeline | Custom pub/sub | NestJS EventEmitter2 @OnEvent | Already battle-tested in 5+ handlers |

**Key insight:** Every piece of this phase has an exact precedent in the codebase. The only net-new code is the auto-linker handler (~100-150 lines) and the category chip component (~40 lines).

## Common Pitfalls

### Pitfall 1: Contact Lookup Performance
**What goes wrong:** Loading all contacts for a tenant into memory (current `findContactBySender` pattern) and iterating
**Why it happens:** The existing implementation in EmailToTicketHandler does exactly this -- but it only runs for `[SUPPORT]` emails. Auto-linking runs on EVERY email.
**How to avoid:** Use a raw SQL query with JSONB containment: `WHERE emails @> '[{"value": "sender@example.com"}]'::jsonb`. Or use Prisma's JSON filter: `prisma.contact.findMany({ where: { emails: { array_contains: [{ value: senderEmail }] } } })`.
**Warning signs:** Slow sync times when tenant has 1000+ contacts.

### Pitfall 2: Race Condition Between Handlers
**What goes wrong:** `EmailToTicketHandler` and `EmailAutoLinkerHandler` both listen to `EmailIndexedEvent`. If both try to update the same email row, one may fail with P2034 (deadlock).
**Why it happens:** NestJS EventEmitter2 fires handlers concurrently by default.
**How to avoid:** Auto-linker handler updates `contactId`/`dealId` fields. EmailToTicketHandler creates a Ticket record. They touch different tables, so no conflict. But if both update Email, use `updateMany` (idempotent) not `update` (throws on missing).
**Warning signs:** Intermittent P2034 errors in logs during sync.

### Pitfall 3: Composite FK Migration on Populated Table
**What goes wrong:** Adding nullable FK columns to Email table with millions of rows can lock the table.
**Why it happens:** PostgreSQL ADD COLUMN with DEFAULT NULL is instant on modern PG (12+), but adding an index or FK constraint can be slow.
**How to avoid:** The migration adds nullable columns (instant), then adds indexes. Foreign key constraint should use `CREATE INDEX CONCURRENTLY` if possible. Prisma migrations don't use CONCURRENTLY, but for nullable FK adds the lock is brief.
**Warning signs:** Migration timeout on Railway deploy.

### Pitfall 4: aiCategory vs EmailCategory Confusion
**What goes wrong:** Using the existing `EmailCategory` enum (SALES_INQUIRY, SUPPORT_REQUEST, etc.) on the EmailAnalysis model instead of adding a new field.
**Why it happens:** The names overlap conceptually.
**How to avoid:** `aiCategory` is a String field on Email model with exactly 4 values: `support`, `sales`, `internal`, `newsletter`. It is a SEPARATE axis from `EmailCategory` enum on EmailAnalysis. Per D-11, they are different.
**Warning signs:** Type errors if trying to assign string to enum field.

### Pitfall 5: Missing tenantId in Queries
**What goes wrong:** Querying contacts or deals without tenantId filter.
**Why it happens:** Forgetting CLAUDE.md multi-tenant rule.
**How to avoid:** Every Prisma query MUST include `tenantId` in the where clause. The EmailIndexedEvent provides `tenantId`.
**Warning signs:** Cross-tenant data leakage.

## Code Examples

### Contact Lookup by Sender Email (optimized)
```typescript
// Use Prisma's JSON filter instead of loading all contacts
// Contact.emails is JSONB: [{ value: "user@example.com", type: "work" }]
private async findContactsBySenderEmail(tenantId: string, senderEmail: string) {
  // Raw SQL for JSONB containment -- much faster than loading all contacts
  return this.prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
    SELECT id, "tenantId"
    FROM unified_contacts
    WHERE "tenantId" = ${tenantId}
      AND "isDeleted" = false
      AND emails IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(emails) elem
        WHERE lower(elem->>'value') = lower(${senderEmail})
      )
  `;
}
```

### Domain-Based Contact Lookup (D-02)
```typescript
// For domain matching when exact email match fails
private async findContactsByDomain(tenantId: string, domain: string) {
  return this.prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
    SELECT id, "tenantId"
    FROM unified_contacts
    WHERE "tenantId" = ${tenantId}
      AND "isDeleted" = false
      AND emails IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(emails) elem
        WHERE lower(elem->>'value') LIKE ${`%@${domain.toLowerCase()}`}
      )
  `;
}
```

### Deal Lookup via DealContact Join Table (D-06)
```typescript
// Find open deals for a contact via DealContact join table
private async findOpenDealsForContact(tenantId: string, contactId: string) {
  return this.prisma.crmDeal.findMany({
    where: {
      tenantId,
      deletedAt: null,
      dealContacts: {
        some: { contactId, tenantId },
      },
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  });
}
```

### CrmSuggestion for Ambiguous Matches (D-03, D-07)
```typescript
// Source: backend/src/modules/crm/suggestion/services/crm-suggestion.service.ts
await this.suggestionService.create(tenantId, {
  type: 'link',
  entityData: {
    emailId,
    candidateContactIds: matchedContactIds,
    reason: 'Multiple contacts match sender email domain',
  },
  sourceEmailId: emailId,
  sourceType: 'email_auto_linker',
  confidence: 0.7,
});
```

### Category in LLM Prompt Extension
```typescript
// Add to the JSON schema section of the system prompt in EmailAnalysisService
// The existing prompt already requests: summary, sentiment, priority, labels, etc.
// Add: "category": "exactly one of: support, sales, internal, newsletter"
```

### Category Chip Component
```typescript
// frontend/components/email/CategoryChip.tsx
const CATEGORY_COLORS = {
  support: 'warning',   // orange
  sales: 'success',     // green
  internal: 'info',     // blue
  newsletter: 'default' // gray
} as const;
// Use MUI Chip with size="small" and color from map
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `findContactBySender()` loads all contacts | Use JSONB containment SQL query | This phase | Performance: O(1) vs O(n) contact lookup |
| EmailCategory enum (8 values) on EmailAnalysis | `aiCategory` String (4 values) on Email model | This phase | Simpler, different axis from intent-based categorization |
| No email-to-contact/deal FK | Composite FK (contactId, contactTenant) on Email | This phase | Enables sidebar, filtering, reporting |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (via `dotenv-cli -e .env.test -- jest`) |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="email-auto-linker" --no-coverage` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-01 | Contact auto-linking on EmailIndexedEvent | unit | `cd backend && npx jest --testPathPattern="email-auto-linker" -t "contact linking" --no-coverage` | Wave 0 |
| AI-01 | Exact email match returns confidence 1.0 | unit | same file, test case | Wave 0 |
| AI-01 | Domain match with single contact auto-links | unit | same file, test case | Wave 0 |
| AI-01 | Multiple matches create CrmSuggestion | unit | same file, test case | Wave 0 |
| AI-02 | Deal auto-linking via DealContact traversal | unit | `cd backend && npx jest --testPathPattern="email-auto-linker" -t "deal linking" --no-coverage` | Wave 0 |
| AI-02 | Multiple open deals create CrmSuggestion | unit | same file, test case | Wave 0 |
| AI-03 | Category field in LLM output schema | unit | `cd backend && npx jest --testPathPattern="email-analysis" -t "category" --no-coverage` | Wave 0 |
| AI-03 | Category persisted to Email.aiCategory | unit | same file, test case | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/email-sync/handlers/__tests__/email-auto-linker.handler.spec.ts` -- covers AI-01, AI-02
- [ ] `backend/src/modules/ai/services/__tests__/email-analysis.service.spec.ts` -- exists but needs category test cases for AI-03

## Open Questions

1. **Backfill strategy**
   - What we know: Decision says new emails only (via EmailIndexedEvent). Claude's discretion on backfill.
   - What's unclear: Whether to run a one-time scan for existing emails (like ContactAccountLinkerService.onModuleInit).
   - Recommendation: Process new emails only. Backfill adds complexity with no immediate user value. Defer to a future one-off script.

2. **CrmSuggestion type values for auto-linker**
   - What we know: Existing types are `account`, `deal`, `ticket`, `link`.
   - What's unclear: Whether to reuse `link` type or add new types like `email_contact_link`, `email_deal_link`.
   - Recommendation: Use `type: 'link'` with `entityData` discriminator (existing pattern). The CrmSuggestion model stores `entityData` as JSON, so the type field just needs to be something the frontend can filter on.

3. **Email.contactId relation -- CrmDeal needs reciprocal relation**
   - What we know: Adding `dealId`/`dealTenant` FK to Email requires adding `emails Email[]` to CrmDeal model.
   - What's unclear: Whether CrmDeal already has an Email relation.
   - Recommendation: Add `emails Email[]` to CrmDeal model in the same migration. This is a Prisma requirement for bi-directional relations.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/crm/ticket/services/email-to-ticket.handler.ts` -- EmailIndexedEvent handler pattern, contact lookup by sender
- `backend/src/modules/crm/suggestion/services/contact-account-linker.service.ts` -- Confidence-based auto-linking vs HITL pattern
- `backend/src/modules/ai/services/email-analysis.service.ts` -- LLM prompt schema, persist logic, mapIntentToCategory
- `backend/src/modules/ai/services/email-triage.service.ts` -- Triage pipeline, post-triage hooks
- `backend/prisma/schema.prisma` -- Email model (line 502), Contact model (line 879), CrmDeal (line 1866), DealContact (line 2022), Ticket FK pattern (line 2335), CrmSuggestion (line 2085)
- `backend/src/common/events/email.events.ts` -- EmailIndexedEvent definition
- `backend/src/modules/ai/types/email-insights.types.ts` -- UnifiedEmailAnalysis interface

### Secondary (MEDIUM confidence)
- `frontend/components/email/list/ThreadListItem.tsx` -- UI structure for adding category chip
- `.agents/skills/pmsync-email-triage/SKILL.md` -- Triage pipeline invariants

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- every pattern has an exact precedent in the codebase
- Pitfalls: HIGH -- identified from reading actual code (findContactBySender performance issue is real)

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- internal codebase patterns, no external API changes)
