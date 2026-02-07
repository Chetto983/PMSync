# Phase 08: Email Tool Triage Exposure - Research

**Researched:** 2026-02-07
**Domain:** VoltAgent tool Prisma select statements, email triage data, follow-up querying
**Confidence:** HIGH (all findings from direct codebase inspection)

## Summary

All six VoltAgent email listing/content tools (list_emails, search_emails, count_emails, list_email_index, get_email_content, semantic_search_emails) use inline `select` objects that omit the AI triage fields (aiPriority, aiSentiment, aiLabels) and the followUp relation, despite these fields being actively written by EmailTriageService and EmailInsightsService. The email-crud.service.ts (REST API for the frontend) already selects all triage fields correctly -- so the frontend sees triage data but the AI agent does not.

No shared "email select" constant exists across tools; each tool has its own hardcoded select object. There is no existing index on aiPriority or aiSentiment in the Prisma schema, which means filtering by priority will require a sequential scan unless an index is added. The EmailFollowUp model is never queried by any VoltAgent tool.

**Primary recommendation:** Add triage fields to each tool's select object individually (no shared constant -- too many select shapes), add filter parameters to listing tools, create a follow-up listing tool, and add a database index on (tenantId, aiPriority) for filter performance.

## Standard Stack

This phase requires no new libraries. It is purely an internal wiring fix within existing patterns.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @voltagent/core | (existing) | `createTool` API for tool definitions | Already in use for all tools |
| zod | (existing) | Tool parameter schema validation | Already in use for all tool parameter schemas |
| @prisma/client | (existing) | Database queries with `select`/`include` | Already in use everywhere |

### Supporting
None required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-tool inline selects | Shared select constant | Would need multiple shapes (lightweight vs full), adds coupling -- NOT worth it (see Architecture Patterns) |

## Architecture Patterns

### File Structure (no changes needed)
```
backend/src/modules/ai/voltagent/tools/
├── email.tools.ts        # list_emails, manage_email, search_emails, count_emails, bulk_email_actions
├── email-rlm.tools.ts    # list_email_index, get_email_content
├── insights.tools.ts     # analyze_email, compose_reply, semantic_search_emails
├── utils.ts              # Shared timeout/result utilities
└── index.ts              # Re-exports
```

### Pattern 1: Triage Fields in Select (Per-Tool)
**What:** Add aiPriority, aiSentiment, aiLabels, and optionally labels and followUp to each tool's Prisma select.
**When to use:** Every email listing/content tool that returns email data to the LLM.
**Why per-tool, not shared constant:** Tools have radically different select shapes:
- `list_email_index`: Lightweight (~100 chars per email: id, from, subject, snippet, receivedAt, isRead, isStarred). Adding 3 triage scalars is fine.
- `list_emails mode=content`: Full content (bodyText, to, cc, folder, etc.). Adding triage + followUp relation is fine.
- `search_emails`: Medium (id, subject, from, snippet, receivedAt, isRead, isStarred). Adding triage scalars is fine.
- `semantic_search_emails`: Same as search but with relevance scores. Adding triage scalars is fine.
- `get_email_content`: Full content for up to 5 emails. Adding triage + followUp is fine.
- `count_emails`: Only counts, does NOT select email rows. No change needed.

A shared constant would either be too fat (wasting tokens on lightweight tools) or require multiple shapes, negating the abstraction benefit. Keep selects inline.

**Example change for list_email_index:**
```typescript
// BEFORE (current)
select: {
  id: true,
  from: true,
  subject: true,
  snippet: true,
  receivedAt: true,
  isRead: true,
  isStarred: true,
}

// AFTER (add triage)
select: {
  id: true,
  from: true,
  subject: true,
  snippet: true,
  receivedAt: true,
  isRead: true,
  isStarred: true,
  // Triage fields
  aiPriority: true,
  aiSentiment: true,
  aiLabels: true,
  labels: true,
}
```

### Pattern 2: Filter Parameters on Listing Tools
**What:** Add optional filter params (priority, label, sentiment, needsFollowUp) to listing tools so the LLM can ask "show me urgent emails" directly.
**When to use:** `list_emails` (mode=unread), `list_email_index`, `search_emails`.
**Example:**
```typescript
parameters: z.object({
  mode: z.enum(['unread', 'recent', 'starred', 'search']).describe('What to list'),
  limit: z.number().optional().default(15),
  query: z.string().optional(),
  // NEW: triage filters
  priority: z.number().min(1).max(5).optional().describe('Filter by AI priority (1=highest, 5=lowest)'),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional().describe('Filter by AI sentiment'),
  label: z.string().optional().describe('Filter by AI label or user label'),
  needsFollowUp: z.boolean().optional().describe('Filter emails that need follow-up'),
}),
```

