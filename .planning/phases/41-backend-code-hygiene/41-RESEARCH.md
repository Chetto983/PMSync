# Phase 41: Backend Code Hygiene - Research

**Researched:** 2026-03-04
**Domain:** NestJS backend code quality / tech debt closure
**Confidence:** HIGH

## Summary

Phase 41 addresses 4 discrete code quality issues flagged by the v4.0 milestone re-audit. All issues are well-scoped, surgical edits with no cross-cutting architectural changes. The fixes span: (1) eliminating a `new TenantKeyService()` double-instantiation in PrismaService, (2) scoping GDPR purge to event payload userId, (3) aligning AiRunLedger migration with Prisma toolchain, and (4) removing dead scaffolding (3 items).

Every issue has been source-verified against the actual codebase. No library upgrades, no new dependencies, no schema changes required. This is pure refactoring and dead code removal.

**Primary recommendation:** Execute all 4 fixes in a single plan. Each fix is independent and touches different files. Total scope is approximately 8-12 file edits.

## Issue 1: TenantKeyService Double-Instantiation

### Current State
- `backend/src/prisma/prisma.service.ts` line 19: `new TenantKeyService()` in constructor
- `backend/src/prisma/prisma.module.ts` line 8: `TenantKeyService` registered as DI provider
- Result: two independent instances -- one manual (PrismaService constructor), one via NestJS DI

### Why It Matters
Both instances are deterministic (stateless key derivation from env config), so behavior is correct today. But it violates DI principles, doubles memory for key caches, and will cause bugs if TenantKeyService ever gains stateful dependencies.

### The Problem
PrismaService extends PrismaClient and calls `super()` in its constructor. The `$extends()` call for field encryption needs TenantKeyService callbacks immediately during construction -- before NestJS DI can inject anything. PrismaClient constructors are synchronous, so you cannot use `@Inject()` in the constructor.

### Fix Strategy
**Option A (recommended): Inject TenantKeyService and apply extension in `onModuleInit()`.**
PrismaService already implements `OnModuleInit`. Move the `$extends()` call from `constructor()` to `onModuleInit()` where DI is fully resolved. The `@Inject()` TenantKeyService is available by that point.

Key concern: Does `$extends()` work after `$connect()`? Yes -- Prisma's `$extends` returns a new client proxy; it works at any point. But the order matters: apply extension BEFORE `$connect()` so the first queries already use encryption.

```typescript
// In onModuleInit():
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(
    @Inject(TenantKeyService) private readonly tenantKeyService: TenantKeyService,
  ) {
    super({ adapter: createPrismaAdapter() });
  }

  async onModuleInit() {
    if (this.tenantKeyService.isEnabled) {
      const extended = this.$extends(
        createFieldEncryptionExtension(
          (tenantId) => this.tenantKeyService.getCurrentKey(tenantId),
          (tenantId) => this.tenantKeyService.getDecryptionKeys(tenantId),
          (tenantId) => this.tenantKeyService.getHmacKey(tenantId),
        ),
      );
      Object.assign(this, extended);
      this.logger.log('Field encryption extension applied');
    }
    await this.$connect();
    this.logger.log('Prisma connected to database');
  }
}
```

**Confidence:** HIGH -- PrismaService already has onModuleInit, TenantKeyService is already in PrismaModule providers.

### Files Affected
- `backend/src/prisma/prisma.service.ts` -- refactor constructor, move extension to onModuleInit
- `backend/src/prisma/prisma.module.ts` -- no change needed (TenantKeyService already provided)

### Scripts That Use `new TenantKeyService()` -- DO NOT TOUCH
- `backend/src/scripts/backfill-from-hash.ts` line 150 -- standalone script, no DI container
- `backend/src/scripts/backfill-encryption.ts` line 159 -- standalone script, no DI container
- `backend/src/common/services/__tests__/tenant-key.service.spec.ts` line 18 -- unit test

These are correct uses of manual instantiation (no NestJS context available).

## Issue 2: GDPR purgeExpiredDeletions() Scoping

### Current State
- `GdprEventHandlerService.handleDeletionExpired(event)` receives a `DeletionExpiredEvent` with `tenantId` and `userId`
- But calls `this.accountDeletionService.purgeExpiredDeletions()` which is a GLOBAL purge (finds ALL expired users across ALL tenants)
- The event payload is ignored for scoping

### Why It Matters
When a single user's deletion expires, the handler purges ALL expired users globally. This is semantically wrong -- event-driven systems should scope to the event payload. It also creates unnecessary load and potential race conditions with the daily cron that calls the same method.

### Fix Strategy
Add a `purgeUser(userId: string, tenantId: string)` method to `AccountDeletionService` that deletes a single user. The event handler should call this targeted method instead.

