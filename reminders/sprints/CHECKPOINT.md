# Reminder Sprint — Checkpoint

## Status
- **Sprint:** 03 — Frontend Real-Time & UX — COMPLETE
- **Last Task Completed:** T-0309 — Type-check + validation
- **Next Task:** Sprint 04 — Search, Bulk Ops & Audit
- **Tasks Done:** 9/9
- **SP Completed:** 16/16
- **Last Updated:** 2026-04-02 16:30

## Audit Findings Addressed
- C1: No pre-deadline alerts — ✅ fixed in S01
- C2: AI tools incomplete — ✅ fixed in S02
- C3: Email monitor O(N*K) query — ✅ fixed in S01
- C4: No Socket.IO events for Reminder — ✅ fixed in S01, frontend wired in S03
- C5: Telegram hardcoded Italian — ✅ fixed in S01
- H1: Notification scheduling not transactional — ✅ fixed in S01
- H2: No jitter on delayed jobs — ✅ fixed in S01
- H3: Email monitor batch across all tenants — ✅ fixed in S01

## Last Modified Files
- frontend/hooks/use-reminder-realtime.ts (NEW — Socket.IO hook)
- frontend/lib/websocket-client.ts (6 new reminder handlers)
- frontend/components/layout/Layout.tsx (toast wiring)
- frontend/components/reminders/ReminderCard.tsx (Telegram status, email monitoring, condition chips)
- frontend/hooks/queries/use-reminders.ts (optimistic updates, error toasts)
- frontend/locales/en.ts, it.ts, index.ts (i18n strings)
- backend/src/modules/realtime/types/realtime.types.ts (delivery-failed event)
- backend/src/modules/realtime/services/realtime-events.service.ts (emitReminderDeliveryFailed)
- backend/src/modules/telegram/services/reminder-notify.queue.ts (emit on failure)

## Key Decisions Made
- useReminderRealtime wired in Layout (app-wide) not per-page — reminders can fire while user is on any page
- Imminent toast: 8s warning. Overdue toast: 10s error. Delivery-failed: 15s persistent error
- Optimistic updates use snapshot-and-rollback pattern (same as TanStack Query docs)
- Error toasts use getGlobalToast() for non-React context compatibility
- Condition chip shows emailMittente inline for email-based conditions

## Blockers / Notes
- Pre-existing label-store test type errors from another branch — not related to S03 work
- User requested: "on telegram settings, add link not only QR code" — not in S03 scope, backlog item

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Production: ⏳ pending push + deploy validation
