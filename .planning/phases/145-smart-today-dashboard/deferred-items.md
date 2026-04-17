# Phase 145 — Deferred Items

Pre-existing issues discovered during execution that are out of scope for this phase. Each item is logged here so it surfaces in future cleanup phases without blocking current work.

## Pre-existing backend lint issues (logged from Plan 01 lint:win run)

`npm run lint:win` (backend) reports 19 errors + 55 warnings on existing files. None are in `backend/src/modules/dashboard/**` — all are pre-existing problems on unrelated modules. Logging here so a future hardening phase can clear them.

Notable error clusters:

- `src/modules/telegram/utils/tool-preview.ts` — 5 `@typescript-eslint/no-base-to-string` errors (string interpolation of unknown types).
- `src/modules/telegram/services/telegram-webhook.service.ts:334` — `@typescript-eslint/no-floating-promises`.
- `src/modules/push/push-dispatch.worker.ts:52` — unused `category` variable.
- `src/modules/reminder/services/reminder-alert-scheduler.service.ts:15` — unused `forwardRef` import.
- `src/modules/reminder/services/reminder-unified.service.ts:6` — unused `ReminderStatus` import.
- `src/modules/reminder/services/__tests__/reminder-alert-scheduler.service.spec.ts:13` — unused `MS_24H` constant.
- `src/modules/telegram/services/telegram-bot.service.ts:157` — unused `monitorCount`.
- `src/prisma/encryption/field-encryption.utils.ts:1` — unused `createHash` import.

Action: revisit in a dedicated lint-cleanup plan; do not include in any feature phase per CLAUDE.md scope-control rule.

## Pre-existing frontend lint issues (logged from Plan 02 npm run lint)

`cd frontend && npm run lint` reports 121 errors + 64 warnings, none in Phase 145 Plan 02 files.
The Plan 02 files (components/dashboard/today/, hooks/queries/use-today.ts, lib/api/dashboard.ts,
stores/today-feed-store.ts) lint cleanly except for 9 `@typescript-eslint/no-explicit-any` warnings
in test mock typings — acceptable for test-double signatures.

Notable pre-existing error clusters (out of scope):

- `pages/dashboard/email.tsx:460` — `react-hooks/set-state-in-effect` (cascading render anti-pattern).
- `src/components/chat/HitlApprovalCard.tsx:130` — `react-hooks/purity` on `Date.now()` in `useRef`.
- `src/components/chat/tool-uis/FallbackToolUI.tsx:58` — `react-hooks/rules-of-hooks` (conditional hook).
- `src/components/triage/LaneTabBar.tsx:34` — unused `useTranslationsHelper`.
- `sw.ts` (multiple) — `no-console` warnings.
- `src/components/crm/tickets/TicketsListPanel.tsx:123` — `react-hooks/purity` on `Date.now()`.

Action: address in a dedicated frontend lint-cleanup phase. Plan 02 introduces zero new lint errors.

