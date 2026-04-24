# Triage + Follow-Up + Reminder Consolidation Roadmap

> Historical design note. The core follow-up plumbing is now partially live:
> `TriageActionService` creates `EmailFollowUp` records after live triage,
> `FollowUpDetectionService` is fenced to a backfill role for un-triaged emails with no existing follow-up,
> and `ReminderSchedulerService` exists for due-date notifications.
> Treat the "Current State" section below as an outdated baseline, not current architecture truth.

> **Goal**: Unify auto-triage detection, follow-up tracking, and reminder creation into a single cohesive pipeline. Zero additional LLM calls for the happy path.

## Current State (As-Is)

```
EmailTriageService.triageEmail()
  └─ EmailAnalysisService.analyzeEmailUnified()  ← 1 Mistral call
       ├─ Saves EmailAnalysis (hasDeadline, deadlineDate, needsFollowUp)
       ├─ Updates Email (aiPriority, aiLabels, isAutoTriaged)
       └─ Links user labels
       ✅ TriageActionService now creates/upserts EmailFollowUp records from live triage output
       ❌ Does NOT create reminders/calendar events

FollowUpDetectionService.detectFollowUps()  ← SEPARATE Mistral call (redundant)
  └─ Batch LLM analysis of recent emails
     ✅ Backfill results are now persisted to EmailFollowUp for un-triaged emails without an existing follow-up

EmailFollowUp model exists with:
  - dueDate, status, followUpType, commitments, waitingFor, actionItems
  - detectedDeadline, deadlineSource
  ✅ Live triage and guarded backfill both create these records

BriefingService reads EmailFollowUp for daily briefings
AiController exposes GET /ai/follow-ups and GET /ai/deadlines
  ✅ These endpoints can return live data because follow-ups are now created upstream
```

**Key problems:**
1. Passive-notification suppression is still too weak in the live triage → follow-up path
2. `FollowUpDetectionService` duplicates work with a second LLM call
3. Reminder scheduling exists, but it is less mature than the follow-up creation path
4. The old "follow-up endpoints are empty" assumption is stale and should not drive new planning

---

## Target State (To-Be)

```
EmailTriageService.triageEmail()
  └─ EmailAnalysisService.analyzeEmailUnified()  ← 1 Mistral call (unchanged)
       ├─ Saves EmailAnalysis ✅
       ├─ Updates Email ✅
       ├─ Links user labels ✅
       └─ NEW: TriageActionService.processTriageSignals()
            ├─ If needsFollowUp → upsert EmailFollowUp
            ├─ If hasDeadline → upsert EmailFollowUp with deadlineDate
            ├─ If urgency=critical|high + hasDeadline → create ActionQueue (HITL)
            │    └─ On approval → CalendarEventsService.createEvent()
            └─ Emit Socket.IO notification for deadline/follow-up

FollowUpDetectionService  ← REPURPOSED as backfill-only
  └─ Only runs on emails NOT already triaged (gap-filler)
  └─ Results now persisted to EmailFollowUp

ReminderSchedulerService (NEW, BullMQ)
  └─ Cron: check EmailFollowUp where dueDate is approaching
       ├─ dueDate - 24h: emit "upcoming_deadline" notification
       ├─ dueDate - 1h: emit "imminent_deadline" notification
       └─ dueDate passed + status=PENDING: mark EXPIRED or escalate
```

---

## Phases

### Phase 1: Wire Triage → Follow-Up Creation
**Cost: 0 LLM calls. Pure plumbing.**

**Files to create:**
- `backend/src/modules/ai/services/triage-action.service.ts` (~150 lines)

**Files to modify:**
- `backend/src/modules/ai/services/email-triage.service.ts` — call `TriageActionService` after triage
- `backend/src/modules/ai/ai.module.ts` — register provider

**Logic:**
```
processTriageSignals(tenantId, userId, emailId, analysis: UnifiedEmailAnalysis):
  1. If !analysis.needsFollowUp && !analysis.hasDeadline → return (no-op)
  2. Determine followUpType:
     - Check if user is sender (email.from matches user) → WAITING_FOR
     - Otherwise → TODO
  3. Determine dueDate:
     - If deadlineDate exists → use it
     - If needsFollowUp but no date → default to +3 business days
  4. Upsert EmailFollowUp:
     - emailId + tenantId (unique constraint already exists)
     - Set reason from analysis.reasoning
     - Set confidence from analysis.confidence
     - Set deadlineSource = "triage"
  5. Return created/updated follow-up
```

