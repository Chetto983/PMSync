# VoltAgent 2.x Simplification Roadmap

## Executive Summary

**Current State**: MailAgent has custom implementations that are NOW REDUNDANT with VoltAgent 2.1.6 native features.

**Goal**: Remove ~500-700 lines of redundant code by using VoltAgent 2.x native capabilities.

---

## VoltAgent 2.1.6 Native Features (Installed)

| Feature | VoltAgent Native | MailAgent Custom | Action |
|---------|-----------------|------------------|--------|
| Model Routing | `"mistral/mistral-large"` strings | `model-router.service.ts` (554 LOC) | **REMOVE** |
| HITL Approval | `tool.needsApproval: true` | Custom `requiresApproval` return | **MIGRATE** |
| Memory | `PostgreSQLMemoryAdapter` | `memory.config.ts` wrapper | **SIMPLIFY** |
| Workflows | `createWorkflow()` | ✅ Already using VoltAgent native! | **KEEP** |
| Dynamic Prompts | `instructions: async () => {...}` | Static + inline logic | **OPTIONAL** |

---

## Critical Bug Found

**Foreign Key Constraint on ActionQueue.userId**:
- Test fails with: `Foreign key constraint violated on the constraint: action_queue_userId_fkey`
- Root cause: `hitl.service.ts` passes `userId` that doesn't exist in User table
- Fix: Make `userId` nullable OR validate user exists before creating

---

## Phase 1: Fix HITL (Critical - Day 1)

### 1.1 Fix ActionQueue FK Constraint
**File**: `backend/prisma/schema.prisma`
```prisma
// Option A: Make userId optional
userId String?
user User? @relation(...)

// Option B: Validate user in hitl.service.ts before insert
```

### 1.2 Use VoltAgent Native `needsApproval`
**Current** (manage_email.tool.ts):
```typescript
execute: async (args) => {
  return { requiresApproval: true, ... }  // Custom pattern
}
```

**VoltAgent Native**:
```typescript
const manageEmailTool = createTool({
  name: 'manage_email',
  needsApproval: true,  // ← VoltAgent handles suspension
  execute: async (args, options) => {
    // VoltAgent auto-suspends, no custom return needed
  }
})
```

**Files to modify**:
- `tools/email.tools.ts` - manage_email tool
- `tools/contacts.tools.ts` - manage_contact tool
- `tools/calendar.tools.ts` - manage_event tool
- `hitl.service.ts` - simplify to just persist pending actions

---

## Phase 2: Remove Model Router (500+ LOC - Day 2)

### Files to DELETE:
- `services/model-router.service.ts` (554 LOC) - **ENTIRE FILE**

### Files to MODIFY:
1. `voltagent.module.ts` - Remove ModelRouterService provider
2. `chat-request-processor.service.ts` - Remove model routing calls
3. Agent files - Use VoltAgent native model strings

**Before** (supervisor.agent.ts):
```typescript
const routing = modelRouter.routeMessage(message);
const model = routing.recommendedModel;
```

**After**:
```typescript
// Model defined directly on agent
const agent = new Agent({
  model: 'mistral/mistral-large-latest',
  // OR dynamic:
  model: (context) => context.get('complexity') === 'high'
    ? 'mistral/mistral-large-latest'
    : 'mistral/mistral-small-latest'
}) // USE .ENV VAR!!!
```

---

## Phase 3: Simplify Memory (Day 2-3)

### Files to SIMPLIFY:
- `memory/memory.config.ts` (60 LOC → 15 LOC)

**Before**:
```typescript
export function createMemory(options) {
  return new Memory({
    storage: new PostgreSQLMemoryAdapter({
      connectionString: process.env.DATABASE_URL,
      schema: 'public',
    })
  });
}
```

**After** (direct in module):
```typescript
// In voltagent.module.ts or agent creation
const memory = new Memory({
  storage: new PostgreSQLMemoryAdapter({
    connectionString: process.env.DATABASE_URL
  })
});
```

---

## Phase 4: Delete Dead Workflow Files (Day 3)

### Files to DELETE (not imported anywhere):
```
backend/src/modules/ai/voltagent/workflows/
├── approval.workflow.ts     ← DELETE (VoltAgent has createWorkflowChain)
├── briefing.workflow.ts     ← DELETE (unused)
├── follow-up.workflow.ts    ← DELETE (unused)
├── index.ts                 ← DELETE (exports dead code)
```

**Verification**: Run `grep -r "from.*workflows" backend/src` to confirm no imports.

---

## Phase 5: Simplify Chat Request Processor (Day 3-4)

**Current**: 229 lines wrapping validation + PII + routing + rate limiting

**Simplified** (100 lines):
```typescript
@Injectable()
export class ChatRequestProcessorService {
  async preprocessMessage(message: string, tenantId: string) {
    // 1. Validate for injection (KEEP)
    this.validateInput(message);

    // 2. PII detection (KEEP - business requirement)
    const pii = await this.piiService.detect(message);

    // 3. Return preprocessed result (REMOVE model routing)
    return { message, hasPii: pii.found, piiDetails: pii.details };
  }
} // SEE https://docs.mistral.ai/capabilities/guardrailing
```

