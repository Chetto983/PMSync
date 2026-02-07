---
phase: 06-chat-ui-and-agent-tool-on-mail
verified: 2026-02-07T12:37:27Z
status: gaps_found
score: 11/12 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed: []
  gaps_remaining:
    - "AI responses reference the specific email being discussed"
  regressions: []
  partial_implementation:
    completed:
      - "UnifiedAgentOptions interface has viewContext field"
      - "fetchEmailContext helper fetches email from Prisma"
      - "createUnifiedAgent is async and conditionally fetches email"
      - "getUnifiedPrompt receives emailContext when present"
    incomplete:
      - "ChatRequestDto has viewContext but Controller never extracts it"
      - "ChatOptions interface missing viewContext field"
      - "VoltAgentService never passes viewContext to AgentPoolService"
      - "GetOrCreateAgentParams interface missing viewContext field"
      - "Agent creation never receives viewContext parameter"
gaps:
  - truth: "AI responses reference the specific email being discussed"
    status: failed
    reason: "Infrastructure added to unified.agent.ts but viewContext NEVER FLOWS through the parameter chain from API to agent creation"
    artifacts:
      - path: "backend/src/modules/ai/voltagent/voltagent.controller.ts"
        issue: "Receives body.viewContext in ChatRequestDto but never extracts it to ChatOptions"
      - path: "backend/src/modules/ai/voltagent/voltagent.service.ts"
        issue: "ChatOptions interface missing viewContext field, never passed to agent pool"
      - path: "backend/src/modules/ai/voltagent/services/agent-pool.service.ts"
        issue: "GetOrCreateAgentParams missing viewContext, never passed to createUnifiedAgent"
      - path: "backend/src/modules/ai/voltagent/agents/unified.agent.ts"
        issue: "Has viewContext support but NEVER RECEIVES IT due to broken parameter chain"
    missing:
      - "Extract body.viewContext in voltagent.controller.ts chat endpoints"
      - "Add viewContext field to ChatOptions interface"
      - "Pass options.viewContext to AgentPoolService.getOrCreateAgent()"
      - "Add viewContext field to GetOrCreateAgentParams interface"
      - "Pass params.viewContext to createUnifiedAgent({ viewContext })"
---

# Phase 06: Chat UI and Agent Tool on Mail Re-Verification Report

**Phase Goal:** Enhanced chat interface with agent tool integration for email actions
**Verified:** 2026-02-07T12:37:27Z
**Status:** gaps_found
**Re-verification:** Yes — after attempted gap closure via 06-04

## Re-Verification Summary

**Gap closure attempt: FAILED**

Plan 06-04 implemented the infrastructure in unified.agent.ts (async fetch, EmailContext building, prompt integration), but the parameter chain was never wired. The viewContext flows from frontend to backend API but stops at the controller — it never reaches agent creation.

**What was completed:**
- fetchEmailContext helper (lines 104-137 in unified.agent.ts)
- UnifiedAgentOptions.viewContext field (line 79-82)
- Async createUnifiedAgent with conditional email fetch (line 321-331)
- emailContext passed to getUnifiedPrompt (line 335)
- Async propagated to createSupervisorAgent and test scripts

**What is still broken:**
- viewContext extracted from request body in controller
- viewContext field in ChatOptions interface
- viewContext passed through VoltAgentService
- viewContext field in GetOrCreateAgentParams interface
- viewContext passed to createUnifiedAgent call

**Result:** The infrastructure exists but is NEVER INVOKED because viewContext never arrives.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When viewing an email thread, user sees email-specific quick actions | VERIFIED | useEmailChatActions hook returns 4 actions when currentView === thread |
| 2 | When not viewing a thread, user sees default quick actions | VERIFIED | useEmailChatActions returns [] when not in thread view |
| 3 | Clicking email action sends context-aware prompt to AI | VERIFIED | QuickActions chip onClick calls onSelectQuery(action.prompt) |
| 4 | User sees floating AI button (FAB) when viewing email thread | VERIFIED | EmailChatFab component in thread page with Sparkles icon |
| 5 | Clicking FAB opens slide-in chat panel from right | VERIFIED | EmailChatFab onClick toggles chatOpen state |
| 6 | Chat panel pre-populated with email context | VERIFIED | EmailChatPanel header shows emailSubject |
| 7 | User can close panel and return to full email view | VERIFIED | X button in header calls onClose |
| 8 | Chat panel uses useVoltAgentChat hook with thread ViewContext | VERIFIED | EmailChatPanel line 177: useVoltAgentChat with viewContext |
| 9 | Tool invocations render as collapsible cards | VERIFIED | ChatMessages imports from ai-elements/tool.tsx |
| 10 | Tool states show appropriate visual feedback | VERIFIED | tool.tsx getStatusBadge() with Loader2Icon |
| 11 | Email tools include email context for accurate responses | VERIFIED | ViewContext has selectedEmailId passed to backend |
| 12 | AI responses reference specific email being discussed | FAILED | Infrastructure in place but parameter chain broken |

**Score:** 11/12 truths verified (unchanged from previous verification)

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Frontend | Backend API | body.viewContext | WIRED | ChatRequestDto line 77-82 has viewContext field |
| Controller | ChatOptions | extract viewContext | NOT_WIRED | Controller never extracts body.viewContext |
| VoltAgentService | AgentPoolService | pass viewContext | NOT_WIRED | ChatOptions has no viewContext field |
| AgentPool | createUnifiedAgent | pass viewContext | NOT_WIRED | GetOrCreateAgentParams has no viewContext |
| unified.agent.ts | email context | fetch and wire | ORPHANED | Infrastructure exists but parameter never arrives |

