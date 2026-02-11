# Phase 17: Rich Artifacts UI - Research

**Researched:** 2026-02-11
**Domain:** Interactive AI Chat Tool Renderers (React + Tailwind)
**Confidence:** HIGH

## Summary

Phase 17 upgrades the existing 10 tool renderers (built in Phase 09) from passive data displays into interactive artifacts with action buttons. The codebase already has a well-established registry pattern at `frontend/src/components/ai-elements/tool-renderers/index.ts` that maps VoltAgent tool names to React components. The existing renderers are pure read-only displays (100-200 lines each, Tailwind-only). This phase adds action buttons (reply, archive, open, accept, complete, snooze, etc.) to six artifact domains: email, calendar, contacts, follow-ups, daily briefing, and CRM/relationship.

The critical architectural decision is **how actions are triggered**. Two approaches exist in the codebase: (1) the HITL system (InlineActionCard) uses `multiAgentApi` with approve/reject mutations, and (2) direct REST API calls via existing `voltAgentApi`, `crmApi`, `contactsApi`, `calendarApi`. For interactive artifacts in Phase 17, the correct approach is **direct API calls** for simple actions (open email, view profile, navigate) and **chat-based re-prompting** for AI-mediated actions (reply, archive, create event). This avoids duplicating the HITL pipeline while still leveraging the AI agent for complex operations.

**Primary recommendation:** Upgrade existing renderers in-place by adding an `ActionBar` shared component with domain-specific action buttons. Use `useRouter` for navigation actions, direct API calls for simple toggles (star, mark-read), and `onSendMessage` callback for AI-mediated actions (reply, archive). Add two new renderers (BriefingRenderer, CrmRenderer) for ARTIFACT-05 and ARTIFACT-06.

## Standard Stack