```typescript
// AccountDeletionService -- new method
async purgeUserDeletion(userId: string, tenantId: string): Promise<boolean> {
  const user = await this.prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: { not: null } },
    select: { id: true, deletedAt: true, tenantId: true },
  });
  if (!user) return false;

  const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);
  if (user.deletedAt! > cutoff) {
    this.logger.debug(`User ${userId} deletion not yet expired, skipping`);
    return false;
  }

  return this.hardDeleteUser(userId, tenantId);
}

// GdprEventHandlerService -- change call
await this.accountDeletionService.purgeUserDeletion(event.userId, event.tenantId);
```

The existing `purgeExpiredDeletions()` stays untouched -- it is still called by the daily cron in `DataCleanupService`.

**Confidence:** HIGH -- straightforward single-user scoping.

### Files Affected
- `backend/src/modules/compliance/services/account-deletion.service.ts` -- add `purgeUserDeletion()` method
- `backend/src/modules/compliance/services/gdpr-event-handler.service.ts` -- call `purgeUserDeletion()` instead of `purgeExpiredDeletions()`

## Issue 3: AiRunLedger Migration Alignment

### Current State
- `AiRunLedger` model exists in `prisma/schema.prisma` (line ~1465)
- The CREATE TABLE is in `prisma/migrations/0_baseline/migration.sql` (the baseline migration)
- STATE.md decision [31-02]: "AiRunLedger applied via direct SQL due to pre-existing Prisma migration history drift"
- `prisma migrate status` reports: "Database schema is up to date!" (2 migrations: 0_baseline + 20260304_add_from_hash)

### Analysis
The baseline migration (0_baseline) already contains the AiRunLedger table DDL. Prisma considers the schema fully migrated. The "direct SQL drift" was the initial application method, but it was subsequently captured in the baseline.

**This issue may already be resolved.** The fact that `prisma migrate status` shows "up to date" means the schema and migration history are aligned. The original debt was about HOW the table was created (manual SQL vs prisma migrate), but the baseline migration now captures it.

### Fix Strategy
Verify alignment is clean:
1. Run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` to confirm zero drift
2. If drift exists, create a proper migration: `npx prisma migrate dev --name align_ai_run_ledger`
3. If no drift, document that the baseline resolved this and close the item

**Confidence:** HIGH -- `prisma migrate status` already reports no drift.

### Files Affected
- Potentially `backend/prisma/migrations/` -- only if drift is detected (unlikely)
- No source code changes expected

## Issue 4: Dead Scaffolding Removal (3 Items)

### 4a. ISyncAuthService / SYNC_AUTH_SERVICE

**Files:**
- `backend/src/common/interfaces/sync-auth.interface.ts` -- the entire file (interface + symbol)
- `backend/src/common/interfaces/index.ts` -- lines 3-4 (re-export)

**Status:** Interface defined in Phase 31 as "Contract only. Implementation in Phase 32." Phase 32 used different patterns (ProviderConnectedEvent + forwardRef). Zero `@Inject(SYNC_AUTH_SERVICE)` anywhere. Zero implementors. Pure dead scaffolding.

**Action:** Delete `sync-auth.interface.ts`, remove re-exports from `index.ts`.

### 4b. CalendarIcsDetectedEvent

**Files:**
- `backend/src/common/events/calendar.events.ts` -- the entire file
- `backend/src/common/events/index.ts` -- line 4 (re-export)

**Status:** Defined in Phase 31 as scaffolding. STATE.md [32-03]: "CalendarIcsDetectedEvent is scaffolding-only; emit added when ICS detection is built." Zero emitters in codebase. Zero `@OnEvent('calendar.ics-detected')` handlers. Only reference outside definition is in `event-wiring.spec.ts` test.

**Action:** Delete `calendar.events.ts`, remove re-export from `index.ts`, remove test case from `event-wiring.spec.ts`.

### 4c. PROVIDER_TOKEN_SERVICE Comment-Only Import

**Files:**
- `backend/src/modules/providers/providers.module.ts` -- line 5 (import) + lines 28/31 (comments)

**Status:** `PROVIDER_TOKEN_SERVICE` is imported on line 5 but never used in providers array, exports array, or any `useExisting`/`provide` binding. It appears ONLY in JSDoc comments. The interface `IProviderTokenService` in `provider-token.interface.ts` has zero `@Inject` consumers anywhere in the codebase.

**Action:** Remove the import from `providers.module.ts` line 5. Clean up the JSDoc comments referencing it. The interface file itself (`provider-token.interface.ts`) and its barrel export can also be removed since there are zero consumers -- but this is optional (v4.1 scaffolding like IPolicyService). Recommend removing to be consistent with removing ISyncAuthService.

**Confidence:** HIGH -- grep confirms zero runtime consumers for all 3 items.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration drift detection | Manual SQL comparison | `prisma migrate diff` | Prisma knows its own schema state |
| Dead code detection | Manual grep guesswork | Already done via audit grep | Results verified in research |

## Common Pitfalls

### Pitfall 1: Breaking PrismaService $extends Timing
**What goes wrong:** Moving `$extends()` to `onModuleInit()` but calling `$connect()` before `$extends()` -- first queries run unencrypted.
**How to avoid:** In `onModuleInit()`, apply extension FIRST, then `$connect()`.

### Pitfall 2: Removing PROVIDER_TOKEN_SERVICE Interface File
**What goes wrong:** Removing `provider-token.interface.ts` breaks the barrel export in `interfaces/index.ts`.
**How to avoid:** Always update `index.ts` re-exports when deleting interface files.

### Pitfall 3: Forgetting to Update Event Wiring Tests
**What goes wrong:** Deleting `CalendarIcsDetectedEvent` but leaving the test in `event-wiring.spec.ts` -- test fails.
**How to avoid:** Grep for all references before deleting any exported symbol.

### Pitfall 4: PrismaService Constructor DI Timing
**What goes wrong:** Trying to `@Inject()` TenantKeyService in PrismaService constructor -- NestJS DI is not ready during `super()` call.
**How to avoid:** Use `onModuleInit()` lifecycle hook where all providers are resolved.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2 + Vitest 4.0 |
| Config file | `backend/jest.config.js` / `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx jest --passWithNoTests -t "TenantKey"` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TD-01 | TenantKeyService via DI only | unit | `cd backend && npx jest prisma.service --passWithNoTests` | No -- Wave 0 |
| TD-02 | GDPR purge scoped to userId | unit | `cd backend && npx jest account-deletion --passWithNoTests` | No -- Wave 0 |
| TD-03 | AiRunLedger migration aligned | smoke | `cd backend && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code` | N/A (CLI) |
| TD-04 | Dead scaffolding removed | smoke | `cd backend && npx tsc --noEmit` | N/A (compile check) |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && npx jest --passWithNoTests`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green + `prisma migrate diff` shows zero drift

