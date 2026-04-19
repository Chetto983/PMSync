---
phase: 157-scale-to-1000-users
plan: 01
subsystem: infra
tags: [googleapis, google-auth-library, gmail, calendar, people, scoped-packages, bundle-size, cjs]

requires:
  - phase: 146
    provides: Baseline backend topology (Railway, Dockerfile, module toggles). Migration is backend-only and reversible.

provides:
  - Googleapis monolith (195 MB) removed from backend; replaced with scoped @googleapis/{gmail,calendar,people} (2.6 MB total)
  - OAuth2Client from google-auth-library used directly (no change to token flow)
  - `as any` casts on `auth:` arguments dropped in google-oauth.service.ts and gmail-client-manager.service.ts
  - Simplified field type in google.driver.ts: `InstanceType<typeof google.auth.OAuth2>` -> `OAuth2Client`
  - -192 MB per-replica node_modules footprint; reduces Railway cold-start + image pull time

affects:
  - 157-02 (tenantCounters quick wins — shares the backend Docker image baseline)
  - 157-03 (Artillery load-test rig — baseline now measured on the thinner topology)
  - 157-04 (load-test execution — image size drop benefits every replica)
  - Future Google API call sites — must use scoped @googleapis/* imports going forward, never `googleapis`

tech-stack:
  added:
    - "@googleapis/gmail@^16.1.1"
    - "@googleapis/calendar@^14.2.0"
    - "@googleapis/people@^7.0.1"
  removed:
    - "googleapis@^171.4.0"
  patterns:
    - "Scoped package import convention: `import { gmail as gmailFactory, gmail_v1 } from '@googleapis/gmail'` (alias to avoid shadowing `gmail` local variable)"
    - "OAuth2Client construction: `new OAuth2Client()` from `google-auth-library` replaces `new google.auth.OAuth2()` everywhere"
    - "No `as any` cast on scoped-package `auth:` argument — scoped factories accept OAuth2Client natively"

key-files:
  modified:
    - backend/package.json
    - backend/package-lock.json
    - backend/src/modules/email/services/email-fetch.service.ts
    - backend/src/modules/email/services/gmail-sync-back.service.ts
    - backend/src/modules/email/services/attachment-on-demand.service.ts
    - backend/src/modules/email-sync/drivers/google/google.driver.ts
    - backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts
    - backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts
    - backend/src/modules/email-sync/drivers/google/services/gmail-sync.service.ts
    - backend/src/modules/email-sync/services/gmail-webhook.service.ts
    - backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts
    - backend/src/modules/providers/services/gmail-client-manager.service.ts
    - backend/src/modules/providers/services/google-oauth.service.ts
    - backend/src/modules/calendar/services/calendar-list.service.ts
    - backend/src/modules/calendar/services/calendar-events.service.ts
    - backend/src/modules/calendar/services/google-calendar-sync.service.ts
    - backend/src/modules/calendar/services/google-calendar-webhook.service.ts
    - backend/src/modules/contacts/services/google-contacts-sync.service.ts

key-decisions:
  - "Scoped packages over tree-shaking: CommonJS target (tsconfig.json module=commonjs) blocks tree-shaking, so scoped @googleapis/* is the only viable mechanism to shrink the runtime footprint."
  - "Alias the factory export (`gmail as gmailFactory`, `calendar as calendarFactory`, `people as peopleFactory`) on import to avoid shadowing the downstream local variable named `gmail` / `calendar` / `people`."
  - "Drop `auth as any` casts: scoped packages' `auth:` argument accepts `OAuth2Client` directly. Removing the cast is a code-hygiene win and was safe across all six call sites in google-oauth.service.ts (plus one in gmail-client-manager.service.ts)."
  - "Side-by-side install first, uninstall googleapis LAST (Task 7). Prevents mid-migration build breakage on any remaining unmigrated import."

patterns-established:
  - "Scoped Google API import: `import { X as XFactory, X_vN } from '@googleapis/X'` + `import { OAuth2Client } from 'google-auth-library'`"
  - "Stateful OAuth2Client field type: `private oauth2Client: OAuth2Client | null = null;` (no `InstanceType<typeof ...>` wrapper needed anymore)"

requirements-completed: [SCALE-01]

duration: 42min
completed: 2026-04-19
---

# Phase 157 Plan 01: googleapis -> scoped @googleapis/* Migration Summary

**Monolithic googleapis (195 MB, CommonJS-pinned) replaced with @googleapis/{gmail,calendar,people} (2.6 MB total) + google-auth-library OAuth2Client across 16 backend source files; 192 MB per-replica footprint reduction.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-04-19T13:11:24Z (approximate — worktree reset)
- **Completed:** 2026-04-19T13:53Z
- **Tasks:** 7 (all complete)
- **Files modified:** 18 (16 source files + package.json + package-lock.json)

## Accomplishments

- Zero `from 'googleapis'` imports remain in `backend/src` (16 files migrated)
- Zero dynamic `require('googleapis')` calls in `backend/src`
- Zero `google.auth.OAuth2(...)` / `google.gmail(...)` / `google.calendar(...)` / `google.people(...)` factory calls in `backend/src`
- `backend/package.json` dependencies: googleapis removed; @googleapis/gmail@^16.1.1, @googleapis/calendar@^14.2.0, @googleapis/people@^7.0.1 added; google-auth-library@^10.5.0 unchanged
- `backend/node_modules/googleapis` removed (195 MB freed); `backend/node_modules/@googleapis/{gmail,calendar,people}` present (2.6 MB total)
- `cd backend && npx tsc --noEmit` exits 0 after every single commit (verified at task boundaries and at plan end)

## Task Commits

Each task committed atomically with `--no-verify` (parallel worktree policy):

1. **Task 1: Add scoped deps + migrate 3 types-only imports** — `578350ed` (feat)
2. **Task 2: Migrate 5 fresh-OAuth2Client Gmail files** — `204e367f` (refactor)
3. **Task 3: Migrate stateful driver + client manager** — `1f08df74` (refactor)
4. **Task 4: Migrate 4 Calendar services** — `48fe7697` (refactor)
5. **Task 5: Migrate contacts + multi-API google-oauth service** — `41fed281` (refactor)
6. **Task 6: Phase-wide verification** — no commit (verification-only; all grep gates pass, tsc clean)
7. **Task 7: Uninstall googleapis + record size delta** — `10c09b24` (feat)

**Size delta measured in Task 7:**
- Before: `backend/node_modules/googleapis` = 195 MB
- After: `backend/node_modules/@googleapis/{gmail,calendar,people}` = 2.6 MB total
- **Delta: -192 MB per replica** (within measurement tolerance of the RESEARCH.md -197 MB target; filesystem `du -sh` rounds differently than `npm view dist.unpackedSize`)

## Files Created/Modified

See `key-files.modified` in frontmatter for the complete list of 18 files.

Highlights:

- `backend/package.json` — googleapis removed; three scoped deps added alphabetically in dependencies block
- `backend/src/modules/providers/services/google-oauth.service.ts` — multi-API gate file (3 Gmail + 2 Calendar + 1 People call sites, all migrated, all `auth as any` casts dropped)
- `backend/src/modules/email-sync/drivers/google/google.driver.ts` — stateful driver, field type simplified from `InstanceType<typeof google.auth.OAuth2>` to `OAuth2Client`
- `backend/src/modules/providers/services/gmail-client-manager.service.ts` — client pool; `auth as any` cast dropped
- 13 other services — mechanical import swap + factory rename + OAuth2Client construction

## Decisions Made

See `key-decisions` in frontmatter. Summary:

1. **Scoped packages over tree-shaking.** `tsconfig.json:3 "module": "commonjs"` forbids tree-shaking; this is the only way to shrink the footprint.
2. **Alias the factory on import.** `gmail as gmailFactory` etc. avoids shadowing existing local variables.
3. **Drop `auth as any` casts.** Scoped packages type `auth:` as `OAuth2Client | ...` directly.
4. **Side-by-side install first, uninstall last.** Task 1 added scoped deps while keeping googleapis in place; Task 7 uninstalled only after Task 6 verified all imports migrated.

## Deviations from Plan

**Plan executed exactly as written.** No deviations.

**Notes on execution mechanics (not plan deviations):**

- Task 6 (`test(157-01): verify googleapis migration complete`) did not produce a commit because it is pure verification (no file edits). The plan's action block includes a commit message template but the verify step has no edited files. Recording this explicitly so the commit count is 6 not 7.
- Some Edit tool calls were silently bypassed by the worktree harness and did not persist to disk (tool reported success but `git diff` showed no change). Switched to Python-based in-place file rewrites via `Bash` to guarantee persistence; this was an execution-mechanics workaround, not a semantic change to the plan.

## Issues Encountered

### Jest unable to discover tests in this worktree (pre-existing infrastructure bug)

- `npx jest --listTests` returns zero matches in this worktree.
- Root cause: Jest's `testMatch` on Windows mangles the worktree absolute path `D:\MailAgent\.claude\worktrees\agent-a233d67f\backend` (the `.claude` segment is interpreted as a backslash-escape in Jest's glob, producing a path like `D:/MailAgent\.claude/...` that matches 0 of 944 spec files).
- This is NOT a migration-induced regression — it affects every `.spec.ts` including the pre-existing `test/setup.ts`, `csrf-error.spec.ts`, etc.
- **Mitigation:** the google-oauth.service.spec.ts file was inspected via `Grep` and contains no `jest.mock('googleapis', ...)` — the sole `googleapis` reference is the literal URL `https://oauth2.googleapis.com/revoke` at line 152 (OAuth revoke endpoint, not a package import) and a code comment at line 219. No test file required migration.
- **Verification path instead of Jest:** `cd backend && npx tsc --noEmit` exits 0 (structural type-check covers the spec file too), and every call site was inspected manually against plan line numbers.

### Windows line-ending churn during bulk edits

- Initial `sed -i` edits converted CRLF -> LF on 3 files in Task 1. Switched to a Python script that detects and preserves CRLF/LF per file for Tasks 2-5.
- git will normalize on commit via `autocrlf`; the three Task 1 files show `warning: LF will be replaced by CRLF the next time Git touches it` but commit cleanly.
- No functional impact.

## User Setup Required

None — no external service configuration required. `npm install` after pulling this plan will install the scoped packages automatically; `googleapis` is removed from the dep tree. Deploy pipeline unchanged (Railway Dockerfile.railway does `npm ci` which honors the updated lockfile).

## Next Phase Readiness

**Ready:**
- Plan 02 (SCALE-02: tenantCounters LRU bound) can run in parallel in Wave 2 — touches `attachment-metrics.service.ts`, independent of this plan's surface.
- Plan 03 (SCALE-04: Artillery load-test rig) can run in parallel — independent infra.
- Plan 04 (load-test execution against the thinner topology) benefits from the -192 MB drop per replica.

**Blockers identified:**
- Jest cannot run in this worktree due to the Windows `.claude` path bug. Recommend the orchestrator run any post-wave Jest regression from the main checkout (not a worktree) or rename worktree parents to avoid dotted paths. Not a release blocker — `tsc --noEmit` covers structural guarantees.

---

## Self-Check

### Created/modified files exist (file-level probes)

- FOUND: `backend/package.json` (no googleapis entry; 3 scoped deps present)
- FOUND: `backend/src/modules/email/services/email-fetch.service.ts` (imports `@googleapis/gmail` + `google-auth-library`)
- FOUND: `backend/src/modules/email/services/gmail-sync-back.service.ts`
- FOUND: `backend/src/modules/email/services/attachment-on-demand.service.ts`
- FOUND: `backend/src/modules/email-sync/drivers/google/google.driver.ts` (field type = `OAuth2Client | null`)
- FOUND: `backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts`
- FOUND: `backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts`
- FOUND: `backend/src/modules/email-sync/drivers/google/services/gmail-sync.service.ts`
- FOUND: `backend/src/modules/email-sync/services/gmail-webhook.service.ts`
- FOUND: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`
- FOUND: `backend/src/modules/providers/services/gmail-client-manager.service.ts` (no `as any` cast on `auth:`)
- FOUND: `backend/src/modules/providers/services/google-oauth.service.ts` (all 3 scoped imports, no `as any`)
- FOUND: `backend/src/modules/calendar/services/calendar-list.service.ts`
- FOUND: `backend/src/modules/calendar/services/calendar-events.service.ts`
- FOUND: `backend/src/modules/calendar/services/google-calendar-sync.service.ts`
- FOUND: `backend/src/modules/calendar/services/google-calendar-webhook.service.ts`
- FOUND: `backend/src/modules/contacts/services/google-contacts-sync.service.ts`

### Commits exist (git log probe)

- FOUND: `578350ed` (Task 1)
- FOUND: `204e367f` (Task 2)
- FOUND: `1f08df74` (Task 3)
- FOUND: `48fe7697` (Task 4)
- FOUND: `41fed281` (Task 5)
- FOUND: `10c09b24` (Task 7)
- N/A:    Task 6 has no commit (verification-only task; plan's commit message was a template)

### Plan acceptance criteria (verification-hints from orchestrator prompt)

- `grep -r "from 'googleapis'" backend/src` returns **zero** matches (verified via `find ... -exec grep -l ...`)
- `grep -r "require('googleapis')" backend/src` returns **zero** matches
- `grep -rnE "\bgoogle\.(auth\.OAuth2|gmail|calendar|people)\(" backend/src` returns **zero** matches
- `backend/package.json` dependencies: **no** `googleapis` key; **has** `@googleapis/gmail`, `@googleapis/calendar`, `@googleapis/people`, `google-auth-library`
- `cd backend && npx tsc --noEmit` exits **0** (verified after every task + at plan end)
- `cd backend && npx jest google-oauth.service.spec.ts` — **NOT RUN** due to pre-existing Jest+worktree+Windows path bug (see Issues Encountered). Inspected spec manually: no `jest.mock('googleapis')` or equivalent — no spec update required.
- `ls backend/node_modules/googleapis` — **absent** (correctly removed)
- `ls backend/node_modules/@googleapis/gmail` — **present** (confirmed for calendar and people as well)

## Self-Check: PASSED

All 16 source files migrated; all 3 grep gates green; tsc clean; uninstall successful; node_modules footprint reduced by 192 MB per replica. The one verification item I could not run (Jest) is blocked by a pre-existing worktree path infrastructure bug that is unrelated to this migration; the affected spec file contains no googleapis imports or mocks and therefore did not require any code change for this plan.

---
*Phase: 157-scale-to-1000-users*
*Completed: 2026-04-19*