Where clause addition:
```typescript
if (priority) where.aiPriority = priority;
if (sentiment) where.aiSentiment = sentiment;
if (label) where.aiLabels = { has: label }; // Prisma string array `has` operator
if (needsFollowUp) where.followUp = { isNot: null, status: { in: ['PENDING', 'REMINDED'] } };
```

### Pattern 3: Follow-Up Listing Tool
**What:** New tool or mode that queries EmailFollowUp directly, returning follow-ups with email context.
**Two options:**
1. **New tool `list_follow_ups`** -- Cleaner separation, explicit purpose.
2. **New mode on `list_emails`** (mode=follow_ups) -- Keeps tool count low.

**Recommendation:** New tool `list_follow_ups`. Reason: FollowUp has its own schema (status, dueDate, reason, commitments, waitingFor, actionItems), and the query pattern is fundamentally different (query EmailFollowUp with email include, not Email). Cramming it into list_emails would be awkward.

**Example:**
```typescript
createTool({
  name: 'list_follow_ups',
  description: 'List emails needing follow-up. Filter by status (pending, reminded, overdue, resolved).',
  parameters: z.object({
    status: z.enum(['pending', 'reminded', 'overdue', 'all']).optional().default('pending'),
    limit: z.number().optional().default(15),
  }),
  execute: async ({ status, limit }) => {
    const where: any = { tenantId, userId };
    if (status === 'overdue') {
      where.status = { in: ['PENDING', 'REMINDED'] };
      where.dueDate = { lt: new Date() };
    } else if (status !== 'all') {
      where.status = status.toUpperCase();
    }

    const followUps = await prisma.emailFollowUp.findMany({
      where,
      take: limit,
      orderBy: { dueDate: 'asc' },
      include: {
        email: {
          select: {
            id: true, subject: true, from: true, receivedAt: true,
            aiPriority: true, aiSentiment: true,
          },
        },
      },
    });
    // Format and return
  },
});
```

**Critical:** This tool needs `userId` to be passed through the tool factory (same as tenantId). The FollowUp model has a `userId` field and existing indexes on `(tenantId, userId, status)`. Check: userId is already available in the tool factory via `ragOptions.userId` or the `userId` param in `createEmailRLMTools`. For the follow-up tool, userId MUST be a required dependency.

### Anti-Patterns to Avoid
- **Shared email select constant across tools:** Different tools need different select shapes. A "one size fits all" select wastes LLM tokens on lightweight tools.
- **Querying followUp relation on every email list:** The followUp is a 1:1 relation requiring a JOIN. Only include it on `get_email_content` and when `needsFollowUp` filter is active, not on lightweight listings.
- **Filtering by aiPriority without index:** Will cause sequential scan on large email tables.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prisma array contains | Custom SQL | `aiLabels: { has: label }` | Prisma natively supports `has` on String[] fields |
| Follow-up status filtering | Manual SQL | FollowUpService.listFollowUps() | Already exists with caching, pagination, status filtering |
| Priority validation | Custom guards | Zod `.min(1).max(5)` on param | Already the pattern for all tool params |

## Common Pitfalls

### Pitfall 1: Missing Database Index on aiPriority
**What goes wrong:** Filtering emails by `aiPriority = 1` without an index causes full table scan on potentially millions of emails.
**Why it happens:** The triage fields were added to the schema but no filtering was ever done, so indexes were not needed.
**How to avoid:** Add a composite index `@@index([tenantId, aiPriority])` to the Email model BEFORE deploying filter functionality.
**Warning signs:** Slow tool execution (>500ms) when filtering by priority on tenants with 50K+ emails.

### Pitfall 2: Token Bloat from Follow-Up Relation
**What goes wrong:** Including the `followUp` relation (with commitments, waitingFor, actionItems JSON blobs) on every email listing bloats LLM context.
**Why it happens:** Temptation to add `followUp: true` to every select.
**How to avoid:** Only include followUp on:
1. `get_email_content` (full content mode, max 5 emails)
2. `list_follow_ups` tool (purpose-built)
3. When `needsFollowUp` filter is active on other tools
For lightweight listings, just add a boolean `hasFollowUp` computed from the relation existence.

