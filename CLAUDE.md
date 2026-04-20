# PMSync - Claude Code Instructions

Be critical, sincere, and cynical. Don't please me.

## Behavioral Rules

**Core Protocol:**
- NEVER SUPPOSE. If uncertain about code behavior, API contract, or module wiring, STOP and ASK.
- READ BEFORE EDIT. Always read the file before modifying. If you haven't read it in your last 5 messages, re-read (staleness guard).
- THINK BEFORE TRANSITION. Before switching from research to editing, pause and state your plan. No premature implementation.
- TRACE THE CHAIN. Before wiring anything: Module > Provider > Import > Usage.
- DEBUG-FIRST. When investigating bugs: check logs/errors > check network > THEN read source code.
- FOLLOW EXISTING PATTERNS. Never invent new approaches when codebase patterns exist.
- INFORMATION TRUST HIERARCHY. Existing codebase > API docs/Swagger > web search > internal knowledge. Never hallucinate APIs.
- VERIFY PREREQUISITES. Before building features on external services (Supabase, Redis, SMTP, OAuth), verify the service is configured.

**Hard Stops:**
- 3-STRIKE RULE. Do NOT retry the same failing approach more than 3 times. On 3rd failure, STOP and ask.
- NEVER MODIFY TESTS TO MAKE THEM PASS. Unless the task explicitly asks. Fix the code, not the tests.
- NEVER GUESS PARAMETERS. If a parameter depends on a previous call's output, execute sequentially.
- DON'T RE-READ CONTEXT. Before using Read, check if contents were already provided. Don't waste tokens.
- SCOPE CONTROL. Do exactly what was asked. Never add unrequested features, refactors, or improvements.
- **NEVER RUN `prisma db push` OR ANY DESTRUCTIVE DB COMMAND.** Production was wiped by this exact class of mistake TWICE: **2026-04-01** and **2026-04-20**. Both wipes cost real user data (tenants, emails, tasks, chat history, labels, feedback). For schema changes: create a Prisma migration with `npx prisma migrate dev --name <name>`, commit the migration file, and let Railway's deploy pipeline apply it. NEVER use `prisma db push`, `prisma migrate reset`, `prisma migrate dev` (against prod), `prisma db seed` (against prod), or any direct `TRUNCATE`/`DELETE FROM`. If a migration would be destructive (drop column, drop table), STOP and ASK before proceeding.

**DB Safety (HARD RULES — two wipes already: 2026-04-01 + 2026-04-20):**

The loaded gun: `backend/.env` DATABASE_URL points at Railway **production** (`ballast.proxy.rlwy.net:39634/railway`). Any `npx prisma *` run from this directory hits prod unless the env is overridden. Muscle-memory commands have now cost real user data twice.

Before running ANY `npx prisma` command (even "safe" ones like `generate`, `validate`, `format`), the working agent MUST:

1. Print the target host: `node -e "require('dotenv').config(); console.log(new URL(process.env.DATABASE_URL).host)"` (from `backend/`).
2. If the host contains `ballast.proxy.rlwy.net`, `railway.app`, `rlwy.net`, or any other production identifier — **STOP and ASK** before running the command, even for read-only operations.
3. For migrations: only `npx prisma migrate dev --name <name>` is allowed, and only against a LOCAL dev DB. Commit the migration file. Railway's build pipeline applies it via `prisma migrate deploy` on push (non-destructive).
4. `backend/entrypoint.sh` contains an `else` branch that runs `prisma db push --skip-generate` + `prisma db seed` — both destructive. It is not the Docker entrypoint (Dockerfile.railway CMD is the entrypoint), but the file is a loaded gun for anyone invoking it manually or via CI. Treat entrypoint.sh as if it is broken until explicitly fixed.
5. Seeds: `prisma db seed` is NEVER run against prod. The seed script's Default Tenant + 3 seed users are for local dev only. If you see `Default Tenant` appearing on prod, a destructive command ran.
6. **BACKUP BEFORE TOUCH (added 2026-04-20 after 2nd wipe + user recovery):** Before ANY mutating operation against prod — row-level updates, single inserts, small Prisma upserts, however small — take a Railway Postgres backup first (Railway dashboard → Postgres service → Backups → "Backup now", or `pg_dump` via Railway CLI) and confirm the backup timestamp with the user before proceeding. Read-only SELECTs do not require a backup; the rule is mutations only. If no backup mechanism is available, STOP and ask the user to accept the risk explicitly.

