---
phase: 148-label-accuracy
plan: 05
subsystem: backend/ai/triage
tags: [nestjs, controller, tenant-guard, class-validator, swagger, phase-148, wave-4, read-api]
dependency_graph:
  requires:
    - 148-01 (LabelAccuracyProfile + LabelAccuracySourceBreakdown models)
    - 148-03 (LabelAccuracyService.read signature + ReadOptions + ReadResult + AccuracyWindowKey type)
  provides:
    - TriageAccuracyController — exposes GET /api/v1/ai/triage/label-accuracy (D-09 shape)
    - GetLabelAccuracyQueryDto — class-validator DTO for `windows` + `includeBreakdown`
    - HTTP read surface that Plan 06 frontend will call via TanStack Query
  affects:
    - 148-06 (frontend consumes this endpoint via /ai/triage/label-accuracy; apiClient already prefixes /api/v1)
    - 151/152/155 (unchanged — those phases consume ACCURACY_CHANGED_TOPIC events, not this HTTP endpoint)
tech_stack:
  added: []
  patterns:
    - Cookie-session TenantGuard at class level (no RolesGuard — D-09 says every tenant member reads)
    - class-validator DTO with `@Matches` closed-enum regex (windows + includeBreakdown)
    - `class-transformer` `@Transform` converts 'true'|'false' string to boolean
    - Belt-and-braces token filter inside the controller handler (even after DTO regex) — defence in depth
    - tenantId ALWAYS sourced from `req.user.tenantId` (the Phase 147 TriageOverridesController idiom)
    - Controller annotation carries module-relative path only; global `api/v1` prefix is applied by `app.setGlobalPrefix` in main.ts (no double-prefix)
    - Plumbing spec over integration spec — overrideGuard + service-mock (W5 honesty from Phase 147 Plan 05)
key_files:
  created:
    - backend/src/modules/ai/controllers/triage-accuracy.controller.ts
    - backend/src/modules/ai/controllers/__tests__/triage-accuracy.controller.plumbing.spec.ts
  modified:
    - backend/src/modules/ai/ai.module.ts
decisions:
  - "B-3 verified: `setGlobalPrefix('api/v1'` present at backend/src/main.ts:616. Controller uses `@Controller('ai/triage')` — not `@Controller('api/v1/ai/triage')` — because the prefix is applied by the framework. Final route: `/api/v1/ai/triage/label-accuracy`."
  - "W-4 multiline-safe regex for AiModule registration gate requires `grep -z` (null-delimited). Plain `grep -qE` does not span newlines. Documented as a plan-gate quirk; the semantic intent (controller registered in the `controllers:` array) is verified both by `grep -z` passing and by `grep -c 'TriageAccuracyController' = 2` (import + controllers array entry)."
  - "JSDoc copy says 'authenticated session' rather than literal `req.user.tenantId` to keep the grep gate `grep -c 'req.user.tenantId' = 1` honest (only the actual source-code usage counts, not JSDoc references)."
  - "DTO Transform coerces `'true' | 'false'` string to boolean, but class-validator's static type inference does not always propagate that through to the property type. Added a narrow cast (`query as unknown as { includeBreakdown?: boolean }`) at the single read site — localized, documented, no transitive impact."
  - "Plumbing spec uses `overrideGuard(TenantGuard).useValue({ canActivate: () => true })` — TenantGuard is tested elsewhere (Phase 52 + Phase 147). This spec proves the controller's wiring contract, not the guard's behavior."
metrics:
  duration: ~25 min
  completed: 2026-04-20
  tasks: 2
  files: 3 (2 created, 1 modified)
  tests_added: 6
requirements_completed: [LEARN-03, OBS-01]
---

# Phase 148 Plan 05: Read API — GET /api/v1/ai/triage/label-accuracy Controller + TenantGuard + Plumbing Spec Summary

**Thin HTTP read surface for Phase 148: a single `GET /api/v1/ai/triage/label-accuracy` endpoint on a dedicated `TriageAccuracyController` that serializes `LabelAccuracyService.read` 1:1 and is guarded by cookie-session `TenantGuard` (not admin-only).**

## Final Route

- **URL:** `GET /api/v1/ai/triage/label-accuracy`
- **Derivation:** `app.setGlobalPrefix('api/v1')` (main.ts:616) + `@Controller('ai/triage')` + `@Get('label-accuracy')`.
- **Auth:** cookie session → `TenantGuard` populates `req.user.tenantId`. No `@Roles(...)` — every authenticated tenant member reads their tenant's accuracy per D-09.
- **Query params:**
  - `windows` — comma-separated subset of `'7d','30d','all'`; default all three.
  - `includeBreakdown` — `'true'` | `'false'` string; default false. Coerced to boolean at the DTO.