**Tests:**
- `backend/src/modules/ai/services/__tests__/triage-action.spec.ts`
- Unit test with mocked Prisma: verifies follow-up creation logic
- Verifies WAITING_FOR vs TODO classification
- Verifies dueDate fallback logic

**Validation gate:** `GET /ai/follow-ups` returns non-empty results after triage runs.

---

### Phase 2: Extend LLM Prompt for followUpDate
**Cost: 0 additional LLM calls. Same call, richer output.**

**Files to modify:**
- `backend/src/modules/ai/locales/en.ts` — add `followUpDate` to JSON schema in prompt
- `backend/src/modules/ai/locales/it.ts` — same
- `backend/src/modules/ai/types/email-insights.types.ts` — add `followUpDate` to `UnifiedEmailAnalysis`
- `backend/src/modules/ai/services/email-analysis.service.ts` — parse `followUpDate` from response

**Prompt addition (in OUTPUT_FORMAT):**
```json
{
  "needsFollowUp": true,
  "followUpDate": "ISO date or null — when the user should follow up",
  "followUpReason": "brief reason why follow-up is needed"
}
```

**Why separate from Phase 1:** Phase 1 works with existing data (deadlineDate fallback). Phase 2 improves accuracy but requires prompt change + potential output format regression testing.

**Tests:**
- Update `backend/src/modules/ai/services/__tests__/email-insights.pre-split.spec.ts`
- Verify new fields parse correctly, null fallback works

---

### Phase 3: HITL-Gated Calendar Reminder Creation
**Cost: 0 additional LLM calls. Uses existing `create_event` tool path.**

**Files to create:**
- None — logic lives in `TriageActionService` (extend Phase 1 file)

**Files to modify:**
- `backend/src/modules/ai/services/triage-action.service.ts` — add reminder creation
- `backend/src/modules/ai-chat/services/hitl.service.ts` — no changes needed (already supports ActionQueue)
- `backend/prisma/schema.prisma` — add `CREATE_REMINDER` to `ActionType` enum

**Logic (added to processTriageSignals):**
```
6. If analysis.urgency in ['critical', 'high'] AND dueDate exists:
   a. Create ActionQueue entry:
      - actionType: CREATE_REMINDER
      - actionPayload: {
          title: "Follow up: <email subject>",
          startTime: dueDate (or dueDate - 30min for meetings),
          emailId, followUpId,
          description: analysis.reasoning
        }
      - confidence: analysis.confidence
      - status: PENDING_APPROVAL
   b. Emit socket event "action:pending" to user
```

**HITL execution path (on approval):**
- Read ActionQueue entry
- Call `CalendarEventsService.createEvent()` with payload
- Mark ActionQueue as EXECUTED
- Update EmailFollowUp with linked calendar event info

**Migration:**
```sql
ALTER TYPE "ActionType" ADD VALUE 'CREATE_REMINDER';
```

**Tests:**
- Extend `triage-action.spec.ts`: verify ActionQueue created for high-urgency deadlines
- Extend `hitl.test.ts`: CREATE_REMINDER approval → calendar event created
- Verify low-urgency emails do NOT create ActionQueue entries

---

### Phase 4: Reminder Notification Scheduler
**Cost: 0 LLM calls. BullMQ cron job.**

**Files to create:**
- `backend/src/modules/ai/services/reminder-scheduler.service.ts` (~200 lines)

**Files to modify:**
- `backend/src/modules/ai/ai.module.ts` — register provider
- `backend/src/common/config/queue-names.ts` — add `REMINDER_CHECK` queue name