### Detailed Gap Analysis

**The Broken Chain:**

1. Frontend → Backend API: WORKS
   - Frontend sends: { message, viewContext: { selectedEmailId: 'abc' } }
   - Controller receives: body.viewContext (ChatRequestDto line 77-82)

2. Controller → ChatOptions: BROKEN
   - voltagent.controller.ts line 148-156
   - ChatOptions built without extracting body.viewContext
   - viewContext silently dropped

3. ChatOptions Interface: MISSING FIELD
   - voltagent.service.ts line 104
   - ChatOptions has userId, tenantId, locale, model
   - viewContext field DOES NOT EXIST

4. VoltAgentService → AgentPoolService: CANNOT PASS
   - ChatOptions passed to createStreamContext
   - Options passed to getOrCreateAgent
   - But GetOrCreateAgentParams has no viewContext field

5. GetOrCreateAgentParams Interface: MISSING FIELD
   - agent-pool.service.ts line 43
   - Has tenantId, locale, modelType, userContext, intent
   - viewContext field DOES NOT EXIST

6. Agent Creation Call: PARAMETER NOT PASSED
   - agent-pool.service.ts line 160
   - createUnifiedAgent called with model, prisma, locale, etc
   - viewContext parameter NEVER PASSED

7. UnifiedAgent Infrastructure: WORKS (but orphaned)
   - unified.agent.ts line 321-331
   - Checks if viewContext?.selectedEmailId exists
   - But viewContext is always undefined because it never arrives

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| voltagent.controller.ts | 148-156 | ChatOptions built without body.viewContext | Blocker | viewContext silently dropped |
| voltagent.service.ts | 104-112 | ChatOptions interface missing viewContext | Blocker | Cannot pass through service layer |
| agent-pool.service.ts | 43-54 | GetOrCreateAgentParams missing viewContext | Blocker | Cannot pass to agent creation |
| agent-pool.service.ts | 160-180 | createUnifiedAgent call missing viewContext | Blocker | Infrastructure never invoked |

### Commits Since Previous Verification

| Commit | Message | Gap Closed? |
|--------|---------|-------------|
| f4388e40 | feat(06-04): add viewContext and email fetching to UnifiedAgent | No - only bottom layer |
| 90d6c38a | feat(06-04): update createSupervisorAgent to async | N/A - async propagation |
| d31443f1 | feat(06-04): await createUnifiedAgent in agent-pool service | No - only await added |
| c558773a | fix(06-04): await createSupervisorAgent in test scripts | N/A - async propagation |
| 8c0d5cf0 | docs(06-04): complete email context wiring plan | N/A - documentation |

**Conclusion:** Plan 06-04 implemented the foundation (email fetching, prompt integration) but failed to wire the parameter chain. The gap remains OPEN.

## What Needs to be Done

To close this gap, viewContext must flow through the entire chain:

1. **voltagent.controller.ts** (chat and streamChatV3 endpoints)
   ```typescript
   const options: ChatOptions = {
     userId: req.user.userId,
     tenantId: req.user.tenantId,
     conversationId,
     locale: body.locale,
     model: body.model,
     viewContext: body.viewContext,  // ADD THIS
   };
   ```

2. **voltagent.service.ts** (ChatOptions interface)
   ```typescript
   export interface ChatOptions {
     userId: string;
     conversationId?: string;
     tenantId: string;
     locale?: string;
     model?: MistralModel;
     skipCache?: boolean;
     viewContext?: {  // ADD THIS
       currentView?: string;
       selectedEmailId?: string;
       selectedFolderId?: string;
       selectedContactId?: string;
     };
   }
   ```

3. **voltagent.service.ts** (pass to agent pool)
   ```typescript
   const agent = await this.agentPoolService.getOrCreateAgent({
     tenantId: options.tenantId,
     userId: options.userId,
     locale: resolvedLocale,
     modelType: selectedModel,
     userContext,
     intent: taskInfo.intent,
     viewContext: options.viewContext,  // ADD THIS
     memory,
     hooks,
   });
   ```

4. **agent-pool.service.ts** (GetOrCreateAgentParams interface)
   ```typescript
   export interface GetOrCreateAgentParams {
     tenantId: string;
     locale: SupportedLocale;
     modelType?: MistralModel;
     userContext?: UserContext | null;
     userId?: string;
     agentType?: AgentType;
     memory?: Memory | null;
     hooks?: AgentHooks;
     intent?: TaskIntent;
     viewContext?: {  // ADD THIS
       currentView?: string;
       selectedEmailId?: string;
       selectedFolderId?: string;
       selectedContactId?: string;
     };
   }
   ```

5. **agent-pool.service.ts** (pass to createUnifiedAgent)
   ```typescript
   const agent = await createUnifiedAgent({
     model,
     prisma: this.prisma,
     locale,
     tenantId,
     userId,
     memory: memory ?? undefined,
     hooks: hooks ?? undefined,
     userContext: userContext ?? undefined,
     cacheService: this.cacheService,
     // ... other services ...
     intent: params.intent ?? 'unknown',
     viewContext: params.viewContext,  // ADD THIS
   });
   ```

Once these 5 changes are made, the existing infrastructure in unified.agent.ts will activate and email context will flow to the AI prompt.

---

_Verified: 2026-02-07T12:37:27Z_
_Verifier: Claude (gsd-verifier)_
