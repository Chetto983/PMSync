# Phase 18: AI Triage & Bulk Operations - Research

**Researched:** 2026-02-11
**Domain:** AI-assisted email classification, bulk operations, VoltAgent tool integration
**Confidence:** HIGH (all patterns verified against codebase, no external libraries needed)

## Summary

Phase 18 builds on extensive existing infrastructure. The auto-triage system (`EmailTriageService`) already classifies emails with `aiPriority`, `aiSentiment`, and `aiLabels` fields on the Email model. The VoltAgent tool system already exposes these fields in `list_emails`, `list_email_index`, and `search_emails`. The bulk operations infrastructure is mature: `BulkEmailExecutor` handles delete/archive/move/mark-read via queued BullMQ jobs, and `EmailBulkService` provides direct Prisma-level bulk operations. The label system (`LabelsService`, `labelsApi`, `useLabels`) supports nested hierarchies with `addEmailsToLabel` already handling bulk assignment. The follow-up system (`FollowUpCrudService`, `FollowUpService`) supports creation with reason, dueDate, and type.

What's missing:
1. **AI triage suggestions surfaced in the email list UI** - `ThreadListItem` has `aiPriority`/`aiSentiment`/`aiLabels` data props but there is NO triage suggestion badge/chip in the email list (the data flows but the "AI suggests label X" UX doesn't exist)
2. **VoltAgent tool for batch label application** - No `manage_follow_up` or `batch_apply_labels` tool exists. The `bulk_email_actions` tool only handles delete/archive/mark-read. There's no tool for "apply label X to these 20 emails" or "create follow-ups for these 5 emails"
3. **Frontend selection-to-AI-action bridge** - `ThreadListHeader` has `onAddLabel` callback for manual labeling but no "Apply AI suggestions" action. No mechanism to send selected email IDs to VoltAgent for batch triage/labeling
4. **AI triage-to-UserLabel mapping** - `aiLabels` are string[] on Email model (freeform AI tags like "meeting", "invoice") while `UserLabel` is the structured label system with IDs/hierarchy. These are two completely separate systems with no bridge.

**Primary recommendation:** Extend existing VoltAgent tools with `bulk_apply_labels` and `batch_create_follow_ups` actions inside the existing `bulk_email_actions` tool (or as new consolidated tools), create a `TriageSuggestionRenderer` for the chat UI, add triage suggestion badges to `ThreadListItem`, and build a bridge service that maps AI-suggested labels to `UserLabel` IDs.

## Standard Stack

### Core (Already in Codebase - Zero New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | ^10.x | Backend framework | Already used everywhere |
| Prisma | ^7.2 | ORM / Email+Label models | Already used everywhere |
| VoltAgent `createTool` | ^1.x | AI tool definitions | Already used for all tools |
| TanStack Query | ^5.x | Frontend data hooks | Already used for labels/follow-ups |
| Zustand | ^4.x | Frontend state (selection) | Already used for email store |
| MUI + Tailwind | Mixed | UI components | MUI for email list, Tailwind for ai-elements |

### Supporting (Already Available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| BullMQ | ^5.x | Queue for bulk ops | For large batch operations (>50 emails) |
| Zod | ^3.x | Tool parameter schemas | VoltAgent tool validation |
| `lucide-react` | ^0.x | Icons | Badge/chip icons |

### Alternatives Considered

None. This phase requires zero new dependencies. Everything builds on existing infrastructure.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure (New/Modified Files)

```
backend/src/modules/
├── ai/
│   ├── services/
│   │   └── triage-suggestion.service.ts     # NEW: Maps aiLabels -> UserLabel IDs
│   └── voltagent/
│       ├── tools/
│       │   └── email.tools.ts               # MODIFY: Add bulk_apply_labels, batch_create_follow_ups
│       └── services/
│           └── executors/
│               └── bulk-email-executor.ts    # MODIFY: Add label + follow-up execution
├── labels/
│   └── services/
│       └── labels.service.ts                # Existing - already has addEmailsToLabel()

frontend/
├── components/
│   ├── email/
│   │   └── list/
│   │       ├── ThreadListItem.tsx            # MODIFY: Add triage suggestion chips
│   │       └── ThreadListHeader.tsx          # MODIFY: Add "Apply AI suggestions" action
│   └── ai-elements/
│       └── tool-renderers/
│           ├── renderers/
│           │   └── TriageRenderer.tsx        # NEW: Renders triage suggestions in chat
│           ├── index.ts                      # MODIFY: Register TriageRenderer
│           └── types.ts                      # MODIFY: Add TriageResult type
├── hooks/queries/
│   └── use-labels.ts                        # MODIFY: Add useBulkApplyLabels mutation
└── locales/
    ├── en.ts                                # MODIFY: Add triage translation strings
    └── it.ts                                # MODIFY: Add triage translation strings
```

### Pattern 1: AI Label -> UserLabel Bridge (CRITICAL DESIGN DECISION)

**What:** The `Email.aiLabels` field contains freeform strings like `["meeting", "invoice", "newsletter"]`. `UserLabel` is the structured label system with IDs, colors, hierarchy. These must be bridged.

**When to use:** Every time AI triage suggestions need to be applied as real labels.

**Two approaches (Claude's discretion to recommend):**

**Approach A: Auto-create UserLabels from AI labels (RECOMMENDED)**
```typescript
// backend/src/modules/ai/services/triage-suggestion.service.ts
async mapAiLabelsToUserLabels(
  tenantId: string,
  aiLabels: string[],
): Promise<{ labelId: string; labelName: string; isNew: boolean }[]> {
  const results = [];
  for (const aiLabel of aiLabels) {
    const slug = this.generateSlug(aiLabel);
    // Find or create UserLabel
    let userLabel = await this.prisma.userLabel.findFirst({
      where: { tenantId, slug, isArchived: false },
    });
    if (!userLabel) {
      // Find or create "AI Triage" parent label
      const parent = await this.findOrCreateAiTriageParent(tenantId);
      userLabel = await this.prisma.userLabel.create({
        data: {
          tenantId,
          name: this.capitalizeLabel(aiLabel),
          slug,
          parentId: parent.id,
          level: 1,
          type: 'USER',
          orderIndex: 0,
        },
      });
    }
    results.push({ labelId: userLabel.id, labelName: userLabel.name, isNew: !userLabel });
  }
  return results;
}
```

**Why Approach A:** Less friction. User doesn't need to manually create labels first. AI labels auto-appear under an "AI Triage" parent in the label tree (which is already DnD-sortable from Phase 5). User can rename/move/delete them like any label.

**Approach B: Require user to map AI labels to existing UserLabels**
More control but worse UX for first-time users. Only makes sense if user already has a structured label taxonomy.

### Pattern 2: VoltAgent Bulk Tool Extension

**What:** Extend `bulk_email_actions` tool or create new tools for label and follow-up batch operations.

**Recommended: Add to existing `bulk_email_actions` tool (fewer tools = better LLM selection)**

```typescript
// Inside createEmailTools() in email.tools.ts
// Extend bulk_email_actions action enum:
action: z.enum([
  'delete', 'empty_folder', 'archive', 'mark_read',
  'apply_labels',       // NEW: Batch apply labels
  'create_follow_ups',  // NEW: Batch create follow-ups
])

// New case in switch:
case 'apply_labels': {
  // 1. Get email IDs (from selection or filter)
  // 2. Map aiLabels to UserLabel IDs via TriageSuggestionService
  // 3. Call LabelsService.addEmailsToLabel() for each label
  // 4. Return HITL approval payload
  return {
    success: true,
    requiresApproval: true,
    actionType: 'BULK_APPLY_LABELS',
    severity: 'MEDIUM',
    payload: { emailIds, labelIds, labelNames, count },
    summary: `Apply labels [${labelNames.join(', ')}] to ${count} emails`,
  };
}
```

### Pattern 3: Triage Suggestion Display in Email List

**What:** Show AI triage badges directly in `ThreadListItem`.

**Current state:** `ThreadListItem` already receives `aiPriority`, `aiSentiment`, `aiLabels` data. It already shows `AI_PRIORITY_CONFIG` and `AI_SENTIMENT_CONFIG` coloring. But it does NOT show `aiLabels` as clickable suggestion chips.

```tsx
// In ThreadListItem.tsx - add after existing priority/sentiment display:
{thread.aiLabels && thread.aiLabels.length > 0 && (
  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
    {thread.aiLabels.slice(0, 3).map((label) => (
      <Chip
        key={label}
        label={label}
        size="small"
        icon={<Zap size={12} />}
        variant="outlined"
        sx={{ height: 20, fontSize: '0.7rem' }}
      />
    ))}
  </Box>
)}
```

### Pattern 4: Chat Tool Renderer for Triage Results

**What:** When user asks AI to triage emails in chat, display results with actionable buttons.

```tsx
// TriageRenderer.tsx - new tool renderer
// Shows: email list with suggested labels, priority, sentiment
// Actions: "Apply All Suggestions", "Apply to Selected", "Dismiss"
// Follows same pattern as EmailSearchRenderer + ActionBar
```

### Anti-Patterns to Avoid

- **Don't create a separate triage UI page:** Keep everything in the existing email list and AI chat. Users don't want to learn a new workflow.
- **Don't bypass HITL for label application:** All bulk label changes must go through the existing approval workflow. The `requiresApproval: true` pattern is already established.
- **Don't run triage on ALL emails at once:** Respect the existing `MAX_TRIAGE_PER_BATCH = 500` and semaphore limits. Batch operations should use BullMQ queuing for large sets.
- **Don't duplicate aiLabels storage:** Don't store triage suggestions separately. The mapping from `aiLabels` -> `UserLabel` should happen at apply-time, not at triage-time.
- **Don't use `Email.labels` (String[]) for this:** That field is for provider-level labels (Gmail labels). User labels go through `EmailLabel` join table. The existing `executeLabelEmail()` in email-executor.ts operates on `Email.labels` (the wrong field). New bulk label operations must use `LabelsService.addEmailsToLabel()` which correctly uses the `EmailLabel` join table.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bulk label assignment | Custom Prisma batching | `LabelsService.addEmailsToLabel()` | Already handles dedup (`skipDuplicates`), validation, WebSocket events |
| Bulk email operations | Direct Prisma updates | `BulkOperationsQueueService` | Already handles provider sync, rate limiting, retries |
| Follow-up creation | Raw Prisma insert | `FollowUpCrudService.createFollowUp()` | Already handles dedup (checks existing), queue scheduling, cache invalidation |
| AI email analysis | New LLM call | `EmailTriageService.triageEmail()` or `emailInsights.analyzeEmailUnified()` | Already consolidated to single LLM call, saves to DB, attention score pre-filter |
| Tool rendering | New component pattern | Existing `ToolRendererProps` + `getToolRenderer()` registry | Standardized pattern with `onAction`, `RawJsonToggle`, `EmptyState` |
| HITL approval | Custom approval flow | `requiresApproval: true` + `ActionExecutorService` | Already handles approval, execution, error handling for all action types |

**Key insight:** This phase is almost entirely wiring work. Every individual capability exists. The gap is connecting them together into a coherent user flow.

## Common Pitfalls

### Pitfall 1: aiLabels vs UserLabel Confusion
**What goes wrong:** Developer applies `aiLabels` strings directly to `Email.labels[]` field instead of creating proper `EmailLabel` join records via `LabelsService`.
**Why it happens:** `Email.labels` is a String[] that looks like it should hold labels. `EmailExecutor.executeLabelEmail()` already does this wrong (updates `Email.labels` directly). The correct system is `UserLabel` -> `EmailLabel` join table.
**How to avoid:** ALWAYS use `LabelsService.addEmailsToLabel()` for label operations. Never touch `Email.labels` for user-facing labels.
**Warning signs:** Labels not showing in sidebar, no WebSocket events for label changes, labels not surviving email resync.

### Pitfall 2: Missing AgentActionType Registration
**What goes wrong:** New bulk actions (`BULK_APPLY_LABELS`, `BULK_CREATE_FOLLOW_UPS`) are added to tools but not to `AgentActionType` enum or `ActionExecutorService` switch statement.
**Why it happens:** The tool returns `actionType: 'BULK_APPLY_LABELS'` but `ActionExecutorService.execute()` doesn't know how to handle it.
**How to avoid:** For each new action: (1) Add to `AgentActionType` enum, (2) Add payload interface, (3) Add executor case in `ActionExecutorService`, (4) Add to `BulkEmailExecutor` or new executor.
**Warning signs:** Actions stuck in "PENDING" state, executor logs "Unknown action type".

### Pitfall 3: Triage Cost Explosion
**What goes wrong:** User selects 500 untriaged emails and requests AI triage, triggering 500 individual LLM calls.
**Why it happens:** No rate limiting on user-initiated bulk triage (unlike auto-triage which has semaphore + batch mode).
**How to avoid:** Reuse `EmailTriageService.processUntriagedEmails()` or `triageSpecificEmails()` which already has the semaphore, batch mode, and cost controls. Never call `triageEmail()` in a loop from a VoltAgent tool.
**Warning signs:** LLM quota exhaustion, 429 errors from Mistral API, slow response times.

### Pitfall 4: Email Selection State Not Passed to AI
**What goes wrong:** User selects 10 emails in the list, opens AI chat, asks "label these as invoices" - but AI has no context about which emails are selected.
**Why it happens:** AI chat context doesn't include the current email selection state from Zustand store.
**How to avoid:** Either (a) pass selected email IDs as context to VoltAgent chat, or (b) have the frontend UI buttons call VoltAgent tools directly with the selected IDs (no chat needed). Approach (b) is simpler - the "Apply AI Suggestions" button in `ThreadListHeader` directly calls the batch label API.
**Warning signs:** AI says "I don't know which emails you mean", users frustrated that selection doesn't carry over.

### Pitfall 5: Tool Renderer Registration Miss
**What goes wrong:** New VoltAgent tool `triage_emails` or extended `bulk_email_actions` returns results but renders as raw JSON in chat.
**Why it happens:** Tool name not registered in `TOOL_RENDERERS` map in `frontend/src/components/ai-elements/tool-renderers/index.ts`.
**How to avoid:** For every new tool or action that returns structured data, add a renderer entry. Follow the existing pattern: create renderer component, add to `TOOL_RENDERERS` map.
**Warning signs:** Raw JSON blob in chat instead of pretty cards.

## Code Examples

### Example 1: Extending bulk_email_actions with apply_labels

```typescript
// Source: Codebase pattern from email.tools.ts
case 'apply_labels': {
  const { emailIds, labelNames } = params;
  if (!emailIds?.length) {
    return { success: false, error: 'emailIds required for apply_labels' };
  }
  if (!labelNames?.length) {
    return { success: false, error: 'labelNames required for apply_labels' };
  }

  // Verify emails exist
  const emails = await prisma.email.findMany({
    where: { id: { in: emailIds }, tenantId },
    select: { id: true },
    take: 500,
  });

  if (emails.length === 0) {
    return { success: true, data: { count: 0 }, summary: 'No matching emails found' };
  }

  return {
    success: true,
    requiresApproval: true,
    actionType: 'BULK_APPLY_LABELS',
    severity: 'MEDIUM',
    payload: {
      emailIds: emails.map(e => e.id),
      labelNames,
      count: emails.length,
    },
    summary: `Apply labels [${labelNames.join(', ')}] to ${emails.length} emails`,
  };
}
```

### Example 2: TriageSuggestionService (AI Label -> UserLabel bridge)

```typescript
// Source: Pattern from LabelsService.create()
@Injectable()
export class TriageSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labelsService: LabelsService,
  ) {}

  /**
   * Find or create UserLabels matching AI label strings.
   * Creates new labels under an "AI Triage" parent when needed.
   */
  async resolveAiLabelsToUserLabels(
    tenantId: string,
    aiLabels: string[],
  ): Promise<Map<string, string>> {
    const mapping = new Map<string, string>(); // aiLabel -> labelId

    for (const aiLabel of aiLabels) {
      const slug = aiLabel.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

      // Check if a matching UserLabel already exists
      const existing = await this.prisma.userLabel.findFirst({
        where: { tenantId, slug, isArchived: false },
        select: { id: true },
      });

      if (existing) {
        mapping.set(aiLabel, existing.id);
        continue;
      }

      // Create under "AI Triage" parent
      const parent = await this.getOrCreateTriageParent(tenantId);
      const newLabel = await this.labelsService.create(tenantId, {
        name: aiLabel.charAt(0).toUpperCase() + aiLabel.slice(1),
        parentId: parent.id,
      });
      mapping.set(aiLabel, newLabel.id);
    }

    return mapping;
  }
}
```

### Example 3: ThreadListItem Triage Chips

```tsx
// Source: Pattern from EmailSearchRenderer.tsx (line 144-161)
// Add inside ThreadListItem after the subject line:
{thread.aiLabels && thread.aiLabels.length > 0 && (
  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
    <Zap size={11} style={{ color: '#00ACC1', marginTop: 2 }} />
    {thread.aiLabels.slice(0, 3).map((label) => (
      <Chip
        key={label}
        label={label}
        size="small"
        variant="outlined"
        sx={{
          height: 18,
          fontSize: '0.65rem',
          borderColor: 'divider',
          color: 'text.secondary',
        }}
      />
    ))}
  </Box>
)}
```

### Example 4: Batch Follow-Up Creation Tool

```typescript
// Source: Pattern from FollowUpCrudService.createFollowUp()
case 'create_follow_ups': {
  const { emailIds, reason, dueDays } = params;
  if (!emailIds?.length) {
    return { success: false, error: 'emailIds required for create_follow_ups' };
  }

  // Check which emails already have active follow-ups
  const existingFollowUps = await prisma.emailFollowUp.findMany({
    where: {
      tenantId,
      emailId: { in: emailIds },
      status: { in: ['PENDING', 'REMINDED'] },
    },
    select: { emailId: true },
  });
  const existingSet = new Set(existingFollowUps.map(f => f.emailId));
  const newEmailIds = emailIds.filter(id => !existingSet.has(id));

  if (newEmailIds.length === 0) {
    return {
      success: true,
      data: { count: 0, skipped: emailIds.length },
      summary: 'All selected emails already have active follow-ups',
    };
  }

  return {
    success: true,
    requiresApproval: true,
    actionType: 'BULK_CREATE_FOLLOW_UPS',
    severity: 'MEDIUM',
    payload: {
      emailIds: newEmailIds,
      reason: reason || 'Bulk follow-up via AI',
      dueDays: dueDays || 3,
      count: newEmailIds.length,
      skipped: existingFollowUps.length,
    },
    summary: `Create follow-ups for ${newEmailIds.length} emails (${existingFollowUps.length} already tracked)`,
  };
}
```

## Existing Infrastructure Map

### Backend Services (Already Built)

| Service | File | Relevance |
|---------|------|-----------|
| `EmailTriageService` | `ai/services/email-triage.service.ts` | Auto-triage engine: `triageEmail()`, `triageSpecificEmails()`, `processUntriagedEmails()` |
| `EmailInsightsService` | `ai/services/email-insights.service.ts` | `analyzeEmailUnified()` - single LLM call for all analysis |
| `AttentionScoreService` | `voltagent/services/attention-score.service.ts` | Pre-filter for LLM triage (saves 30-50% calls) |
| `TriageLearningService` | `ai/services/triage-learning.service.ts` | Learns from user behavior (reply/archive/flag) |
| `LabelsService` | `labels/services/labels.service.ts` | `addEmailsToLabel()` - bulk label with dedup + WebSocket |
| `EmailBulkService` | `email/services/email-bulk.service.ts` | Bulk operations with provider sync |
| `BulkEmailExecutor` | `voltagent/services/executors/bulk-email-executor.ts` | VoltAgent action executor for bulk ops |
| `FollowUpCrudService` | `voltagent/services/follow-up-crud.service.ts` | `createFollowUp()` with dedup + scheduling |
| `ActionExecutorService` | `voltagent/services/action-executor.service.ts` | HITL action dispatch hub |

### Backend Tools (Already Built)

| Tool | File | Current Capabilities |
|------|------|---------------------|
| `list_emails` | `email.tools.ts` | Filters by `aiPriority`, `aiSentiment`, `aiLabels`, `needsFollowUp` |
| `list_email_index` | `email-rlm.tools.ts` | Same triage filters, lightweight metadata |
| `search_emails` | `email.tools.ts` | Returns `aiPriority`, `aiSentiment`, `aiLabels` |
| `bulk_email_actions` | `email.tools.ts` | `delete`, `empty_folder`, `archive`, `mark_read` |
| `analyze_email` | `insights.tools.ts` | Returns `suggestedLabels`, `needsFollowUp`, `priority` |

### Frontend Components (Already Built)

| Component | File | Relevance |
|-----------|------|-----------|
| `ThreadListItem` | `components/email/list/ThreadListItem.tsx` | Already receives `aiPriority`, `aiSentiment`, `aiLabels` |
| `ThreadListHeader` | `components/email/list/ThreadListHeader.tsx` | Already has `onAddLabel` bulk action callback |
| `LabelPickerDialog` | `components/email/labels/LabelPickerDialog.tsx` | Already handles bulk email-to-label assignment |
| `EmailSearchRenderer` | `ai-elements/tool-renderers/renderers/EmailSearchRenderer.tsx` | Already renders `aiLabels` chips + priority badges |
| Tool Renderer Registry | `ai-elements/tool-renderers/index.ts` | Maps tool names -> components |

### Database Schema (Already Exists)

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Email` | `aiPriority`, `aiSentiment`, `aiLabels[]`, `isAutoTriaged` | AI fields already populated by triage |
| `UserLabel` | `id`, `name`, `slug`, `parentId`, `level` | Nested hierarchy with DnD |
| `EmailLabel` | `emailId`, `labelId`, `tenantId` | Join table with `@@unique([tenantId, emailId, labelId])` |
| `EmailFollowUp` | `emailId`, `status`, `dueDate`, `followUpType` | `@@unique([emailId, tenantId])` - one per email |

### API Endpoints (Already Exist)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /ai/triage` | POST | Trigger auto-triage for untriaged emails |
| `POST /labels/:id/emails` | POST | Add emails to a label (bulk) |
| `DELETE /labels/:id/emails/:emailId` | DELETE | Remove email from label |
| `POST /voltagent/chat` | POST | AI chat with tool execution |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate LLM calls per analysis type | `analyzeEmailUnified()` single call | Phase 2.1 (2025-01) | 80% token reduction, 85% latency reduction |
| Manual triage only | Auto-triage with AttentionScore pre-filter | Phase 4.1 (2026-01) | 30-50% fewer LLM calls |
| Individual email tools (10+) | Consolidated tools (3 insight + 3 email) | Phase 2.1 (2025-01) | Better LLM tool selection |
| Separate email executors | Executor extraction pattern (Phase 9d) | 2026-01-23 | Clean separation of concerns |
| Raw API calls in components | TanStack Query hooks | Phase conventions | Caching, optimistic updates |

## Open Questions

1. **Should AI triage suggestions auto-create UserLabels or require manual mapping?**
   - What we know: Auto-creation is simpler UX. Manual mapping gives more control.
   - What's unclear: User preference. Some users may not want auto-created labels cluttering their hierarchy.
   - Recommendation: Auto-create under an "AI Triage" parent label. User can delete/reorganize. First-use friction is lower. Could add a preference toggle later.

2. **Should "Apply AI suggestions" be a toolbar button or an AI chat command?**
   - What we know: Both paths are possible. Toolbar button is faster for power users. Chat command is more discoverable.
   - What's unclear: Which path users will actually use.
   - Recommendation: BOTH. Toolbar button in `ThreadListHeader` for direct action (no chat needed). AI chat tool for conversational flow ("label these emails by topic"). They share the same backend tool/executor.

3. **Should bulk follow-up creation analyze each email or use a shared reason?**
   - What we know: `FollowUpCrudService.createFollowUp()` supports per-email reason/dueDate. Per-email analysis = N LLM calls. Shared reason = 0 LLM calls.
   - What's unclear: Whether users want individualized follow-up reasons or just a batch "track these".
   - Recommendation: Shared reason for the bulk action (fast, cheap). Individual analysis is already available via `analyze_email` tool if user wants it on specific emails. User can provide a custom reason string.

4. **`Email.labels` vs `EmailLabel` join table confusion**
   - What we know: `EmailExecutor.executeLabelEmail()` operates on `Email.labels` (String[] - provider labels). `LabelsService.addEmailsToLabel()` operates on `EmailLabel` join table (user labels). These are different systems.
   - What's unclear: Whether we should deprecate `Email.labels` usage in VoltAgent or keep both.
   - Recommendation: New tools should ONLY use `LabelsService.addEmailsToLabel()`. Don't touch `Email.labels`. Add a comment to `executeLabelEmail()` noting it's for provider labels only.

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/src/modules/ai/services/email-triage.service.ts` - Auto-triage engine
- Codebase: `backend/src/modules/ai/voltagent/tools/email.tools.ts` - VoltAgent email tools
- Codebase: `backend/src/modules/labels/services/labels.service.ts` - Label CRUD + bulk
- Codebase: `backend/src/modules/ai/voltagent/services/executors/bulk-email-executor.ts` - Bulk executor
- Codebase: `backend/src/modules/ai/voltagent/services/follow-up-crud.service.ts` - Follow-up CRUD
- Codebase: `frontend/components/email/list/ThreadListHeader.tsx` - Email list toolbar with selection
- Codebase: `frontend/components/email/list/ThreadListItem.tsx` - Email row with AI fields
- Codebase: `frontend/src/components/ai-elements/tool-renderers/index.ts` - Tool renderer registry
- Codebase: `frontend/hooks/queries/use-labels.ts` - Label TanStack Query hooks
- Codebase: `frontend/hooks/queries/use-follow-ups.ts` - Follow-up TanStack Query hooks
- Codebase: `backend/prisma/schema.prisma` - Email, UserLabel, EmailLabel, EmailFollowUp models
- Codebase: `backend/src/modules/ai/voltagent/interfaces/agent-action.interface.ts` - Action types + payloads

### Secondary (MEDIUM confidence)
- Codebase: `backend/src/modules/ai/services/triage-learning.service.ts` - Behavior learning signals
- Codebase: `backend/src/modules/ai/voltagent/tools/insights.tools.ts` - analyze_email tool
- Codebase: `frontend/lib/api/labels.ts` - Labels API client
- Codebase: `frontend/components/email/labels/LabelPickerDialog.tsx` - Label picker UI

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero new dependencies, everything verified in codebase
- Architecture: HIGH - All patterns follow existing codebase conventions, no novel patterns needed
- Pitfalls: HIGH - Identified from direct code reading (aiLabels vs UserLabel, executor registration, cost controls)

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable - internal codebase patterns, no external dependency risk)
