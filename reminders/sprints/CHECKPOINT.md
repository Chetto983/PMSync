# Reminder Sprint — Checkpoint

## Status
- **Sprint:** 02 — AI Chat Tools Complete
- **Last Task Completed:** T-0208 + HITL fix — Production validated
- **Next Task:** Sprint 03 — Frontend Real-Time & UX
- **Tasks Done:** 8/8 + 1 hotfix
- **SP Completed:** 14/14
- **Last Updated:** 2026-04-02 14:00

## Audit Findings Addressed
- C1: No pre-deadline alerts — ✅ fixed in S01
- C2: AI tools incomplete — ✅ fixed in S02 (all 6 tools: create, list, complete, update, delete, snooze)
- C3: Email monitor O(N*K) query — ✅ fixed in S01
- C4: No Socket.IO events for Reminder — ✅ fixed in S01
- C5: Telegram hardcoded Italian — ✅ fixed in S01
- H1: Notification scheduling not transactional — ✅ fixed in S01
- H2: No jitter on delayed jobs — ✅ fixed in S01
- H3: Email monitor batch across all tenants — ✅ fixed in S01

## Last Modified Files
- backend/src/modules/ai-chat/tools/reminder-tools.service.ts
- backend/src/modules/ai-chat/services/ai-chat.service.ts
- backend/src/modules/ai-chat/constants/tool-domains.ts
- backend/src/modules/ai-chat/tools/tool-registry-governance.test.ts
- frontend/src/components/chat/tool-uis/ReminderToolUI.tsx
- frontend/src/components/chat/tool-uis/index.tsx
- frontend/src/components/chat/HitlApprovalCard.tsx
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts

## Key Decisions Made
- Zod schemas match exact Prisma enum values
- delete_reminder: HIGH risk, needsApproval wired to SDK via sensitivity param
- delete_reminder: uses FallbackToolRenderer (not custom renderer) for HITL approval flow
- delete_reminder added to HIGH_RISK_TEMPLATES in HitlApprovalCard.tsx
- snooze_reminder calculates new date as now + N days (1-30)
- Governance test: 35→39 tools

## HITL Investigation (2026-04-02)
Root cause was TWO bugs:
1. Backend: `needsApproval` missing from `tool()` builder — registry `requiresApproval` is governance metadata only
2. Frontend: custom `DeleteReminderRenderer` didn't handle `status.type === 'requires-action'`
Fix: wired `sensitivity` param through `getTools()`, removed delete_reminder from TOOL_RENDERERS

## Blockers / Notes
- None

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Production: ✅ ALL 6 TOOLS VALIDATED with real data
  - create_reminder: ✅ creates with Telegram notification
  - list_reminders: ✅ lists active reminders
  - complete_reminder: ✅ marks as completed
  - update_reminder: ✅ updates title/priority
  - snooze_reminder: ✅ postpones by N days
  - delete_reminder: ✅ HITL approval card shown (Approva/Nega/Annulla)