- **Response shape (verbatim from 148-CONTEXT.md §D-09):**
  ```ts
  {
    labels: Array<{
      labelId: string;
      labelName: string | null;
      labelSlug: string | null;
      windows: {
        '7d'?:  { precision, recall, f1, tp, fp, fn, sampleSize,
                  wilsonPrecLow, wilsonPrecHigh, wilsonRecLow, wilsonRecHigh,
                  state: 'learning' | 'ready' };
        '30d'?: { ... };
        'all'?: { ... };
      };
      triageSourceBreakdown?: {
        llm?:       { precision, recall, f1, sampleSize } | null;
        rule?:      { precision, recall, f1, sampleSize } | null;
        'llm+rule'?:{ precision, recall, f1, sampleSize } | null;
      };
      lastUpdatedAt: string | null;
    }>;
    computedAt: string;
  }
  ```

## What Was Built

### Task 1 — New `TriageAccuracyController` + DTO + AiModule registration (commit `9cb304a5`)

**`backend/src/modules/ai/controllers/triage-accuracy.controller.ts`** (125 LF):

- Class-level decorators: `@ApiTags('AI Triage Accuracy')`, `@ApiCookieAuth()`, `@Controller('ai/triage')`, `@UseGuards(TenantGuard)`, `@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))`.
- Exports `GetLabelAccuracyQueryDto`:
  - `windows?: string` guarded by `@Matches(/^(?:7d|30d|all)(?:,(?:7d|30d|all))*$/)`.
  - `includeBreakdown?: boolean` guarded by `@Matches(/^(?:true|false)$/)` + `@Transform(({ value }) => value === 'true')`.
- Endpoint `getLabelAccuracy(@Req() req, @Query() query)`:
  - Pulls `tenantId = req.user.tenantId` (NEVER from `query` / `@Body`).
  - Parses `query.windows` into `AccuracyWindowKey[]` with a defensive in-controller filter; defaults to `['7d','30d','all']` when absent.
  - Coerces `includeBreakdown` via narrow cast (`(query as unknown as { includeBreakdown?: boolean }).includeBreakdown === true`).
  - Delegates to `this.accuracy.read(tenantId, { windows, includeBreakdown })` and returns its result verbatim.

**`backend/src/modules/ai/ai.module.ts`** — two surgical edits:

- Added import: `import { TriageAccuracyController } from './controllers/triage-accuracy.controller';`
- Reformatted the `controllers:` array to multi-line and appended `TriageAccuracyController` alongside `TriageOverridesController`.

**B-3 verification:** `grep -c "setGlobalPrefix('api/v1'" backend/src/main.ts` returned `1`. No deviation; controller annotation pattern held.

### Task 2 — Plumbing spec with 6 cases (commit `eb036848`)

**`backend/src/modules/ai/controllers/__tests__/triage-accuracy.controller.plumbing.spec.ts`** (180 LF):

`TenantGuard` overridden to always pass. `LabelAccuracyService` mocked with `{ read: readMock }`. Six `it(` blocks:

1. **cold-start** — empty `{ labels: [], computedAt }` flows through unchanged; service called exactly once.
2. **populated** — realistic D-09 payload (1 label, 30d window, precision/recall/F1 + Wilson bounds + `state: 'ready'`) flows through 1:1.
3. **tenant isolation** — the spec stuffs a rogue `tenantId: 'tenant-B'` on the query DTO and asserts the controller still calls `read('tenant-A', …)` because it sources tenantId from `req.user.tenantId`. Also asserts the options object passed to the service has NO `tenantId` property (no leakage).
4. **windows parser** — `windows: '7d,all'` produces ordered `['7d','all']`.
5. **windows default** — absent `windows` → `['7d','30d','all']` passed to service.
6. **includeBreakdown passthrough** — boolean `true` forwarded to service.

6/6 tests green on `npx jest src/modules/ai/controllers/__tests__/triage-accuracy.controller.plumbing.spec.ts`.

## Success Criteria Check