**Logic:**
```
BullMQ repeatable job: every 15 minutes
  1. Find EmailFollowUp where:
     - status = PENDING or REMINDED
     - dueDate between (now) and (now + 25h)
  2. For each:
     - If dueDate - now <= 1h AND remindCount < 3:
       → Emit socket "reminder:imminent" { followUpId, emailId, subject, dueDate }
       → Increment remindCount, set lastRemindedAt, status = REMINDED
     - If dueDate - now <= 24h AND remindCount === 0:
       → Emit socket "reminder:upcoming" { followUpId, emailId, subject, dueDate }
       → Increment remindCount, set lastRemindedAt
  3. Find overdue EmailFollowUp (dueDate < now, status != RESOLVED/EXPIRED):
     → If overdue > 48h: mark EXPIRED
     → If overdue <= 48h: emit socket "reminder:overdue"
```

**Socket events consumed by frontend** (future — frontend work not in this roadmap):
- `reminder:upcoming` → toast notification
- `reminder:imminent` → persistent banner
- `reminder:overdue` → badge on follow-up panel

**Tests:**
- `backend/src/modules/ai/services/__tests__/reminder-scheduler.spec.ts`
- Mock clock, verify correct notifications at each threshold
- Verify EXPIRED transition after 48h

---

### Phase 5: Repurpose FollowUpDetectionService as Backfill
**Cost: Saves LLM calls for already-triaged emails.**

**Files to modify:**
- `backend/src/modules/ai/services/follow-up-detection.service.ts`
  - Add guard: skip emails that already have EmailFollowUp records
  - Add guard: skip emails where isAutoTriaged = true
  - After detection: create EmailFollowUp records from results (currently discarded)
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts`
  - Add optional follow-up backfill pass after triage backfill

**Logic change:**
```
detectFollowUps(tenantId, hoursWindow):
  // EXISTING: fetch recent emails
  // NEW: exclude emails with existing EmailFollowUp
  where: {
    ...existing,
    followUp: { is: null },  // No follow-up record yet
  }
  // EXISTING: LLM batch analysis
  // NEW: persist results
  for (const detected of result.detectedFollowUps) {
    await prisma.emailFollowUp.upsert({
      where: { emailId_tenantId: { emailId: detected.emailId, tenantId } },
      create: { ... },
      update: { ... },
    });
  }
```

**Tests:**
- Verify already-triaged emails are skipped
- Verify follow-up records are created from batch detection

---

### Phase 6: mapToolToActionType Fix (from AUDIT.md)
**Fixes existing bugs that would block Phase 3.**

**Files to modify:**
- `backend/src/modules/ai-chat/services/ai-chat.service.ts`

**Bugs:**
1. `delete_event` maps to `SCHEDULE_MEETING` — should map to `DELETE_EMAIL` or new `DELETE_EVENT`
2. Fallback defaults to `SEND_EMAIL` — should default to `CREATE_TASK` or throw

**Also add mapping for new action type:**
- `create_reminder` → `CREATE_REMINDER`

---

## Execution Order & Dependencies

```
Phase 6 ──→ Phase 1 ──→ Phase 2
  (fix bugs)   (core wiring)  (better dates)
                  │
                  ├──→ Phase 3 ──→ Phase 4
                  │   (HITL calendar) (notifications)
                  │
                  └──→ Phase 5
                      (backfill cleanup)
```

**Phase 6** first because Phase 3 depends on correct ActionType mapping.
**Phase 1** is the critical path — unlocks value immediately.
**Phases 2-5** can be parallelized in pairs: (2+5) then (3+4).

## Cost Analysis

| Phase | LLM Calls Added | DB Writes Added | Risk |
|-------|-----------------|-----------------|------|
| 1 | 0 | 1 upsert per triaged email with follow-up signal | Low |
| 2 | 0 (same call) | 0 (same upsert, richer data) | Low (prompt change) |
| 3 | 0 | 1 ActionQueue per high-urgency deadline | Medium (HITL path) |
| 4 | 0 | remindCount updates every 15min | Low |
| 5 | Saves redundant calls | upserts from batch results | Low |
| 6 | 0 | 0 | Low (enum fix) |

**Total new LLM cost: zero.** All intelligence comes from the existing `analyzeEmailUnified()` call.

## Non-Goals (explicitly out of scope)

- Frontend follow-up/reminder UI (separate roadmap)
- Email-based reminders (sending reminder emails to user)
- Snooze functionality (different feature, different UX)
- Multi-user follow-up delegation (enterprise ABAC dependency)
- Smart reply auto-send (too risky without HITL maturity)