### Core (Already in Codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | Component framework | Already used |
| Tailwind CSS | 4.x | Styling for ai-elements | CLAUDE.md mandates Tailwind for ai-elements |
| lucide-react | latest | Icons | Already used in all renderers |
| @/components/ui/* | shadcn | Badge, Button, Tooltip, Collapsible | Already imported in renderers |
| next/router | 15.x | Navigation (open email, view contact) | Already used in DailyBriefing |
| @tanstack/react-query | 5.x | Mutations for actions (star, resolve) | Already used throughout frontend |

### Supporting (Already in Codebase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| voltAgentApi | - | Follow-up resolve/snooze, briefing fetch | Follow-up and briefing actions |
| crmApi | - | Relationship stats, stale contacts | CRM artifact actions |
| calendarApi | - | Event RSVP (if backend supports) | Calendar event actions |
| apiClient | - | Generic API calls | Any direct API action |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct API calls for actions | Chat re-prompt (send message to AI) | Re-prompting is more natural for complex actions like reply/compose, but too slow for simple toggles like star/mark-read |
| Full HITL pipeline for all actions | Direct mutations | HITL adds approve/reject overhead; only needed for destructive/complex actions that the AI initiates |

**Installation:** No new packages needed. Everything is already in the codebase.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/components/ai-elements/tool-renderers/
  renderers/
    EmailSearchRenderer.tsx    # UPGRADE: add action buttons
    EmailContentRenderer.tsx   # UPGRADE: add reply/archive/open buttons
    EmailListRenderer.tsx      # UPGRADE: add action buttons
    FollowUpRenderer.tsx       # UPGRADE: add complete/snooze buttons
    ContactRenderer.tsx        # UPGRADE: add view-profile/send-email buttons
    EventRenderer.tsx          # UPGRADE: add accept/decline/view buttons
    BriefingRenderer.tsx       # NEW: daily briefing structured sections
    CrmRenderer.tsx            # NEW: CRM/relationship artifact
    AnalysisRenderer.tsx       # No change needed (already interactive enough)
    MemoryRenderer.tsx         # No change needed
    FolderRenderer.tsx         # No change needed
    CountRenderer.tsx          # No change needed
    FallbackRenderer.tsx       # No change needed
  shared/
    ActionBar.tsx              # NEW: shared floating action bar
    ActionButton.tsx           # NEW: small icon button for actions
    EmptyState.tsx             # Existing, no change
    RawJsonToggle.tsx          # Existing, no change
    ResultSummary.tsx          # Existing, no change
  types.ts                     # EXTEND: add BriefingResult, CrmResult types
  index.ts                     # EXTEND: register BriefingRenderer, CrmRenderer
  SmartToolOutput.tsx          # No change needed
```

### Pattern 1: Action Callback via Props Extension
**What:** Extend `ToolRendererProps` with optional action callbacks that the parent (ChatMessages) provides.
**When to use:** For actions that need to interact with the chat context (send a message to AI, navigate the app).
**Example:**
```typescript
// types.ts - Extended props
export interface ToolRendererProps {
  output: unknown;
  errorText?: string;
  toolName?: string;
  // NEW: Action callbacks from ChatMessages
  onAction?: (action: ArtifactAction) => void;
}

export interface ArtifactAction {
  type: 'navigate' | 'send-message' | 'api-call';
  // navigate: route to push
  route?: string;
  // send-message: prompt to send to AI
  message?: string;
  // api-call: function to execute
  apiCall?: () => Promise<void>;
}
```

### Pattern 2: Floating Action Bar (Hover Reveal)
**What:** Action buttons appear on hover over an artifact item, similar to Superhuman email actions.
**When to use:** For list items (emails, follow-ups, contacts) where per-item actions are needed.
**Example:**
```typescript
// shared/ActionBar.tsx
export function ActionBar({ actions, visible }: {
  actions: Array<{ icon: LucideIcon; label: string; onClick: () => void; variant?: 'default' | 'destructive' }>;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5
                    rounded-md border bg-background shadow-sm px-1 py-0.5">
      {actions.map(({ icon: Icon, label, onClick, variant }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <button onClick={onClick} className="p-1 rounded hover:bg-muted">
              <Icon className={cn("h-3.5 w-3.5", variant === 'destructive' ? 'text-destructive' : 'text-muted-foreground')} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
```

### Pattern 3: Direct API Mutation in Renderer
**What:** For simple stateful actions (star, mark-read, resolve follow-up), execute API calls directly.
**When to use:** When the action is a simple toggle/status change, not AI-mediated.
**Example:**
```typescript
// Inside FollowUpRenderer
const handleResolve = async (followUpId: string) => {
  try {
    await voltAgentApi.resolveFollowUp(followUpId);
    // Optimistic update or re-fetch
  } catch (err) {
    console.error('Failed to resolve follow-up', err);
  }
};
```

### Pattern 4: Chat Re-Prompt for AI Actions
**What:** For complex actions (reply to email, compose new email, schedule meeting), send a pre-formatted prompt to the AI chat.
**When to use:** When the action requires AI processing or the existing HITL pipeline.
**Example:**
```typescript
// In EmailContentRenderer, "Reply" button
onAction?.({
  type: 'send-message',
  message: `Reply to email "${email.subject}" from ${email.from}`,
});
```

### Anti-Patterns to Avoid
- **Don't put MUI components in ai-elements:** CLAUDE.md mandates Tailwind only for ai-elements. Use shadcn/ui primitives (Button, Badge, Tooltip, etc.) from `@/components/ui/*`.
- **Don't duplicate the HITL system:** Don't build a second approve/reject flow. Use direct API for simple actions, chat re-prompt for AI-mediated ones.
- **Don't make renderers exceed 500 lines:** The largest current renderer is ~197 lines. Action logic should use extracted hooks/utilities.
- **Don't fetch data inside renderers:** Renderers receive `output` as a prop from the tool invocation. Actions can call APIs, but initial data always comes from `output`.
- **Don't use hardcoded strings:** Follow the i18n pattern. However, ai-elements tool renderers currently do NOT use the i18n system (they use hardcoded English). This is technical debt from Phase 09. For Phase 17, follow the same pattern as existing renderers (hardcoded) to keep consistency, but note this debt.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon buttons with tooltips | Custom tooltip wrapper | `@/components/ui/tooltip` + `@/components/ui/button` | Already available, accessible |
| Confirmation dialogs | Custom modal | `@/components/ui/dialog` or chat re-prompt | AI confirmation via HITL already exists |
| Navigation to email/contact pages | Custom link system | `next/router` `router.push()` | Standard Next.js pattern |
| API mutations with loading states | Custom fetch + useState | `useMutation` from TanStack Query | Already used in InlineActionCard |
| Collapsible sections in briefing | Custom accordion | `@/components/ui/collapsible` or `@/components/ui/accordion` | Already imported in RawJsonToggle |

**Key insight:** The codebase already has all the infrastructure. The challenge is wiring action buttons into existing renderers without making them bloated (500-line limit).

## Common Pitfalls

### Pitfall 1: Coupling Renderers to Chat Context
**What goes wrong:** Renderers need to send messages to the AI chat, but they're isolated components with no chat context.
**Why it happens:** SmartToolOutput receives only `output`, `errorText`, `toolName`. There's no mechanism to pass callbacks from ChatMessages.
**How to avoid:** Extend `ToolRendererProps` with an `onAction` callback. ChatMessages passes it through SmartToolOutput. Use React Context as a fallback if prop drilling becomes messy.
**Warning signs:** Importing `useVoltAgentChat` directly inside a renderer (creates circular dependencies).

### Pitfall 2: File Size Bloat from Action Logic
**What goes wrong:** Adding action buttons, hover state, mutation logic, and loading states pushes renderers past 500 lines.
**Why it happens:** Each action needs an icon, tooltip, click handler, loading state, error handling.
**How to avoid:** Extract shared `ActionBar` component. Extract mutation hooks into separate files (`useFollowUpActions.ts`, `useEmailActions.ts`). Keep renderer JSX lean.
**Warning signs:** A renderer file growing past 250 lines.

### Pitfall 3: Stale Data After Actions
**What goes wrong:** User resolves a follow-up, but the renderer still shows it as "pending" because the tool output is immutable.
**Why it happens:** Tool output is a snapshot from when the AI called the tool. It's not reactive.
**How to avoid:** Two strategies: (1) Optimistic local state inside the renderer (simple), (2) Invalidate and re-query via TanStack Query (heavier but accurate). For Phase 17, use optimistic local state.
**Warning signs:** Actions succeed but UI doesn't update.

### Pitfall 4: Missing Backend Endpoints for Some Actions
**What goes wrong:** Planning action buttons for features that don't have backend support (e.g., calendar event RSVP).
**Why it happens:** Not all tools have write counterparts.
**How to avoid:** Audit available backend tools and API endpoints before planning action buttons. Use chat re-prompt as fallback for missing endpoints.
**Warning signs:** `404` errors from action buttons.

### Pitfall 5: Briefing and CRM Data Not Coming from Tool Calls
**What goes wrong:** ARTIFACT-05 (briefing) and ARTIFACT-06 (CRM) require new renderers, but there may be no VoltAgent tool that returns briefing/CRM data in the expected format.
**Why it happens:** Briefing is a REST API endpoint (`/api/v1/voltagent/briefing`), not a VoltAgent tool. CRM stats are also REST endpoints.
**How to avoid:** Check if the AI agent can be configured to call these APIs and return structured data. If not, consider adding VoltAgent tools for `get_daily_briefing` and `get_relationship_stats`, or render these artifacts via a different mechanism.
**Warning signs:** Briefing/CRM data never appears in chat tool output.

## Code Examples

### Example 1: Extended ToolRendererProps with Action Callback
```typescript
// Source: Existing types.ts pattern, extended
export interface ToolRendererProps {
  output: unknown;
  errorText?: string;
  toolName?: string;
  onAction?: (action: ArtifactAction) => void;
}

export type ArtifactAction =
  | { type: 'navigate'; route: string }
  | { type: 'send-message'; message: string }
  | { type: 'api-call'; fn: () => Promise<unknown> };
```

### Example 2: ActionBar Shared Component
```typescript
// shared/ActionBar.tsx (~50 lines)
"use client";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface ActionDef {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

export function ActionBar({ actions, className }: { actions: ActionDef[]; className?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-0.5 rounded-md border bg-background/95 backdrop-blur-sm shadow-sm px-1 py-0.5",
      className
    )}>
      {actions.map(({ icon: Icon, label, onClick, variant }) => (
        <button
          key={label}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          title={label}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <Icon className={cn(
            "h-3.5 w-3.5",
            variant === 'destructive' ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
          )} />
        </button>
      ))}
    </div>
  );
}
```

### Example 3: Email Artifact with Actions (upgrade EmailContentRenderer)
```typescript
// Added to EmailContentRenderer - action bar in header
<div className="flex items-center gap-1 shrink-0">
  <ActionBar actions={[
    { icon: ReplyIcon, label: 'Reply', onClick: () => onAction?.({ type: 'send-message', message: `Reply to email "${email.subject}" from ${email.from}` }) },
    { icon: ArchiveIcon, label: 'Archive', onClick: () => onAction?.({ type: 'send-message', message: `Archive email "${email.subject}"` }) },
    { icon: ExternalLinkIcon, label: 'Open', onClick: () => onAction?.({ type: 'navigate', route: `/dashboard/email?threadId=${email.id}` }) },
  ]} />
</div>
```

### Example 4: Follow-Up Artifact with Complete/Snooze
```typescript
// Added to FollowUpRenderer - per-item actions
const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

const handleResolve = async (id: string) => {
  setResolvedIds(prev => new Set(prev).add(id)); // Optimistic
  try {
    await voltAgentApi.resolveFollowUp(id);
  } catch {
    setResolvedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }
};
```

### Example 5: BriefingRenderer Structure
```typescript
// New renderer for daily briefing structured output
// Sections: priorities, unread summary, follow-ups, deadlines, calendar
export function BriefingRenderer({ output, errorText }: ToolRendererProps) {
  const result = output as BriefingResult;
  return (
    <div className="p-3 space-y-3">
      {/* Priority section */}
      <BriefingSection icon={AlertTriangleIcon} title="Priorities" items={result.priorities} />
      {/* Unread summary */}
      <BriefingSection icon={MailIcon} title="Unread" items={result.unreadHighlights} />
      {/* Follow-ups due today */}
      <BriefingSection icon={ClockIcon} title="Follow-ups" items={result.followUps} />
      {/* Calendar events */}
      <BriefingSection icon={CalendarIcon} title="Today's Schedule" items={result.events} />
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw JSON dumps for tool output | SmartToolOutput with typed renderers | Phase 09 (v3.0) | 10 renderers, read-only |
| No action buttons on artifacts | Interactive artifacts (this phase) | Phase 17 (v3.1) | User can act directly on AI results |
| HITL only for destructive actions | HITL + direct actions + chat re-prompt | Phase 11 + 17 | Faster UX for simple actions |