| Criterion | Evidence |
|-----------|----------|
| Final route `/api/v1/ai/triage/label-accuracy` registered | `@Controller('ai/triage')` + `@Get('label-accuracy')` present |
| **B-3:** global prefix verified | `grep -c "setGlobalPrefix('api/v1'" backend/src/main.ts` returns `1` |
| TenantGuard at class level; no RolesGuard | `grep -c '@UseGuards(TenantGuard)'` = 1; `grep -c '@UseGuards.*RolesGuard'` = 0 |
| tenantId from `req.user.tenantId` only | `grep -c 'req.user.tenantId'` = 1 (single source-code reference; no JSDoc inflation) |
| No `tenantId` in query/body | `grep -cE "tenantId.*@Query\\("` = 0; `grep -c '@Body'` = 0 |
| DTO regex pattern for windows | `grep -cE "\\^\\(\\?:7d\\|30d\\|all\\)"` = 1 |
| **W-4:** AiModule registration | `grep -zqE "controllers:\\s*\\[[^]]*TriageAccuracyController" backend/src/modules/ai/ai.module.ts` exits 0 (multiline-safe with `-z`); `grep -c 'TriageAccuracyController' backend/src/modules/ai/ai.module.ts` = 2 (import + controllers array) |
| Plumbing spec named `.plumbing.spec.ts` (W5) | File exists at expected path |
| 3+ required cases (cold-start, populated, tenant isolation) | All three present; plus windows parser + default + includeBreakdown |
| Service fully mocked in spec | `useValue: { read: readMock }` = 1; `overrideGuard(TenantGuard)` = 1 |
| `cd backend && npx tsc --noEmit` exits 0 | Confirmed |
| 6 plumbing tests pass | `Tests: 6 passed, 6 total` |
| File sizes | controller=125 LF (≥ 80, ≤ 500); spec=180 LF (≥ 80, ≤ 500) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Micro-wording] Removed `req.user.tenantId` literal from JSDoc to satisfy grep gate**

- **Found during:** Task 1 acceptance-gate validation
- **Issue:** The plan's acceptance criterion `grep -c 'req.user.tenantId' … returns 1` expects exactly one occurrence — the actual source-code usage. My initial JSDoc said "tenantId is sourced exclusively from the authenticated session (`req.user.tenantId`)", which inflated the count to 2.
- **Fix:** Re-worded JSDoc to "tenantId is sourced exclusively from the authenticated session" (dropped the literal). The security semantic is unchanged — the next two sentences still clearly say NEVER from query or body, and the T-148-05-01 threat-ID is cited.
- **Files modified:** `backend/src/modules/ai/controllers/triage-accuracy.controller.ts`
- **Verification:** `grep -c 'req.user.tenantId' src/modules/ai/controllers/triage-accuracy.controller.ts` returns 1.
- **Committed in:** `9cb304a5` (Task 1 commit)

**2. [Rule 1 — Plan-gate quirk] W-4 multiline regex needs `grep -z`**

- **Found during:** Task 1 acceptance-gate validation
- **Issue:** The plan's own verification command `grep -qE "controllers:\\s*\\[[^]]*TriageAccuracyController" backend/src/modules/ai/ai.module.ts` fails on GNU grep because, without `-z` (null-delimited) or `-U --multiline` (ripgrep), the regex cannot span newlines. My multi-line `controllers: [ ... TriageAccuracyController, ]` format is the standard NestJS idiom and the only one that keeps the array readable at 7 entries.
- **Fix:** Did NOT collapse the array to a single line to game the gate. Documented the plan-gate quirk here; `grep -z` passes, and the supplementary sanity check (`grep -c 'TriageAccuracyController' = 2`) confirms both the import and the array entry exist. Semantic intent met.
- **Files modified:** none (documentation-only deviation)
- **Verification:** `grep -zqE "controllers:\\s*\\[[^]]*TriageAccuracyController" backend/src/modules/ai/ai.module.ts` exits 0.
- **Committed in:** n/a (plan gate quirk, no code change)

**3. [Rule 1 — TypeScript seam] Narrow cast for `includeBreakdown` Transform result**

- **Found during:** Task 1 tsc --noEmit pre-commit
- **Issue:** class-validator's `@Transform(({ value }) => value === 'true')` mutates the decorated property at runtime, but the property's static type in the DTO remains `boolean?` which does not always propagate from the ValidationPipe's `transform: true` output in NestJS's internal request-scoped reflection. Direct access `query.includeBreakdown` would have been fine at runtime but inconsistent typing across NestJS versions.
- **Fix:** Single narrow cast at the read site: `(query as unknown as { includeBreakdown?: boolean }).includeBreakdown === true`. Localized and documented inline. No behavioral change.
- **Files modified:** `backend/src/modules/ai/controllers/triage-accuracy.controller.ts`
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** `9cb304a5` (Task 1 commit)

---

**Total deviations:** 3 (all Rule 1 — micro-wording + plan-gate quirk + TypeScript seam). Zero scope creep. No architecture changes.

## Authentication Gates

None — Plan 05 adds HTTP surface with cookie-session auth. TenantGuard is already provisioned (Phase 52). No OAuth, no LLM, no external keys touched.

## Known Stubs

None. The controller is a pure 1:1 passthrough to `LabelAccuracyService.read`. No hardcoded placeholders, no unwired data, no "coming soon" text. The service itself may return empty `labels: []` for a cold-start tenant — that is intentional D-09 behavior (Plan 06 frontend will render the "Learning…" state per D-11 when a label has `sampleSize < 20`).

## Threat Flags

None beyond the plan's own `<threat_model>`. All 7 threats (T-148-05-01 through T-148-05-07) are mitigated:

