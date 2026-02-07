---
phase: 04-followups-refactor
plan: 02
subsystem: follow-ups
tags: [nlp, chrono-node, smart-timing, ai, backend, frontend, ux]

requires:
  - phase: 04
    plan: 01
    reason: "Follow-up type classification and UI infrastructure"
  - phase: 02
    plan: all
    reason: "AI chat infrastructure for follow-up tracking"

provides:
  - "NLP deadline detection using chrono-node from email text"
  - "Smart timing recommendation API based on research"
  - "Detected deadline display on follow-up cards"
  - "Smart timing query hooks for frontend"

affects:
  - phase: 04
    plan: 03
    reason: "Smart timing can enhance snooze dialog when implemented"

tech-stack:
  added:
    - "chrono-node v2.9.0 for NLP date extraction"
  patterns:
    - "Deadline extraction from subject + body text"
    - "Research-based smart timing (2-3 days, Tuesday-Thursday 10 AM)"
    - "detectedDeadline + deadlineSource pattern for tracking source"

key-files:
  created:
    - backend/prisma/migrations/20260207162745_add_detected_deadline/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/ai/voltagent/services/follow-up-extraction.service.ts
    - backend/src/modules/ai/voltagent/services/follow-up.service.ts
    - backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts
    - frontend/hooks/queries/use-follow-ups.ts
    - frontend/hooks/queries/follow-up-keys.ts
    - frontend/lib/api/ai.ts
    - frontend/components/ai/FollowUpTracker/FollowUpCard.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

decisions:
  - what: "Use chrono-node (already installed) for NLP deadline extraction"
    why: "Zero additional dependencies, handles relative dates well"
    alternatives: ["Add new NLP library", "Use regex-only extraction"]

  - what: "Smart timing prefers Tuesday-Thursday 10 AM"
    why: "Research shows highest response rates on midweek mornings"
    alternatives: ["Machine learning based on user patterns", "Simple N-day offset"]

  - what: "Store detectedDeadline separately from dueDate"
    why: "Preserves both AI-detected deadline and manual due date"
    alternatives: ["Overwrite dueDate with detected", "Only show in UI, don't store"]

patterns-established:
  - "extractDeadlineFromText: NLP pattern matching + chrono.parse fallback"
  - "SmartTimingRecommendation: suggestedDate, reason, confidence (0-1)"
  - "Deadline source tracking: nlp | manual | extraction"

duration: 12 minutes
completed: 2026-02-07
---

# Phase 04 Plan 02: Smart Timing & NLP Deadline Detection Summary

**NLP deadline extraction with chrono-node and research-backed smart timing (2-3 days, Tuesday-Thursday 10 AM) for follow-ups**

## Performance

- **Duration:** 12 minutes
- **Started:** 2026-02-07T16:27:45Z
- **Completed:** 2026-02-07T16:40:13Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- NLP deadline detection extracts dates like "by Friday" or "end of next week" from email text
- Smart timing API returns research-backed recommendation (doubles response rate 16% → 27%)
- Detected deadline displayed on follow-up cards with source tooltip
- Complete translation support (English and Italian)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deadline fields and chrono-node extraction** - `4b598896` (feat)
   - Added detectedDeadline and deadlineSource to schema
   - Integrated chrono-node NLP parsing
   - Updated all select statements to include new fields

2. **Task 2: Smart timing calculation utility** - `b7078d52` (feat)
   - calculateSmartTiming private method with research-based logic
   - GET /follow-ups/:id/smart-timing API endpoint
   - SmartTimingRecommendation interface

3. **Task 3: Frontend deadline display and smart timing query** - `d3288ef2` (feat)
   - useSmartTiming hook with TanStack Query caching
   - Detected deadline chip on FollowUpCard
   - Complete translations (smartTiming, deadline)

**No plan metadata commit** (no planning docs in commit_docs scope)

## Files Created/Modified