**Deprecated/outdated:**
- Phase 09's `execute_action` tool renderer (mapped to FallbackRenderer) - should become a proper ActionRenderer if needed.

## Codebase Inventory (Critical for Planning)

### Existing Renderers to Upgrade (6 files)
| Renderer | Lines | Tool Name | Actions Needed |
|----------|-------|-----------|----------------|
| EmailSearchRenderer | 197 | search_emails, list_emails | Open, Reply, Star |
| EmailContentRenderer | 135 | get_email_content | Reply, Archive, Forward, Open in thread |
| EmailListRenderer | 195 | list_email_index | Open, Star, Mark read |
| FollowUpRenderer | 197 | list_follow_ups | Complete, Snooze, View email |
| ContactRenderer | 121 | search_contacts | View profile, Send email |
| EventRenderer | 126 | get_events | Accept, Decline, View details |

### New Renderers to Create (2 files)
| Renderer | Tool Name | Data Source | Sections |
|----------|-----------|-------------|----------|
| BriefingRenderer | TBD (may need backend tool) | voltAgentApi.getBriefing() | Priorities, Unread, Follow-ups, Calendar |
| CrmRenderer | TBD (may need backend tool) | crmApi.getContactStats() | Relationship score, Interaction history, Staleness |

### Backend Tools Available (for reference)
| Tool Name | File | Type | Returns |
|-----------|------|------|---------|
| list_email_index | email-rlm.tools.ts | Read | EmailIndexResult |
| get_email_content | email-rlm.tools.ts | Read | EmailContentResult |
| list_follow_ups | email-rlm.tools.ts | Read | FollowUpResult |
| search_emails | email.tools.ts | Read | EmailSearchResult |
| list_emails | email.tools.ts | Read | EmailSearchResult |
| count_emails | email.tools.ts | Read | CountResult |
| search_contacts | contacts.tools.ts | Read | ContactSearchResult |
| get_events | calendar.tools.ts | Read | EventResult |
| manage_email | email-write.tools.ts | Write/HITL | Action result |
| manage_event | calendar.tools.ts | Write/HITL | Action result |
| manage_contact | contacts.tools.ts | Write/HITL | Action result |
| analyze_email | insights.tools.ts | Read | AnalysisResult |
| search_memory | memory.tools.ts | Read | MemorySearchResult |