**Remove**:
- Model routing logic (use VoltAgent native)
- Token estimation (VoltAgent tracks usage)
- Complexity analysis (VoltAgent handles)

---

## Phase 6: Prompt Consolidation (Day 4-5) ⚠️ CRITICAL

### Problem: Prompts are CONFUSING (User Feedback)

**User explicit request**: "MOVE ALL PROMT TO DEDICATED FILE, EN AND IT MUST BE THE SAME!"

**Current chaos - DUAL sources**:
1. `prompts/*.prompt.ts` - Dedicated prompt files (SUPERVISOR_PROMPT, ACTIONS_PROMPT, etc.)
2. `locales/en.ts` - Contains agent instructions INLINE + imports from prompts

**Good news**: Italian locale already uses `agents: en.agents` (line 207 in it.ts), so prompts ARE shared.

**Dead code from consolidated agents (DELETE from en.ts)**:
- `email.instructions` (~60 LOC) - EmailAgent → merged into ActionsAgent
- `calendar.instructions` (~40 LOC) - CalendarAgent → merged into ActionsAgent
- `contacts.instructions` (~30 LOC) - ContactsAgent → merged into ActionsAgent
- `knowledge.instructions` (~40 LOC) - KnowledgeAgent → merged into IntelligenceAgent
- `general.instructions` (~20 LOC) - Unused

**Live prompts to extract from en.ts to dedicated files**:
- `webSearch.instructions` → `prompts/websearch.prompt.ts` (NEW)
- `analytics.instructions` → `prompts/analytics.prompt.ts` (NEW)
- `documentLibrary.instructions` → `prompts/document-library.prompt.ts` (NEW)

### 6.1 Delete Dead Prompts from `locales/en.ts`

**File**: `backend/src/modules/ai/voltagent/locales/en.ts`

```typescript
// DELETE these from agents section (~190 LOC total):
agents: {
  // KEEP:
  supervisor: { instructions: SUPERVISOR_PROMPT },
  actions: { instructions: ACTIONS_PROMPT },
  intelligence: { instructions: INTELLIGENCE_PROMPT },
  webSearch: { instructions: ... },  // Still active
  analytics: { instructions: ... },  // Still active
  documentLibrary: { instructions: ... },  // Still active

  // DELETE (dead code from consolidated agents):
  email: { instructions: ... },      // ~60 lines - DEAD
  calendar: { instructions: ... },   // ~40 lines - DEAD
  contacts: { instructions: ... },   // ~30 lines - DEAD
  knowledge: { instructions: ... },  // ~40 lines - DEAD
  general: { instructions: ... },    // ~20 lines - DEAD
}
```

### 6.2 Single Source of Truth Architecture

**New structure**:
```
prompts/
├── supervisor.prompt.ts    ← KEEP (source)
├── actions.prompt.ts       ← KEEP (source)
├── intelligence.prompt.ts  ← KEEP (source)
├── memory.prompt.ts        ← KEEP (mem0 patterns)
├── websearch.prompt.ts     ← CREATE (extract from locales)
├── analytics.prompt.ts     ← CREATE (extract from locales)
├── document-library.prompt.ts ← CREATE (extract from locales)
└── index.ts                ← Export all

locales/en.ts              ← IMPORT only, NO inline prompts
```

### 6.3 Add Few-Shot Examples (Audit P0 - Score 3/10 → 8/10)

**SupervisorAgent** (`supervisor.prompt.ts`):
```xml
<DELEGATION_EXAMPLES>
User: "Send email to john@example.com"
Thinking: WRITE operation → ActionsAgent
→ delegate_task(agent="ActionsAgent", task="Send email to john@example.com")

User: "How many unread emails?"
Thinking: READ operation → IntelligenceAgent
→ delegate_task(agent="IntelligenceAgent", task="Count unread emails")

User: "Update John's phone to 555-1234"
Thinking: WRITE (update contact) → ActionsAgent
→ delegate_task(agent="ActionsAgent", task="Find John, update phone to 555-1234")
</DELEGATION_EXAMPLES>
```

**ActionsAgent** (`actions.prompt.ts`):
```xml
<FEW_SHOT_EXAMPLES>
Example 1: "Update contact Davide's job title to CTO"
STEP 1: search_contacts(query="Davide")
→ [{contactId: "abc123", displayName: "Davide Marchetto"}]
STEP 2: manage_contact(action="update", contactId="abc123", jobTitle="CTO")
→ {requiresApproval: true, severity: "MEDIUM"}

Example 2: "Delete Team Meeting event"
STEP 1: get_events(query="Team Meeting")
→ [{eventId: "evt789", title: "Team Meeting"}]
STEP 2: manage_event(action="delete", eventId="evt789")
→ {requiresApproval: true, severity: "HIGH"}
</FEW_SHOT_EXAMPLES>
```

### 6.4 Add Chain-of-Thought (Audit P0)

**SupervisorAgent**:
```xml
<CHAIN_OF_THOUGHT>
Before delegating, think step-by-step:
1. Is this READ or WRITE operation?
2. Which agent handles this category?
3. What specific task should I delegate?
4. Does this need multi-step coordination?
</CHAIN_OF_THOUGHT>
```

