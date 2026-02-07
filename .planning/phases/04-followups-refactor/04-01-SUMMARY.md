---
phase: 04-followups-refactor
plan: 01
subsystem: follow-ups
tags: [prisma, schema, backend, frontend, ui, kanban, filter, types]

requires:
  - phase: 02
    plan: all
    reason: "AI chat infrastructure for follow-up tracking"

provides:
  - "FollowUpType enum with WAITING_FOR and TODO values"
  - "Backend auto-detection of follow-up type based on folder"
  - "Frontend type filter toggle on Kanban board"
  - "Type badges on follow-up cards"

affects:
  - phase: 04
    plan: 02
    reason: "Type classification enables smarter follow-up workflows"

tech-stack:
  added:
    - "Prisma enum FollowUpType"
  patterns:
    - "Folder-based type detection for email classification"
    - "Lightweight Prisma selects (7 fields) for follow-up list queries"
    - "ToggleButtonGroup for multi-option filters"

key-files:
  created:
    - backend/prisma/migrations/20260207170724_add_follow_up_type/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/ai/voltagent/services/follow-up.service.ts
    - backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts
    - frontend/hooks/queries/use-follow-ups.ts
    - frontend/hooks/queries/follow-up-keys.ts
    - frontend/components/productivity/KanbanBoard/index.tsx
    - frontend/components/ai/FollowUpTracker/FollowUpCard.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/lib/api/ai.ts

decisions:
  - what: "Default follow-up type is TODO"
    why: "Existing follow-ups remain valid after migration; most follow-ups are received emails requiring action"
    alternatives: ["Default to WAITING_FOR", "Require manual migration"]

  - what: "Type detection based on folder path + extraction data"
    why: "Sent folder indicates user sent email, waitingFor extraction confirms expecting response"
    alternatives: ["Manual type selection", "LLM-based type detection"]

  - what: "Lightweight select statements (7 fields) for list queries"
    why: "Performance optimization, excludes heavy JSON blobs (commitments/waitingFor/actionItems)"
    alternatives: ["Include full data", "Separate detail query"]

duration: "16 minutes"
completed: 2026-02-07
---

# Phase 04 Plan 01: Follow-Up Type Classification Summary

**One-liner:** Adds WAITING_FOR/TODO type classification to follow-ups with folder-based auto-detection and frontend filter toggle

## What Was Built

### Schema Changes
- Added `FollowUpType` enum with two values:
  - `WAITING_FOR`: I sent email, waiting for response
  - `TODO`: I received email, need to take action
- Added `followUpType` field to `EmailFollowUp` model with `TODO` default
- Added composite index `[tenantId, userId, followUpType]` for efficient filtering

### Backend Implementation
- **Type Detection Logic** (`detectFollowUpType`):
  - Checks if email is in SENT folder (case-insensitive, supports sent/envoy/inviati)
  - Checks for `waitingFor` items in extraction data
  - Returns `WAITING_FOR` if both conditions met, else `TODO`
- **Service Layer**:
  - Modified `createFollowUp` to fetch email folder and auto-detect type
  - Updated `listFollowUps` to accept optional `type` filter parameter
  - Converted all follow-up queries to use lightweight `select` statements (7 fields)
  - Added `followUpType` to all return data
- **Controller Layer**:
  - Added `?type=WAITING_FOR|TODO` query parameter to GET `/api/v1/voltagent/follow-ups`

### Frontend Implementation
- **Query Hooks**:
  - Updated `EmailFollowUp` interface with optional `followUpType` field
  - Modified `followUpsListOptions` and `useFollowUpsList` to accept `type` parameter
  - Updated `followUpKeys.list` to include type in cache key
- **UI Components**:
  - Added `ToggleButtonGroup` in Kanban header with 3 options: All / Waiting For / To Do
  - Added type badges to `FollowUpCard`:
    - Hourglass icon + "Waiting For" for `WAITING_FOR` type (info color)
    - ListTodo icon + "To Do" for `TODO` type (secondary color)
- **Translations**:
  - Added `types` object with `all`, `waitingFor`, `todo` labels
  - Added `typeDescriptions` for tooltips/help text
  - Translations complete in English and Italian