### Frontend API Modules Available
| Module | Actions Available |
|--------|------------------|
| voltAgentApi | resolveFollowUp, snoozeFollowUp, getBriefing, refreshBriefing |
| crmApi | getContactStats, getStaleContacts, getTopContacts, getContactInteractions |
| calendarApi | (events CRUD via backend) |
| contactsApi | (contacts CRUD via backend) |
| multiAgentApi | getPendingActions, approveAction, rejectAction |

### App Routes (for navigation actions)
| Domain | Route | Use Case |
|--------|-------|----------|
| Email thread | `/dashboard/email?threadId={id}` | Open email |
| Compose | `/dashboard/email/compose` | Compose new email |
| Calendar | `/dashboard/calendar` | View calendar |
| Contacts | `/dashboard/contacts` | View contacts |
| Follow-ups | `/dashboard/ai/follow-ups` | Follow-up management |

## Open Questions

1. **Briefing Tool in VoltAgent**
   - What we know: Daily briefing is served via REST API (`/api/v1/voltagent/briefing`). There is NO VoltAgent tool named `get_daily_briefing` or similar.
   - What's unclear: Will the AI agent naturally return briefing data in a tool call format, or does a new VoltAgent tool need to be created?
   - Recommendation: Create a `get_daily_briefing` VoltAgent tool in `email-rlm.tools.ts` (or a new `briefing.tools.ts`) that calls the existing `DailyBriefingService`. Register a `BriefingRenderer` for it. This is a backend + frontend task.

