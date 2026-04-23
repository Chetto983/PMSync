# Phase 149 Temporal Decay — Deferred Items

Items discovered during plan execution that are out of scope per CLAUDE.md "SCOPE CONTROL" / executor "SCOPE BOUNDARY" rules. Documented here so downstream plans / phases can pick them up.

## Plan 02 discoveries (2026-04-23)

### Pre-existing tsc error in triage-correction.service.ts

- **File:** `backend/src/modules/ai/services/triage-correction.service.ts`
- **Line (post-edit):** 57 — `signal: 'correction'` in `emailTriageFeedback.findMany({ where: { ... } })`.
- **Error:** `TS2353: Object literal may only specify known properties, and 'signal' does not exist in type 'EmailTriageFeedbackWhereInput'.`
- **Pre-existing?** Yes — verified by git-stashing my edits and re-running `tsc --noEmit`: the same error surfaces on the pristine HEAD content (line 43 before my env-read insertion shifted it to 57). My Plan 02 edits (import of `weightCorrection`/`ConfigService`, env read, helper call) introduced zero new tsc errors.
- **Likely cause:** The generated `@prisma/client` in the junctioned `node_modules` (sourced from another worktree's install) is stale vs. the current `schema.prisma` for `EmailTriageFeedback`. The `signal` column exists in the repo schema and in the seed/test fixtures but not in the generated types the worktree is linked against.
- **Out of scope for Plan 02 because:** the error is on a line I did not modify; resolving it requires a `prisma generate` run (which interacts with `backend/.env`'s DATABASE_URL — currently pointed at production per CLAUDE.md). Running `prisma generate` in this worktree would violate the DB-safety checklist without first re-pointing the env.
- **Recommended resolution path:** Run `npx prisma generate` in a worktree where `DATABASE_URL` is either unset or explicitly local (CLAUDE.md §DB-Safety step 1-2). No code change needed.

### Pre-existing tsc errors in src/test/qwen-*.ts + src/test/setup.ts

- 40+ `TS2584`/`TS2304`/`TS2307` errors in `src/test/qwen-chat-agent-e2e.test.ts`, `src/test/qwen-migration-e2e.test.ts`, `src/test/setup.ts`.
- Pre-existing — not touched by Plan 02. Missing `@types/node` references, missing `vitest`/`msw/node`/`ai`/`zod` module resolution (worktree's linked `node_modules` doesn't provide them).
- Out of scope: test files I do not touch.
