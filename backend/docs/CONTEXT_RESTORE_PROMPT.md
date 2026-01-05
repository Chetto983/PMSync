# Context Restore Prompt

**Copy and paste this when starting a new conversation or when Claude loses context.**

---

## Quick Restore (Copy This)

```
I'm working on MailAgent email module consolidation. Restore context:

1. Read entry point: backend/docs/EMAIL_CONSOLIDATION_ENTRY.md
2. Query memory: npx claude-flow@alpha memory query "email-consolidation" --namespace mailagent
3. Check current phase status in the entry document
4. Continue from where we left off

Key rules:
- Never proceed to next phase until test PASSES
- Update memory and docs before compact and at end of every phase
- Real tests only (no mocks, no Jest)
- P2034 handling is MISSING (needs to be added)

Current docs:
- EMAIL_CONSOLIDATION_ENTRY.md (START HERE)
- EMAIL_CONSOLIDATION_ROADMAP.md (detailed phases)
- EMAIL_MODULES_CONSOLIDATION_MASTER.md (audit)
- EMAIL_SYNC_REFACTOR_PLAN.md (driver split - AFTER consolidation)
```

---

## Full Restore (If Quick Doesn't Work)

```
## PROJECT: MailAgent Email Module Consolidation

### What This Is
Consolidating duplicated code between `email` and `email-sync` modules.
- 365 lines duplicated across modules
- 280 lines can be reduced
- 9 phases to complete

### Current Status
Read: backend/docs/EMAIL_CONSOLIDATION_ENTRY.md

Check phase status table to see what's done and what's next.

### Memory Query
Run: npx claude-flow@alpha memory query "email-consolidation" --namespace mailagent

Key memories:
- email-consolidation-roadmap-2025-01-04
- email-module-audit-2025-01-04
- email-duplication-map-2025-01-04

### Critical Issues to Fix
1. P2034 deadlock retry - MISSING (only P2002 exists)
2. RC-A1: folder-sync.service.ts needs Redis lock
3. RC-A8: folder CRUD needs Redis lock
4. Dead code: extractPlainText (lines 1314-1346)

### Phase Overview
- Phase 1: Prisma Retry Service (P2002 + P2034)
- Phase 2: IMAP Utils consolidation
- Phase 3: Folder Utils consolidation
- Phase 4: Error Utils extension
- Phase 5: Dead code deletion
- Phase 6: Race condition fixes
- Phase 7: P2034 handling
- Phase 8: Final validation
- Phase 9: Production stress test (TRIGGERS failures)

### Key Rules
1. NEVER proceed to next phase until test PASSES
2. Update memory before compact and at end of every phase
3. Real tests only - no mocks, no Jest
4. Phase 9 TRIGGERS production failures (not just checks state)

### Test Commands
- Prisma: npx ts-node backend/scripts/test-prisma-retry.ts
- Atomic: npx ts-node backend/scripts/stress-test-atomic-sync.ts
- Multi-tenant: npx ts-node backend/scripts/stress-test-multi-tenant.ts
- Production: npx ts-node backend/scripts/stress-test-production-scenarios.ts

### File Locations
- Entry: backend/docs/EMAIL_CONSOLIDATION_ENTRY.md
- Roadmap: backend/docs/EMAIL_CONSOLIDATION_ROADMAP.md
- Common utils: backend/src/common/utils/
- Common services: backend/src/common/services/
```

---

## Emergency: Complete Context Loss

If Claude has completely lost context and needs to understand the project:

```
Read these files in order:
1. backend/docs/EMAIL_CONSOLIDATION_ENTRY.md
2. backend/docs/EMAIL_CONSOLIDATION_ROADMAP.md
3. CLAUDE.md (section: BACKEND DEVELOPMENT PROCEDURE)

Then query memory:
npx claude-flow@alpha memory query "email" --namespace mailagent --limit 10

This is a code consolidation project for email modules.
Do NOT write any code until you understand:
- Current phase status
- What tests must pass
- What's already implemented vs what's missing
```

---

## After Restoring Context

1. Confirm current phase from entry document
2. Run the phase test to verify current state
3. Continue implementation or move to next phase
4. Update memory before session ends

---

*Keep this file bookmarked for quick access.*