2. **CRM/Relationship Tool in VoltAgent**
   - What we know: CRM data is served via REST endpoints (`/api/v1/voltagent/crm/*`). There is NO VoltAgent tool for CRM queries.
   - What's unclear: Same as above - does a backend tool need to be created?
   - Recommendation: Create a `get_relationship_stats` VoltAgent tool that calls `RelationshipIntelligenceService`. Register a `CrmRenderer` for it. Alternatively, if the AI agent already returns CRM data embedded in text responses, a lighter approach is possible.

3. **Action Callback Plumbing**
   - What we know: `ToolRendererProps` currently has `output`, `errorText`, `toolName`. There's no `onAction` callback.
   - What's unclear: How deep does the plumbing need to go? ChatMessages -> SmartToolOutput -> Renderer.
   - Recommendation: Add `onAction` to `ToolRendererProps`. Pass it from ChatMessages through SmartToolOutput. ChatMessages handles `navigate` with `useRouter` and `send-message` with `handleSendMessage` from `useChatController`.

4. **i18n for Action Button Labels**
   - What we know: Existing renderers use hardcoded English strings (Phase 09 technical debt).
   - What's unclear: Should Phase 17 add i18n for the new action button labels?
   - Recommendation: Follow existing renderer convention (hardcoded English) for consistency. Flag i18n as separate tech debt cleanup.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `frontend/src/components/ai-elements/tool-renderers/` - all 10 renderers read in full
- Codebase analysis: `frontend/components/ai/AiDashboard/ChatMessages.tsx` - SmartToolOutput integration verified
- Codebase analysis: `backend/src/modules/ai/voltagent/tools/*.ts` - all 17 tool files catalogued
- Codebase analysis: `frontend/lib/api/ai.ts`, `frontend/lib/api/crm.ts` - API modules verified

### Secondary (MEDIUM confidence)
- Architecture inference: Action callback pattern derived from existing InlineActionCard HITL pattern
- Architecture inference: Briefing/CRM tools likely needed based on absence from tool registry

### Tertiary (LOW confidence)
- Calendar RSVP actions: Not verified if backend supports accept/decline for events (only create/update/delete confirmed)
- Email thread navigation: Route format `/dashboard/email?threadId={id}` inferred from file structure, not verified at runtime

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - everything already in codebase, no new dependencies
- Architecture: HIGH - extending well-established registry pattern with minimal changes
- Pitfalls: HIGH - directly derived from codebase analysis (file size limits, immutable output, missing endpoints)
- Backend tools for briefing/CRM: MEDIUM - need backend work to expose as VoltAgent tools

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable - codebase patterns unlikely to change)