**Git push discipline (added 2026-04-20 after auto-push surprised the user):**

- NEVER run `git push`, `git push --force`, or any remote-mutating git command unless the user explicitly requested it in the current turn. A previous approval does not carry over.
- If commits need to ship, tell the user and let them push.
- Before a GSD workflow (planner, executor, researcher) spawns subagents that might push: surface the push behavior to the user and get explicit confirmation.
- Each push to `origin/main` triggers a Railway deploy, which restarts the backend (drops WebSockets, cancels in-flight work). 18 pushes in a session = 18 prod redeploys. Don't.

**Post-Edit Validation (MANDATORY):**
After EVERY file edit, run the appropriate validation. No exceptions:
- Frontend: `cd frontend && npx tsc --noEmit` (type-check)
- Backend: `cd backend && npx tsc --noEmit` (type-check)
- If lint is relevant: `npm run lint:win`
- Fix issues before moving on. Do not leave broken code behind.

**Discussion-First Default:**
If the request contains no explicit action verb (implement, create, fix, add, remove, refactor, delete, build, write, move, rename), discuss the approach first and ask before writing code.

**Self-Correction:**
If you violated any protocol in a previous turn, self-correct IMMEDIATELY:
- Edited without reading? Read now and verify.
- Retried 3+ times? Stop and ask.
- Modified tests to pass? Revert and fix code.
- Guessed parameter values? Re-execute with correct values.

## Execution Rules

**Batch everything in single messages:**
- TodoWrite: batch ALL todos in ONE call
- Agent tool: spawn ALL agents in ONE message
- File operations: batch ALL reads/writes/edits in ONE message
- Bash commands: batch ALL terminal operations in ONE message

**File Organization:**
- NEVER save working files, docs, or tests to root. Use `docs/`, `tests/`, `scripts/`, `src/`.
- Max 500 lines per file. No exceptions.
- Never hardcode secrets.

**Memory-First Mandate:**
Before starting any task, check for prior solutions:
1. Check auto-memory files in the memory directory
2. Search episodic memory: `episodic-memory:search-conversations`
3. Search git history: `git log --all -S "keyword" --oneline`
4. Only then start fresh research

**Memory Storage:**
Store in ReasoningBank after fixing complex bugs, creating reusable components, or discovering patterns:
```bash
npx claude-flow memory store <key> '<json>' --namespace pmsync
npx claude-flow memory query "<search>" --namespace pmsync
```

## Tech Stack

**Backend** (`backend/`): NestJS 11, Prisma 7 + PostgreSQL, BullMQ + Redis, AI SDK v6 (`ai`) via OpenRouter/Mistral providers + pgvector, Socket.IO, `better-auth` (sessions-only; JWT fully removed 2026-04)
**Frontend** (`frontend/`): Next.js 16 + React 19, TanStack Query v5 + Zustand, MUI v7 (no Tailwind utilities), `@assistant-ui/react` + AI SDK v6

**Commands:**
```bash
# Backend (from backend/)
npm run start:dev          # Dev server
npx tsc --noEmit           # Type check
npm run lint:win           # Lint (Windows)
npx prisma generate        # Generate Prisma client

# Frontend (from frontend/)
npm run dev                # Dev server (port 3001)
npm run type-check         # TypeScript check
```

## Frontend Procedure

**Before writing any React component, do these in order:**

1. **Translations** - Add strings to `frontend/locales/en.ts` and `it.ts`, types to `index.ts`. NEVER hardcode strings.
2. **Query Hooks** - Create in `frontend/hooks/queries/use-*.ts` with `queryOptions()`. Export from `index.ts`.
3. **Component** - Use translations + query hooks. Handle loading/error/empty states.
4. **Validate** - Run type-check and lint.