### Backend (5 files)
- `backend/prisma/schema.prisma` - Added detectedDeadline, deadlineSource fields
- `backend/prisma/migrations/20260207162745_add_detected_deadline/migration.sql` - Migration SQL
- `backend/src/modules/ai/voltagent/services/follow-up-extraction.service.ts` - extractDeadlineFromText method with chrono-node
- `backend/src/modules/ai/voltagent/services/follow-up.service.ts` - calculateSmartTiming, getSmartTimingRecommendation, updated CreateFollowUpInput
- `backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts` - GET /follow-ups/:id/smart-timing endpoint

### Frontend (7 files)
- `frontend/hooks/queries/use-follow-ups.ts` - Added detectedDeadline/deadlineSource to interface, useSmartTiming hook
- `frontend/hooks/queries/follow-up-keys.ts` - smartTiming query key
- `frontend/lib/api/ai.ts` - getSmartTiming API method
- `frontend/components/ai/FollowUpTracker/FollowUpCard.tsx` - Detected deadline chip with Sparkles icon
- `frontend/locales/en.ts` - smartTiming and deadline translations
- `frontend/locales/it.ts` - Italian translations
- `frontend/locales/index.ts` - TypeScript types for translations

## Decisions Made

### 1. NLP Library Choice: chrono-node
**Decision:** Use chrono-node (already in package.json) instead of adding new library.

**Rationale:**
- Zero additional dependencies
- Handles relative dates ("next Friday", "in 3 days")
- Supports business days
- Locale-aware

**Impact:** Fast implementation, no bundle size increase.

### 2. Smart Timing Algorithm
**Decision:** 2-3 days after send, prefer Tuesday-Thursday 10 AM.

**Rationale:**
- Research: single follow-up doubles response rate (16% → 27%)
- Tuesday-Thursday have highest open/response rates
- 9-11 AM optimal time window

**Impact:** Data-driven recommendations, no ML training required initially.

### 3. Deadline Storage Strategy
**Decision:** Store detectedDeadline separately from dueDate.

**Rationale:**
- dueDate = user's follow-up reminder date
- detectedDeadline = AI-detected actual deadline from email
- Users can see both and decide which matters

**Impact:** More information available, clearer UX.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - chrono-node integration worked as expected, all type checks passed.

## Next Phase Readiness

### Phase 04-03 Dependencies Met
✅ Smart timing available for snooze dialog integration
✅ Detected deadline displayed on cards
✅ NLP extraction working for "by Friday", "end of next week" patterns

### Known Limitations
1. **Snooze dialog not implemented** - Smart timing hook ready but no dialog component exists yet (out of scope for this plan)
2. **No confidence adjustment** - Smart timing uses fixed 0.85 confidence, could be personalized later
3. **English-only NLP** - chrono-node patterns are English-centric, Italian dates may not parse well

### Recommendations for Future Plans
1. Implement SnoozeDialog component with smart timing suggestion chip (use useSmartTiming hook)
2. Add Italian date pattern support to chrono-node extraction
3. Track actual response times to adjust smart timing confidence
4. Add "Change deadline" action to manually set detectedDeadline

## Technical Details

### NLP Deadline Extraction
```typescript
// Pattern matching + chrono.parse
extractDeadlineFromText(text: string): Date | null {
  // 1. Check explicit patterns: "by Friday", "before March 15"
  // 2. Fallback: general chrono.parse with forwardDate: true
  // 3. Only return future dates
}
```

### Smart Timing Logic
```typescript
calculateSmartTiming(createdAt: Date): SmartTimingRecommendation {
  // 1. Default: 3 days from creation
  // 2. Adjust to Tuesday-Thursday (skip weekends)
  // 3. Set to 10 AM optimal window
  // 4. Return suggestedDate + reason + 0.85 confidence
}
```

### API Contract
```
GET /api/v1/voltagent/follow-ups/:id/smart-timing
Response: {
  success: true,
  recommendation: {
    suggestedDate: "2026-02-10T10:00:00Z",
    reason: "Recommended: Tuesday-Thursday 10 AM",
    confidence: 0.85
  }
}
```

### Frontend UI
- **Detected deadline:** Sparkles icon + "Deadline detected: Feb 10" with source tooltip
- **Smart timing:** Ready for snooze dialog (chip showing recommended date)
- **Translations:** Complete English/Italian support

---
*Phase: 04-followups-refactor*
*Completed: 2026-02-07*