### Pitfall 3: userId Not Available in Email Tools Factory
**What goes wrong:** `list_follow_ups` needs userId (EmailFollowUp is per-user), but `createEmailTools` currently receives userId only indirectly via ragOptions.
**Why it happens:** Email tools were designed for tenant-scoped queries; follow-ups are user-scoped.
**How to avoid:** Either add userId as an explicit parameter to `createEmailTools` or create the follow-up tool in a separate factory. The unified agent already passes userId to createEmailRLMTools and createInsightTools.

### Pitfall 4: Inconsistent Triage Data Representation
**What goes wrong:** Different tools return aiPriority in different formats (some as number, some as string like "HIGH").
**Why it happens:** The Email model stores `aiPriority` as Int (1-5) while EmailAnalysis stores `priority` as EmailPriority enum (URGENT/HIGH/NORMAL/LOW). Two different systems.
**How to avoid:** Always return the Email model's raw `aiPriority` (1-5 Int) and `aiSentiment` (String). Don't try to map or rename them -- let the LLM interpret the values. Add clear descriptions in the tool output.

### Pitfall 5: needsFollowUp Filter on Emails Without EmailFollowUp Record
**What goes wrong:** Some emails need follow-up but don't have an EmailFollowUp record yet (not scanned). Filtering `followUp: { isNot: null }` misses these.
**Why it happens:** FollowUp scanning is async and may not have processed all emails.
**How to avoid:** Be clear in tool descriptions: `needsFollowUp` filters for emails with EXISTING follow-up records. Don't promise it catches all emails that "need" follow-up.

## Code Examples

### Current Select Statements (ALL MISSING TRIAGE)

**1. list_emails mode=unread** (`email.tools.ts:165`)
```typescript
select: { id: true, subject: true, from: true, snippet: true, receivedAt: true }
// MISSING: aiPriority, aiSentiment, aiLabels, labels
```

**2. list_emails mode=content** (`email.tools.ts:184-188`)
```typescript
select: {
  id: true, subject: true, from: true, to: true, cc: true,
  bodyText: true, snippet: true,
  receivedAt: true, isRead: true, isStarred: true, folder: true,
}
// MISSING: aiPriority, aiSentiment, aiLabels, labels, followUp
```

**3. search_emails (RAG path)** (`email.tools.ts:497-505`)
```typescript
select: {
  id: true, subject: true, from: true, snippet: true,
  receivedAt: true, isRead: true, isStarred: true,
}
// MISSING: aiPriority, aiSentiment, aiLabels, labels
```

**4. search_emails (text path)** (`email.tools.ts:572-580`)
```typescript
select: {
  id: true, subject: true, from: true, snippet: true,
  receivedAt: true, isRead: true, isStarred: true,
}
// MISSING: aiPriority, aiSentiment, aiLabels, labels
```

**5. list_email_index (all paths)** (`email-rlm.tools.ts:124-131, 182-194`)
```typescript
select: {
  id: true, from: true, subject: true, snippet: true,
  receivedAt: true, isRead: true, isStarred: true,
}
// MISSING: aiPriority, aiSentiment, aiLabels, labels
```

**6. get_email_content** (`email-rlm.tools.ts:252-264`)
```typescript
select: {
  id: true, from: true, to: true, cc: true, subject: true,
  bodyText: true, snippet: true, receivedAt: true,
  isRead: true, isStarred: true, folder: true,
}
// MISSING: aiPriority, aiSentiment, aiLabels, labels, followUp
```

**7. semantic_search_emails** (`insights.tools.ts:671-679`)
```typescript
select: {
  id: true, subject: true, from: true, snippet: true,
  receivedAt: true, isRead: true,
}
// MISSING: aiPriority, aiSentiment, aiLabels, labels
```

### Comparison: email-crud.service.ts (Frontend REST API) DOES Include Triage
```typescript
// email-crud.service.ts:120-166 (the frontend sees all this)
select: {
  id: true, externalId: true, threadId: true, providerId: true,
  from: true, to: true, cc: true, bcc: true, subject: true,
  snippet: true, folder: true, labels: true,
  isRead: true, isStarred: true, isFlagged: true,
  sentAt: true, receivedAt: true, size: true,
  aiPriority: true,           // <-- PRESENT
  aiPriorityReason: true,     // <-- PRESENT
  aiSentiment: true,          // <-- PRESENT
  aiLabels: true,             // <-- PRESENT
  isAutoTriaged: true,        // <-- PRESENT
  autoTriagedAt: true,        // <-- PRESENT
  attachments: { select: { ... } },
  emailLabels: { select: { label: { select: { id, name, color } } } },
  provider: { select: { id, email, providerType } },
}
```

