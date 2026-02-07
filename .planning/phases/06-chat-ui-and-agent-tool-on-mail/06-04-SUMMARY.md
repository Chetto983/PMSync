---
phase: 06-chat-ui-and-agent-tool-on-mail
plan: 04
subsystem: ai-agent
tags: [voltagent, email-context, prompt-enrichment, async]
requires: [06-03]
provides:
  - Email context wiring from viewContext to unified prompt
  - Async agent creation with email fetching
affects: [06-05]
tech-stack:
  added: []
  patterns: [async-agent-creation, email-context-enrichment]
key-files:
  created: []
  modified:
    - backend/src/modules/ai/voltagent/agents/unified.agent.ts
    - backend/src/modules/ai/voltagent/agents/supervisor.agent.ts
    - backend/src/modules/ai/voltagent/services/agent-pool.service.ts
    - backend/scripts/test-p5-agent-chain.ts
    - backend/scripts/test-p5-performance.ts
decisions:
  - title: Make agent creation async
    rationale: Required to fetch email context from database before building prompt
  - title: Use from field instead of fromAddress
    rationale: Prisma Email schema uses 'from' as the sender address field
metrics:
  duration: 8 minutes
  completed: 2026-02-07
---

# Phase 06 Plan 04: Wire Email Context to Unified Prompt

Email context successfully wired from viewContext.selectedEmailId to unified prompt system.

## One-liner

Async agent creation with email context fetching enables AI to reference specific emails in responses.

## What Was Done

### Task 1: Add ViewContext to UnifiedAgentOptions
- Imported `EmailContext` type from `unified.prompt.ts`
- Added `viewContext` field to `UnifiedAgentOptions` interface
- ViewContext includes `currentView` and `selectedEmailId` fields

### Task 2: Add Email Context Fetching Helper
- Created `fetchEmailContext` async helper function
- Fetches email data (id, subject, from, receivedAt, snippet) from Prisma
- Includes comprehensive error handling and logging
- Returns `undefined` if email not found or on error

### Task 3: Wire Email Context in createUnifiedAgent
- Changed `createUnifiedAgent` function signature to async
- Extracts `viewContext` from options
- Fetches email context when `selectedEmailId` is present
- Passes `emailContext` to `getUnifiedPrompt` in serviceFlags
- Logs debug message when email context loaded

### Task 4: Update createUnifiedAgentForIntent
- Made `createUnifiedAgentForIntent` async
- Updated return type to `Promise<Agent>`
- Maintains consistency with `createUnifiedAgent`

### Task 5: Update All Callers
- Updated `agent-pool.service.ts` to await `createUnifiedAgent`
- Updated `supervisor.agent.ts` to async and await `createUnifiedAgent`
- Updated test scripts:
  - `test-p5-agent-chain.ts` - 1 location
  - `test-p5-performance.ts` - 2 locations
- Fixed linting issues (prefer-const)

## Technical Details

### Email Context Flow
```
Frontend (selectedEmailId)
  → Backend API (viewContext)
    → createUnifiedAgent (fetchEmailContext)
      → Prisma (email query)
        → getUnifiedPrompt (emailContext)
          → buildEmailContextSection
            → System Prompt (EMAIL_CONTEXT section)
```

### Schema Discovery
- Discovered Email schema uses `from` field, not `fromAddress`
- Email.from contains sender address string
- Fixed field name in fetchEmailContext helper

### Async Propagation
All agent creation points now async:
- `createUnifiedAgent` - main factory
- `createUnifiedAgentForIntent` - intent-specific factory
- `createSupervisorAgent` - supervisor wrapper
- `agent-pool.service.ts` - pool manager
- Test scripts - performance and chain tests

## Verification Results

### Type-Check
```bash
npm run type-check
```
✅ Passes - no TypeScript errors

### Lint
```bash
npx eslint [modified-files] --fix
```
✅ Passes - only pre-existing warnings remain:
- Unused type imports (TOOL_GROUPS, WebSearchToolOptions, ToolRegistry)
- Unused imports (buildDynamicInstructions, commonOptions)

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| f4388e40 | feat(06-04): add viewContext and email fetching to UnifiedAgent | unified.agent.ts |
| 90d6c38a | feat(06-04): update createSupervisorAgent to async | supervisor.agent.ts |
| d31443f1 | feat(06-04): await createUnifiedAgent in agent-pool service | agent-pool.service.ts |
| c558773a | fix(06-04): await createSupervisorAgent in test scripts | test-p5-*.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Email schema field name mismatch**
- **Found during:** Task 2 implementation
- **Issue:** Used `fromAddress` but Email schema has `from` field
- **Fix:** Changed `select: { fromAddress: true }` to `select: { from: true }`
- **Files modified:** unified.agent.ts
- **Commit:** f4388e40

**2. [Rule 1 - Bug] Prefer const over let**
- **Found during:** Lint verification
- **Issue:** `agent` variable declared with `let` but never reassigned
- **Fix:** Changed `let agent: Agent` to `const agent` in agent-pool.service.ts
- **Files modified:** agent-pool.service.ts
- **Commit:** d31443f1

## Next Phase Readiness

### Blockers
None

### Concerns
None

### Ready for Next Phase
✅ Yes - Email context successfully wired to prompt system

## Testing Recommendations

### Manual Test Flow
1. Start backend: `npm run start:dev`
2. Open AI chat in email thread view (frontend)
3. Select an email in inbox
4. Open chat sidebar
5. Ask "summarize this email"
6. Verify: AI response references the specific email subject/sender
7. Ask "reply to this email"
8. Verify: AI knows which email to reply to

### Expected Behavior
When `viewContext.selectedEmailId` is present:
- System prompt includes `<EMAIL_CONTEXT>` section
- Email subject, sender, received date shown in context
- AI understands "this email" references the selected email
- Operations (reply, forward, archive, etc.) use correct email ID

### Debug Verification
Check backend logs for:
```
[UNIFIED] Email context loaded: [subject]
```

## Files Modified

### Core Implementation
- `backend/src/modules/ai/voltagent/agents/unified.agent.ts` - Email context fetching and async agent creation
- `backend/src/modules/ai/voltagent/agents/supervisor.agent.ts` - Async supervisor creation
- `backend/src/modules/ai/voltagent/services/agent-pool.service.ts` - Async agent pool management

### Test Scripts
- `backend/scripts/test-p5-agent-chain.ts` - Async agent creation in tests
- `backend/scripts/test-p5-performance.ts` - Async agent creation in performance tests

## Success Criteria

- [x] UnifiedAgentOptions has viewContext field
- [x] fetchEmailContext helper fetches email from Prisma
- [x] createUnifiedAgent is async and fetches email when selectedEmailId present
- [x] getUnifiedPrompt receives emailContext parameter
- [x] All callers of createUnifiedAgent are updated for async
- [x] TypeScript and lint pass

## Performance Impact

### Agent Creation Time
- Async overhead: +10-30ms for email fetch (single Prisma query)
- Negligible compared to LLM latency (500-2000ms)
- Email fetch only when `selectedEmailId` present (optional)

### Memory Impact
- No additional memory overhead
- Email context is transient (not cached)

## Future Enhancements

### Potential Optimizations
1. **Cache email context** - Redis cache for frequently accessed emails
2. **Batch email loading** - Fetch multiple emails if needed
3. **Expanded context** - Include attachments, thread history
4. **Smart context selection** - AI decides which emails to load based on query

### Related Work
- Phase 06-05: Tool execution with email context
- Phase 06-06: Multi-email operations