**Anti-patterns:**
- Raw `apiClient.get()` in components. Use TanStack Query hooks wrapping API modules in `frontend/lib/api/*.ts`.
- Hardcoded strings. Use `t.section.key`.
- Missing loading states. Always show Skeleton, then error Alert, then empty state, then data.
- Hardcoded colors/CSS. Use MUI theme `sx` props only.
- Inventing endpoints. Use existing API modules. Only check Swagger (`localhost:3000/api/docs-json`) for NEW endpoints.

**Performance:** Critical widgets load immediately. Non-critical use `React.lazy` + `Suspense` with skeleton fallback. TanStack Query: `staleTime: 5min`, `gcTime: 30min`, `retry: 1`.

**Reference:** See `docs/CLAUDE_REFERENCE.md` for component template, API module table, file organization, and UI patterns.

## Backend Procedure

**Multi-tenant rule:** Every query MUST include `tenantId`. Never query without tenant filter.
```typescript
// CORRECT
await prisma.email.findMany({ where: { tenantId, ... } });
// WRONG - security vulnerability
await prisma.email.findMany({ where: { ... } });
```

**Provider pattern:** Interface > Factory > Implementation (`IEmailDriver > EmailDriverFactory > GoogleDriver`).

**Prisma schema changes (MANDATORY migration workflow):**
1. Edit `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <descriptive-name>` locally — this creates a migration SQL file
3. Review the generated SQL in `backend/prisma/migrations/` — if it contains DROP statements, STOP and ASK
4. Run `npx prisma generate` to update the client
5. Commit the migration file + schema together
6. Railway's deploy pipeline applies the migration on deploy
7. **FORBIDDEN:** `prisma db push`, `prisma migrate reset`, or any direct DB command against production

**Prisma retry:** Handle P2002 (unique constraint) and P2034 (deadlock) with exponential backoff.

**Embeddings:** Always use indexed FK fields (`emailId`, `contactId`), NEVER JSONB metadata path queries.

**Email/Label audit:** Active audit roadmap at `email-label-audit/` (Phase 4 Sprint 09 pending). Use the `/email-label-sprint-executor` skill for sprint work. Never proceed to next sprint until the current sprint's tests pass.

**Reference:** See `docs/CLAUDE_REFERENCE.md` for utils locations, test commands, race condition fixes, and RAG architecture.

## Architecture Context

See `docs/technical_overview.md` for full architecture.
See `docs/AUDIT.md` for security audit and remediation roadmap.

Key caveats (current as of 2026-04):

- Auth: `better-auth` sessions only. Legacy JWT fully removed — do not reintroduce JWT code paths.
- AI HITL: hardened in the 2026-04-01 AI Features Audit (closed at 9.3/10). DLQ admin endpoints + 7d retention are live. Treat HITL as the contract; if you see a mutating tool without explicit approval wiring, that's a regression — stop and ask.
- Authorization is coarse RBAC, not enterprise ABAC. Expect gaps on per-resource policies.
- `docs/AUDIT.md` is dated 2026-03-09 and pre-dates several closed audits (AI, Calendar/Contacts, CRM Phase 3). Trust memory entries + live code over that doc for current-state questions.
- **Production DB wipe — 2026-04-20 09:06:10 UTC.** Second wipe in 20 days. Root cause: `backend/.env` DATABASE_URL points at Railway prod, and some command (likely `prisma db seed` or `prisma db push`) ran against it from a local/agent shell. Tenant `cmngk6g1j000001pbf8xh2b3h` + user `N2yTFNmu3YAOJOYdY2wSs4guBtbHCr3l` destroyed along with tasks, chat history, user labels, feedback, triage overrides. Current state: 274 emails resynced from Gmail/Outlook, 540 contacts, 810 graph edges rebuilt post-wipe. 233 ai_run_ledger rows relinked from old tenant → new tenant `cmo765ze3000001o7dyqtk1e9`. Treat the DB Safety section as non-negotiable until `backend/.env` is separated from prod.

## Final Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless absolutely necessary. Prefer editing existing files.
NEVER proactively create documentation files unless explicitly requested.
Never save working files, text/mds, or tests to the root folder.
