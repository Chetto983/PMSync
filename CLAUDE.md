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

**Backend** (`backend/`): NestJS 11, Prisma + PostgreSQL, BullMQ + Redis, Mistral AI + pgvector, Socket.IO
**Frontend** (`frontend/`): Next.js 16 + React 19, TanStack Query + Zustand, MUI (no Tailwind utilities)

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

**Prisma retry:** Handle P2002 (unique constraint) and P2034 (deadlock) with exponential backoff.

**Embeddings:** Always use indexed FK fields (`emailId`, `contactId`), NEVER JSONB metadata path queries.

**Email consolidation:** Before any email module changes, read `backend/docs/EMAIL_CONSOLIDATION_ENTRY.md` first. Never proceed to next phase until current phase test passes.

**Reference:** See `docs/CLAUDE_REFERENCE.md` for utils locations, test commands, race condition fixes, and RAG architecture.

## Architecture Context

See `docs/technical_overview.md` for full architecture.
See `docs/AUDIT.md` for security audit and remediation roadmap.

Key caveats:
- Auth is dual-stack: `better-auth` sessions (active) + legacy JWT (transition). Don't assume JWT is removed.
- AI HITL approval is inconsistent. Some mutating tools bypass approval.
- Authorization is coarse RBAC, not enterprise ABAC.

## Final Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless absolutely necessary. Prefer editing existing files.
NEVER proactively create documentation files unless explicitly requested.
Never save working files, text/mds, or tests to the root folder.