- **T-148-05-01** (cross-tenant info disclosure): `grep -cE "tenantId.*@Query\\("` = 0. Plumbing spec case 3 asserts that even a rogue `tenantId` on the query DTO is ignored — tenantId comes from `req.user.tenantId` exclusively. `LabelAccuracyService.read` additionally filters every Prisma query by tenantId (Plan 03).
- **T-148-05-02** (session spoof): TenantGuard + better-auth session security — inherited, not in Phase 148 scope.
- **T-148-05-03** (admin-only bypass): intentionally accepted. D-09 says every tenant member reads. No `RolesGuard`, no `@Roles` decorator.
- **T-148-05-04** (unbounded response): D-09's 20 labels × 3 windows budget holds. `includeBreakdown` is opt-in. No pagination needed.
- **T-148-05-05** (windows injection): DTO `@Matches(/^(?:7d|30d|all)(?:,(?:7d|30d|all))*$/)` + belt-and-braces in-controller filter `.filter(s => s === '7d' || …)` — defence in depth.
- **T-148-05-06** (includeBreakdown injection): DTO `@Matches(/^(?:true|false)$/)` + `@Transform` to boolean. Anything else → 400.
- **T-148-05-07** (prefix drift): B-3 gate passes at execute time; `grep -c "setGlobalPrefix('api/v1'" backend/src/main.ts` returns 1. No fallback path triggered.

## Next Steps

### Notice to Plan 06 (Frontend)

- **API module target:** `/ai/triage/label-accuracy` (the frontend's `apiClient` already prefixes `/api/v1` — do NOT double it).
- **Default query:** omit both `windows` and `includeBreakdown` to get all three windows and a compact payload. The settings-page pill only needs the `30d` window, so `?windows=30d` is the minimal useful query.
- **`includeBreakdown`:** set to `'true'` only when the dashboard needs per-triageSource breakdown (Phase 155 pre-stage). Leave unset / `'false'` for the settings-page pill.
- **Response shape:** import types directly from `backend/src/modules/ai/services/label-accuracy.service.ts` (`ReadResult`, `ReadWindowCounters`) or inline them in `frontend/lib/api/triage-accuracy.ts`. Don't invent types — the D-09 shape is load-bearing across three phases (151/152/155).
- **State rendering:** each window's `state: 'learning' | 'ready'` is the D-11 threshold signal (learning when `sampleSize < 20`). Render accordingly in the pill (gray "Learning…" vs traffic-light F1).

### Phase 148 Completion

Plans 01+02+03+04+05 done. Only Plan 06 (frontend badge pill + translations + TanStack hook + `LabelTreeItem` wiring) remains. After Plan 06, Phase 148 is feature-complete: end-to-end user feedback → counter → HTTP API → settings badge pill.

### Operational step (non-plan)

Once Plan 02's Prisma migration is live on Railway, ops (Davide) runs `cd backend && npx ts-node scripts/148-backfill-label-accuracy.ts --dry-run` against prod to preview counts, then the real run per-tenant. This seeds `LabelAccuracyProfile` rows so Day-1 users see real badges instead of "Learning…" for 30 days.

## Self-Check: PASSED

Files confirmed present:

- `backend/src/modules/ai/controllers/triage-accuracy.controller.ts` — FOUND (125 LF)
- `backend/src/modules/ai/controllers/__tests__/triage-accuracy.controller.plumbing.spec.ts` — FOUND (180 LF)
- `backend/src/modules/ai/ai.module.ts` — modified (TriageAccuracyController imported + registered in `controllers:` array)

Commits confirmed in `git log`:

- `9cb304a5` feat(148-05): add TriageAccuracyController for GET /api/v1/ai/triage/label-accuracy (D-09) — FOUND
- `eb036848` test(148-05): plumbing spec for TriageAccuracyController — 6 cases — FOUND

Final gate run:

- `grep -c "setGlobalPrefix('api/v1'" backend/src/main.ts` → 1 (B-3 PASS)
- `cd backend && npx tsc --noEmit` → exit 0 (tsc PASS)
- `cd backend && npx jest src/modules/ai/controllers/__tests__/triage-accuracy.controller.plumbing.spec.ts` → 6/6 passed (jest PASS)
- `grep -c '@UseGuards(TenantGuard)' backend/src/modules/ai/controllers/triage-accuracy.controller.ts` → 1 (TenantGuard PASS)
- `grep -cE "tenantId.*@Query\\(" backend/src/modules/ai/controllers/triage-accuracy.controller.ts` → 0 (query-injection PASS)
- `grep -zqE "controllers:\\s*\\[[^]]*TriageAccuracyController" backend/src/modules/ai/ai.module.ts` → exit 0 (W-4 PASS with -z)

---

*Phase: 148-label-accuracy*
*Completed: 2026-04-20*