### Triage Fields on Email Model (Prisma Schema)
```prisma
// schema.prisma:370-376
aiPriority           Int?     // AI-calculated priority 1-5 (1=highest)
aiPriorityReason     String?  // Explanation for priority
aiSentiment          String?  // AI sentiment: positive, negative, neutral, mixed
aiLabels             String[] @default([]) // AI-suggested labels
isAutoTriaged        Boolean  @default(false) // Flag if auto-triaged
autoTriagedAt        DateTime? // When auto-triage ran
```

### EmailFollowUp Model (Never Queried by Any Tool)
```prisma
// schema.prisma:1034-1061
model EmailFollowUp {
  id             String         @id @default(cuid())
  tenantId       String
  userId         String
  emailId        String
  status         FollowUpStatus @default(PENDING) // PENDING | REMINDED | RESOLVED | EXPIRED
  reason         String?
  dueDate        DateTime
  remindCount    Int            @default(0)
  lastRemindedAt DateTime?
  resolvedAt     DateTime?
  resolvedBy     String?
  commitments    Json?          // Array of ExtractedCommitment
  waitingFor     Json?          // Array of ExtractedWaitingFor
  actionItems    Json?          // Array of ExtractedActionItem
  emailType      String?
  confidence     Float?
  // Relations
  email          Email @relation(fields: [emailId, tenantId], references: [id, tenantId])
  // Indexes
  @@unique([emailId, tenantId])
  @@index([tenantId, userId])
  @@index([tenantId, userId, status])
  @@index([dueDate])
}
```

### UserLabel / EmailLabel Models (for user-assigned labels)
```prisma
// schema.prisma:504-520
model EmailLabel {
  id        String    @id @default(cuid())
  tenantId  String
  emailId   String
  labelId   String
  // Relations
  email     Email     @relation(...)
  label     UserLabel @relation(...)
  @@unique([tenantId, emailId, labelId])
}
```

### How Triage Fields Are Written

**1. EmailInsightsService.analyzeEmailUnified()** (`email-insights.service.ts:282-289`)
```typescript
await this.prisma.email.updateMany({
  where: { id: emailId, tenantId },
  data: {
    aiPriority: result.priority,        // Int 1-5
    aiPriorityReason: result.reasoning,
    aiSentiment: result.sentiment,      // "positive"|"negative"|"neutral"|"mixed"
    aiLabels: result.labels,            // String[]
    isAutoTriaged: true,
    autoTriagedAt: new Date(),
  },
});
```

**2. EmailTriageService.triageEmail()** (`email-triage.service.ts:345-354`)
```typescript
await this.prisma.email.updateMany({
  where: { id: emailId, tenantId },
  data: {
    aiPriority,
    aiPriorityReason: `AttentionScore: ${scoreResult.reasoning}`,
    aiLabels,
    isAutoTriaged: true,
    autoTriagedAt: new Date(),
  },
});
```

### Tool Registration Pattern
Tools are created in factory functions that receive dependencies, return arrays of Tool objects, and are assembled in `unified.agent.ts`:

```typescript
// unified.agent.ts:174-195
case 'email': {
  const emailTools = createEmailTools(prisma, emailSendService, locale, tenantId, cacheService, ragOptions);
  const emailRLMTools = createEmailRLMTools(prisma, locale, tenantId, ragOptions);
  return [...emailTools, ...emailRLMTools];
}
```

Tool groups are mapped to intents in `unified.prompt.ts:192-201`:
```typescript
const INTENT_TOOL_GROUPS: Record<TaskIntent, readonly string[]> = {
  search: ['core', 'email', 'contacts', 'insights'],
  read: ['core', 'email', 'insights'],
  // ...
};
```

A new tool needs to be:
1. Created in the tool factory function
2. Added to the TOOL_GROUPS registry
3. Returned by `createToolsForGroup()` in unified.agent.ts

## Inventory of All Changes Needed

### Files to Modify