### Wave 0 Gaps
- [ ] PrismaService unit test verifying TenantKeyService injected (not `new`-ed)
- [ ] AccountDeletionService test for `purgeUserDeletion()` single-user method
- [ ] Compile check after dead code removal (`tsc --noEmit`)

## Architecture Patterns

### NestJS Lifecycle Hooks for Late Initialization
When a service needs DI-resolved dependencies but extends a base class with a constrained constructor (like PrismaClient), use `onModuleInit()`:

```typescript
@Injectable()
export class MyService extends BaseClass implements OnModuleInit {
  constructor(@Inject(Dep) private dep: DepType) {
    super(/* base args only */);
  }
  async onModuleInit() {
    // dep is now available
    this.applyExtension(this.dep);
    await this.connect();
  }
}
```

### Event Handler Scoping Pattern
Event handlers should scope their side effects to the event payload, not perform global operations:

```typescript
// BAD: global purge ignoring event payload
@OnEvent('deletion-expired')
async handle(event: { userId: string }) {
  await this.service.purgeAllExpired(); // ignores event.userId
}

// GOOD: scoped to event payload
@OnEvent('deletion-expired')
async handle(event: { userId: string, tenantId: string }) {
  await this.service.purgeUser(event.userId, event.tenantId);
}
```

## Open Questions

1. **PROVIDER_TOKEN_SERVICE interface file -- delete or keep?**
   - The interface has zero consumers and zero implementors
   - ISyncAuthService is being deleted for the same reason
   - IPolicyService (also zero consumers) is intentionally kept as v4.1 scaffolding per [35-02]
   - Recommendation: Delete to be consistent with ISyncAuthService removal. If v4.1 needs it, recreate.
   - **LOW impact either way** -- planner's discretion

2. **DeletionExpiredEvent -- keep or remove?**
   - Currently has a consumer (GdprEventHandlerService) but no producer
   - The event + handler form a ready-made hook for future event-driven deletion
   - Recommendation: KEEP -- it will become useful when deletion cron becomes event-driven
   - Only CalendarIcsDetectedEvent (no consumer AND no producer) should be removed

## Sources

### Primary (HIGH confidence)
- Direct codebase grep and file reads -- all findings verified against actual source
- `prisma migrate status` output -- confirms migration alignment
- v4.0-MILESTONE-AUDIT.md -- defines the 4 issues

### Secondary (MEDIUM confidence)
- Prisma documentation on `$extends()` lifecycle -- verified works post-construction

## Metadata

**Confidence breakdown:**
- Issue 1 (TenantKeyService): HIGH -- code paths fully traced, fix pattern well-established
- Issue 2 (GDPR scoping): HIGH -- simple method addition, no architectural change
- Issue 3 (Migration drift): HIGH -- `prisma migrate status` confirms already aligned
- Issue 4 (Dead scaffolding): HIGH -- grep confirms zero runtime consumers

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable -- no external dependency changes)