### 6.5 Add Error Recovery (Audit P1)

**ActionsAgent**:
```xml
<ERROR_RECOVERY>
If search returns empty:
→ "I couldn't find contact [X]. Would you like to search with different terms?"
→ Do NOT proceed with manage operation without valid ID

If tool execution fails:
→ Return error details to user
→ Suggest alternative actions
</ERROR_RECOVERY>
```

### 6.6 Files to Modify

| File | Action | Lines Changed |
|------|--------|---------------|
| `locales/en.ts` | Delete dead agent prompts | -190 LOC |
| `prompts/supervisor.prompt.ts` | Add few-shot + CoT | +40 LOC |
| `prompts/actions.prompt.ts` | Add few-shot + error recovery | +50 LOC |
| `prompts/intelligence.prompt.ts` | Add tool selection logic | +30 LOC |
| `prompts/websearch.prompt.ts` | CREATE (extract from locales) | ~30 LOC |
| `prompts/analytics.prompt.ts` | CREATE (extract from locales) | ~30 LOC |
| `prompts/index.ts` | Update exports | ~10 LOC |

**Net savings**: ~190 LOC removed, ~160 LOC added = **~30 LOC net reduction** + MUCH cleaner architecture

---

## Files Summary

### DELETE (Complete Removal):
| File | Lines | Reason |
|------|-------|--------|
| `model-router.service.ts` | 554 | VoltAgent native model strings |
| `workflows/approval.workflow.ts` | ~150 | VoltAgent createWorkflowChain |
| `workflows/briefing.workflow.ts` | ~100 | Unused |
| `workflows/follow-up.workflow.ts` | ~100 | Unused |
| `workflows/index.ts` | ~20 | Exports dead code |
| `locales/en.ts` dead prompts | ~190 | Consolidated agents |
| **TOTAL** | **~1,114** | |

### SIMPLIFY:
| File | Current | Target | Savings |
|------|---------|--------|---------|
| `chat-request-processor.service.ts` | 229 | 100 | 129 |
| `memory/memory.config.ts` | 60 | 15 | 45 |
| `hitl.service.ts` | 200+ | 150 | 50+ |
| **TOTAL** | | | **~224** |

### IMPROVE (Prompts):
| File | Action |
|------|--------|
| `prompts/supervisor.prompt.ts` | Add few-shot examples + CoT |
| `prompts/actions.prompt.ts` | Add few-shot + error recovery |
| `prompts/intelligence.prompt.ts` | Add tool selection logic |
| `prompts/websearch.prompt.ts` | CREATE - extract from locales |
| `prompts/analytics.prompt.ts` | CREATE - extract from locales |

### MODIFY (Tool HITL Migration):
- `tools/email.tools.ts` - manage_email tool
- `tools/contacts.tools.ts` - manage_contact tool
- `tools/calendar.tools.ts` - manage_event tool

---

## Verification Plan

### After Each Phase:
```bash
# Type check
npm run type-check

# Run HITL test
npx ts-node scripts/test-tool-hitl-simple.ts

# Run bruteforce tests
npx ts-node scripts/bruteforce-voltagent-test.ts
```

### Final Validation:
1. All 45 bruteforce tests pass (including 7 HITL tests)
2. No TypeScript errors
3. ActionQueue records created for HITL tools
4. Memory persists across conversations

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Remove model router | LOW | VoltAgent native well-tested |
| Fix FK constraint | LOW | Simple schema change |
| Delete workflows | LOW | Verified unused via grep |
| Tool needsApproval | MEDIUM | Test each tool individually |
| Simplify chat processor | MEDIUM | Keep PII + validation |
| Delete dead prompts | LOW | Verify no imports first |
| Add few-shot examples | LOW | Improves reliability |
| Prompt architecture change | MEDIUM | Test each agent after change |

---

## Timeline

| Day | Phase | Deliverable |
|-----|-------|-------------|
| 1 | Phase 1: Fix HITL FK + needsApproval | HITL tests pass |
| 2 | Phase 2: Remove model router | 554 LOC removed |
| 2-3 | Phase 3: Simplify memory | 45 LOC removed |
| 3 | Phase 4: Delete dead workflows | ~370 LOC removed |
| 3-4 | Phase 5: Simplify chat processor | 129 LOC removed |
| 4-5 | Phase 6: Prompt consolidation | ~190 LOC removed, cleaner architecture |
| 5-6 | Final validation | All 45 tests pass, prompts 8.5/10 |

**Total Estimated Savings**: ~1,300+ lines of code + unified prompt architecture

---

## Sources

- [VoltAgent GitHub](https://github.com/VoltAgent/voltagent)
- [VoltAgent Documentation](https://voltagent.dev/)
- [VoltAgent Changelog](https://github.com/voltagent/voltagent/blob/main/CHANGELOG.md)
- [@voltagent/core npm](https://www.npmjs.com/package/@voltagent/core)
- [VoltAgent Prompt Management](https://voltagent.dev/docs/agents/prompts/)
