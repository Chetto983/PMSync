# Phase 148 — Deferred Items

Items discovered out-of-scope during execution. NOT fixed by Phase 148.

## Pre-existing Lint Errors in Frontend (logged 2026-04-20, Plan 06)

`cd frontend && npm run lint` reports **178 problems (122 errors, 56 warnings)** across files unrelated to Phase 148. Sampled offenders:

| File | Issue type |
|------|-----------|
| `frontend/src/components/chat/chat-thread-list-adapter.tsx` | `react-hooks/refs` (ref access during render at line 284), `react-hooks/exhaustive-deps` |
| `frontend/src/components/chat/tool-uis/FallbackToolUI.tsx` | `react-hooks/rules-of-hooks` (`useTranslations` called conditionally) |
| `frontend/src/components/chat/tool-uis/shared/ToolErrorBoundary.tsx` | `no-console` |
| `frontend/components/email/sidebar/LabelsSidebar.tsx` | `Compilation Skipped: Existing memoization could not be preserved` |
| `frontend/components/email/list/ThreadList.tsx` | `react-hooks/exhaustive-deps` |
| `frontend/components/triage/LaneTabBar.tsx` | unused-import |
| `frontend/sw.ts` | `no-console` (6 instances) |
| 100+ other files | mixed pre-existing |

**Why deferred:** SCOPE BOUNDARY (executor deviation rules). Plan 06 only touched `frontend/locales/{en,it,index}.ts`, `frontend/lib/api/triage-accuracy.ts`, `frontend/hooks/queries/{use-label-accuracy.ts, index.ts}`, `frontend/components/email/labels/{LabelAccuracyBadge.tsx, __tests__/LabelAccuracyBadge.test.tsx, LabelTreeItem.tsx, index.ts}`. Lint was clean for ALL of those files. The other 178 problems are pre-existing and not caused by Plan 06.

**Verification command** (filters lint output to Plan 06 files only):
```bash
cd frontend && npm run lint 2>&1 | grep -iE "label-accuracy|triage-accuracy|LabelTreeItem.tsx|locales/(en|it|index).ts"
```
Returns zero matches at Plan 06 commit time.

**Next step:** A future cleanup phase (or per-team triage sprint) should drive `npm run lint` to zero. Not a Phase 148 owner.