- **API Client**:
  - Updated `voltAgentApi.listFollowUps` to accept `type` parameter

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

### 1. Default Type is TODO
**Decision:** Existing follow-ups default to TODO after migration.

**Rationale:** Most follow-ups are received emails requiring action. This ensures existing data remains valid without manual migration.

**Impact:** Users may need to manually reclassify some sent emails as WAITING_FOR if they were tracking them before this feature.

### 2. Folder-Based Type Detection
**Decision:** Detect type by checking if email is in SENT folder + has waitingFor items.

**Rationale:**
- Folder path is reliable indicator of email direction (sent vs received)
- Extraction data (`waitingFor`) confirms user is expecting response
- Fast, no LLM call required

**Impact:** Accurate for most cases. Edge cases (forwarded emails, manual folder moves) may need manual type correction.

### 3. Lightweight Select Statements
**Decision:** Use explicit `select` with 7 fields instead of `include` for list queries.

**Rationale:** Performance optimization. Excludes heavy JSON blobs (`commitments`, `waitingFor`, `actionItems`) that aren't displayed in list view.

**Impact:**
- Faster query responses
- Lower memory usage
- Consistent with v3.0 decision from Phase 08 (lightweight followUp select)

## Testing Summary

### Backend Tests
- ✅ `npm run type-check` passes
- ✅ Prisma schema validates
- ✅ Migration created successfully

### Frontend Tests
- ✅ `npm run type-check` passes
- ✅ `npm run lint` passes (no new errors)
- ✅ Type filter UI functional
- ✅ Type badges render correctly

## Key Files Changed

### Backend (4 files)
1. **schema.prisma**: Added enum and field
2. **follow-up.service.ts**: Type detection + filtering
3. **follow-up.controller.ts**: Query parameter support
4. **migration.sql**: Database schema update

### Frontend (8 files)
1. **use-follow-ups.ts**: Query hooks with type parameter
2. **follow-up-keys.ts**: Cache key factory update
3. **KanbanBoard/index.tsx**: Type filter UI
4. **FollowUpCard.tsx**: Type badge rendering
5. **ai.ts**: API client update
6. **en.ts**: English translations
7. **it.ts**: Italian translations
8. **index.ts**: TypeScript types

## Technical Details

### Type Detection Algorithm
```typescript
detectFollowUpType(email, extraction) {
  const isSentFolder = email.folder.includes('sent/envoy/inviati');
  const hasWaitingFor = extraction.waitingFor?.length > 0;

  return (isSentFolder && hasWaitingFor)
    ? 'WAITING_FOR'
    : 'TODO';
}
```

### API Contract
```
GET /api/v1/voltagent/follow-ups?type=WAITING_FOR
GET /api/v1/voltagent/follow-ups?type=TODO
GET /api/v1/voltagent/follow-ups  (no filter, all types)
```

### UI State Management
- Type filter stored in local component state
- Passed to `useFollowUpsList(status, type, limit)`
- Toggle button supports: '' (all), 'WAITING_FOR', 'TODO'

## Next Phase Readiness

### Phase 04-02 Dependencies Met
✅ Follow-up type field available for filtering
✅ UI infrastructure for type-based workflows
✅ Backend API supports type filtering

### Known Limitations
1. **Existing Data**: All existing follow-ups default to TODO (one-time migration artifact)
2. **Edge Cases**: Forwarded emails or manually moved emails may have incorrect type
3. **No Manual Override**: Users cannot manually change type (could be added in 04-02)

### Recommendations for Next Plan
1. Add "Change Type" action to follow-up card menu
2. Consider adding type distribution to stats endpoint
3. Add type indicator to email detail view

## Commits

| Hash     | Message                                              |
|----------|------------------------------------------------------|
| 1006d10b | feat(04-01): add FollowUpType enum and field to schema |
| 5190d1e0 | feat(04-01): backend type detection and filter parameter |
| 1f0f3088 | feat(04-01): frontend type filter, badges, and translations |

---
*Summary created: 2026-02-07 17:25 UTC*
*Duration: 16 minutes*
*All tasks completed successfully with zero deviations*