| File | What Changes | Complexity |
|------|-------------|------------|
| `backend/src/modules/ai/voltagent/tools/email.tools.ts` | Add triage fields to 4 select objects; add filter params to list_emails | LOW |
| `backend/src/modules/ai/voltagent/tools/email-rlm.tools.ts` | Add triage fields to 3 select objects; add filter params to list_email_index | LOW |
| `backend/src/modules/ai/voltagent/tools/insights.tools.ts` | Add triage fields to 1 select object (semantic_search_emails) | LOW |
| `backend/src/modules/ai/voltagent/prompts/unified.prompt.ts` | Add list_follow_ups to TOOL_GROUPS.email | LOW |
| `backend/src/modules/ai/voltagent/agents/unified.agent.ts` | Wire userId into email tool factory if not already; include follow-up tool | LOW |
| `backend/prisma/schema.prisma` | Add index @@index([tenantId, aiPriority]) on Email model | LOW |

### Files to Create (if follow-up tool is a separate file)

| File | Purpose |
|------|---------|
| (optional) New tool in email.tools.ts or email-rlm.tools.ts | list_follow_ups tool |

**Recommendation:** Add `list_follow_ups` to `email-rlm.tools.ts` since it already takes `userId` indirectly and the RLM tools are the "smart listing" tools. Or add it to `email.tools.ts` and ensure userId is passed through.

## Performance Impact Assessment

### Adding Triage Scalars to Select (3 fields: aiPriority, aiSentiment, aiLabels)
- **DB impact:** Negligible. These are small fields (Int, String, String[]) already fetched in the same row. No additional JOIN.
- **Token impact:** ~15-30 extra tokens per email in tool output. For 15 emails = ~225-450 extra tokens. Acceptable.
- **Recommendation:** Add to ALL listing tools without concern.

### Adding labels (String[]) to Select
- **DB impact:** Negligible. Already stored on Email row.
- **Token impact:** ~5-15 tokens per email if labels exist. Acceptable.

### Adding followUp Relation to Select
- **DB impact:** Requires JOIN to email_follow_ups table. On get_email_content (max 5 emails), negligible.
- **Token impact:** If followUp has commitments/waitingFor/actionItems JSON, could be 100+ tokens per email. Only include on full-content tools, not lightweight.
- **Recommendation:** Only on get_email_content and list_follow_ups.

### Adding Filter by aiPriority Without Index
- **Current state:** No index on aiPriority. Table may have 100K+ emails.
- **Impact:** Full sequential scan for `WHERE aiPriority = 1 AND tenantId = '...'`.
- **Mitigation:** Add `@@index([tenantId, aiPriority])` -- estimated size negligible (Int field on existing rows).

## Open Questions

1. **Should count_emails gain triage filters?**
   - It currently counts by time period. Adding `priority` filter would enable "how many urgent emails this week?"
   - Recommendation: Yes, add priority filter. Minimal effort, high value.

2. **Should the follow-up tool be in the 'email' tool group or a new 'followups' group?**
   - Putting it in 'email' means it loads for all email intents. It's small (one tool), so this is fine.
   - A separate group adds complexity to the intent mapping for negligible benefit.
   - Recommendation: Add to 'email' group.

3. **Should `list_email_index` return a `hasFollowUp` boolean instead of the full followUp object?**
   - Pro: Keeps the index lightweight (the whole point of RLM pattern).
   - Con: Requires a sub-query or JOIN just for existence check.
   - Recommendation: Use `followUp: { select: { id: true, status: true } }` on list_email_index -- it's a 1:1 relation, so at most 1 row. Or skip it and rely on the `list_follow_ups` tool.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all files listed (Glob, Grep, Read tools)
- `backend/prisma/schema.prisma` -- Email model (lines 329-407), EmailFollowUp model (lines 1034-1061), EmailAnalysis model (lines 1133-1163), enums
- `backend/src/modules/ai/voltagent/tools/email.tools.ts` -- 7 select locations identified
- `backend/src/modules/ai/voltagent/tools/email-rlm.tools.ts` -- 3 select locations identified
- `backend/src/modules/ai/voltagent/tools/insights.tools.ts` -- 1 select location identified
- `backend/src/modules/ai/voltagent/agents/unified.agent.ts` -- Tool registration pattern
- `backend/src/modules/ai/voltagent/prompts/unified.prompt.ts` -- TOOL_GROUPS and INTENT_TOOL_GROUPS

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries, purely internal wiring
- Architecture: HIGH -- All patterns verified from direct codebase inspection
- Pitfalls: HIGH -- Performance concerns verified (no index on aiPriority confirmed, token impact estimated from current select sizes)

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable -- no external dependencies)
