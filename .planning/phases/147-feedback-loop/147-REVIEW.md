---
phase: 147-feedback-loop
reviewed: 2026-04-19T22:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - backend/prisma/migrations/20260419120000_147_feedback_loop_signal_and_triagesource/migration.sql
  - backend/prisma/schema.prisma
  - backend/railway.toml
  - backend/src/modules/ai/ai.module.ts
  - backend/src/modules/ai/controllers/triage-overrides.controller.ts
  - backend/src/modules/ai/locales/en.ts
  - backend/src/modules/ai/locales/it.ts
  - backend/src/modules/ai/locales/types.ts
  - backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts
  - backend/src/modules/ai/services/__tests__/triage-correction.service.spec.ts
  - backend/src/modules/ai/services/__tests__/triage-feedback.service.spec.ts
  - backend/src/modules/ai/services/__tests__/triage-promotion.plumbing.spec.ts
  - backend/src/modules/ai/services/__tests__/triage-promotion.service.spec.ts
  - backend/src/modules/ai/services/__tests__/triage-prompt-budget.test.ts
  - backend/src/modules/ai/services/email-analysis.service.ts
  - backend/src/modules/ai/services/email-triage.service.ts
  - backend/src/modules/ai/services/triage-correction.service.ts
  - backend/src/modules/ai/services/triage-feedback.service.ts
  - backend/src/modules/ai/services/triage-override.service.ts
  - backend/src/modules/ai/services/triage-promotion.service.ts
  - backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts
  - backend/src/modules/ai/utils/triage-correction-weight.ts
  - backend/src/modules/email/controllers/email-actions.controller.ts
  - backend/src/modules/email/services/__tests__/email-crud.service.spec.ts
  - backend/src/modules/email/services/email-crud.service.ts
  - backend/src/modules/email/services/emails.service.ts
  - frontend/components/email/thread/ExpandedMessage.tsx
  - frontend/hooks/queries/index.ts
  - frontend/hooks/queries/use-correct-triage.ts
  - frontend/lib/api/emails.ts
  - frontend/locales/en.ts
  - frontend/locales/index.ts
  - frontend/locales/it.ts
findings:
  critical: 1
  warning: 7
  info: 6
  total: 14
status: issues_found
---

# Phase 147: Code Review Report

**Reviewed:** 2026-04-19T22:00:00Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Phase 147 wires triage corrections into future classifications via three paths: auto-diff
edits, explicit `correct-triage` endpoint, and BullMQ-debounced promotion of overrides.
Multi-tenant discipline is solid — every Prisma query I audited includes `tenantId`, and the
`triage-overrides.controller.ts` sources `tenantId` from the authenticated session, never the
body. Tests exist at plumbing level for every seam and the prompt-budget invariant is
well-defended.

The review surfaces one critical data-loss regression (muting-override short-circuit wipes
user-corrected labels and stale priority), a handful of warnings about defensive boundaries
(unbounded cache-invalidation queries, forwardRef circular dep violating project policy,
silent frontend error swallowing, missing role gates on destructive override endpoints),
and cosmetic/perf items. No security vulnerabilities (injection, auth bypass, secret leak)
were identified. No cross-tenant leakage paths were found — the D-07 short-circuit, D-06
promotion cache invalidation, and getSuggestions all filter by `tenantId` explicitly.

The Phase 148 forward-compat scaffolding (`lane_correction` branch in `TriagePromotionService`,
`LANE_TO_ACTION` map) is explicitly documented and covered by the plumbing spec
(Scenario 2) — not flagged as dead code.

## Critical Issues

### CR-01: Muting override short-circuit wipes previously-correct user state

**File:** `backend/src/modules/ai/services/email-triage.service.ts:293-331`
**Issue:**
When a muting override (`always-system-alert`, `never-follow-up`) matches, the short-circuit
path does three destructive things that lose prior user intent:

1. `email.updateMany` unconditionally sets `aiLabels: []`, destroying any labels the user
   previously corrected via the D-01 explicit-correction endpoint or any labels the LLM
   assigned before the override existed.
2. `aiPriority`, `aiPriorityReason`, `aiSentiment`, `aiCategory`, `aiIntent`,
   `aiActionability` are NOT cleared and NOT updated — so an email previously triaged as
   `aiPriority=1 (URGENT)` stays URGENT forever even though the new rule says "this is a
   system alert." The DB row is now internally inconsistent:
   `aiLane='system-alerts'` but `aiPriority=1` and `aiCategory='SUPPORT_REQUEST'`.
3. `emailAnalysis.upsert` update-branch wipes `summary: null, keyPoints: [], suggestedActions: []` —
   losing the prior LLM analysis entirely even though the rule doesn't know anything about
   content.

This is a user-facing correctness regression: a user who corrected labels on an email last
week and then later added a `always-system-alert` override for that sender will see their
corrections vanish the next time that email is re-triaged (e.g., via `TriageBackfillScheduler`
or manual re-triage). It also feeds a bad signal back into the loop — if
`captureLabelDiff` fires on the next user interaction comparing `[]` (wiped) to the
user-restored labels, every label becomes "added_back_correction" noise.

**Fix:**
Either (a) guard the short-circuit to skip if the email was already triaged with LLM
analysis, or (b) preserve prior state explicitly:

```typescript
if (MUTING_ACTIONS.has(or.override.action)) {
  const now = new Date();
  const mutingLane = ACTION_TO_LANE[or.override.action] ?? 'system-alerts';

  // Preserve existing labels — a muting rule decides LANE, not labels.
  // Reset stale priority/sentiment so the row isn't internally inconsistent.
  await this.prisma.email.updateMany({
    where: { id: emailId, tenantId },
    data: {
      aiLane: mutingLane,
      // Do NOT clobber aiLabels — the rule is lane-shaped, not label-shaped.
      aiPriority: null,
      aiPriorityReason: null,
      aiSentiment: null,
      aiCategory: null,
      isAutoTriaged: true,
      autoTriagedAt: now,
    },
  });

  // Upsert analysis: preserve existing summary on update, don't blow it away.
  await this.prisma.emailAnalysis.upsert({
    where: { emailId_tenantId: { emailId, tenantId } },
    update: {
      triageSource: 'rule',
      lane: mutingLane,
      processedAt: now,
      modelUsed: 'rule',
      // Do NOT set summary: null / keyPoints: [] / suggestedActions: [] —
      // preserve anything the LLM previously computed.
    },
    create: {
      emailId, tenantId,
      triageSource: 'rule',
      lane: mutingLane,
      processedAt: now,
      modelUsed: 'rule',
    },
  });
}
```

Alternatively, add `matchedOverrideAction: or.override.action` to the analyzeEmailUnified
call for muting cases too, and let EmailAnalysisService enforce the lane (it already has
that code path at 215-228). That has the downside of burning an LLM call for a muted email,
which defeats the cost motivation of the short-circuit — so preserving labels+analysis
in-place is the cheaper fix.

---

## Warnings

### WR-01: Unbounded `email.findMany` in `promoteOverrides` cache-invalidation

**File:** `backend/src/modules/ai/services/triage-promotion.service.ts:138-152`
**Issue:**
When a promotion mints a domain-scope override for a busy domain (e.g., `acme.com`) or a
sender override for a high-volume sender, the cache-invalidation query loads every matching
email ID into memory with no pagination or limit:

```typescript
p.scope === 'sender'
  ? await this.prisma.email.findMany({
      where: { tenantId, from: { equals: p.pattern, mode: 'insensitive' } },
      select: { id: true },
    })
  : await this.prisma.email.findMany({
      where: { tenantId, from: { contains: `@${p.pattern}`, mode: 'insensitive' } },
      select: { id: true },
    });
```

A tenant with 100k emails from a single domain over the history of the account will load
100k string IDs per promotion run. Given promotion runs every ~5min per active tenant,
this is a memory/GC hazard and could OOM workers.

**Fix:**
Invalidate via bulk UPDATE inside the Prisma query itself — `updateMany` already supports
the same where-clause, so we can skip the findMany-then-pass-to-invalidateCache hop:

```typescript
for (const p of patternsPromoted) {
  const where: Prisma.EmailWhereInput =
    p.scope === 'sender'
      ? { tenantId, from: { equals: p.pattern, mode: 'insensitive' } }
      : { tenantId, from: { contains: `@${p.pattern}`, mode: 'insensitive' } };
  const affectedEmails = await this.prisma.email.findMany({
    where, select: { id: true }, take: 5000,  // cap at 5k per promotion run
  });
  if (affectedEmails.length > 0) {
    await this.analysisService.invalidateCache(
      tenantId, affectedEmails.map((e) => e.id),
    );
  }
}
```

Or bypass the findMany entirely and invalidate by where-clause:

```typescript
await this.prisma.emailAnalysis.updateMany({
  where: { tenantId, email: where },   // if relation filter supported
  data: { processedAt: new Date(0) },
});
```

### WR-02: Circular dependency between `TriagePromotionService` and `TriagePromotionQueueService`

**File:** `backend/src/modules/ai/services/triage-promotion.service.ts:56-58`, `backend/src/modules/ai/services/triage-promotion.queue.ts:59-62`
**Issue:**
Both services use `forwardRef()` to inject each other. `CLAUDE.md` memory entry
`feedback_no_circular_deps` states: "Circular dependencies forbidden. Extract shared types
into separate files. Verify with `madge --circular`." This pair violates that rule — a
`madge --circular` run on the AI module will flag it.

The cycle is: Queue enqueues jobs → Worker handler invokes
`promotionService.promoteOverrides()` → `runSafetyNet()` fans out to
`promotionQueue.enqueueDebounced()`. Legitimate runtime loop, but the NestJS DI graph still
has a cycle.

**Fix:**
Break the cycle with an EventEmitter2 event (already used elsewhere in the codebase) or a
shared interface + registration pattern:

```typescript
// triage-promotion.queue.ts — register the handler instead of holding the service ref
export type PromotionHandler = (tenantId: string) => Promise<{ promoted: number; skipped: boolean }>;

@Injectable()
export class TriagePromotionQueueService {
  private handler?: PromotionHandler;
  // constructor has NO forwardRef — no cycle
  registerHandler(handler: PromotionHandler) { this.handler = handler; }
  // processPromotion now calls this.handler(tenantId) instead of this.promotionService...
}

// triage-promotion.service.ts — constructor injects queue (one-way), registers handler on init
@Injectable()
export class TriagePromotionService implements OnModuleInit {
  constructor(private readonly promotionQueue: TriagePromotionQueueService) {}
  onModuleInit() {
    this.promotionQueue.registerHandler((tenantId) => this.promoteOverrides(tenantId));
  }
}
```

### WR-03: `correctTriage` mutation swallows errors silently in the frontend

**File:** `frontend/components/email/thread/ExpandedMessage.tsx:778-787`
**Issue:**
```typescript
try {
  await correctTriageMutation.mutateAsync({ id: message.id, body: {...} });
  onDismissAiLabel?.(message.id, oldValue);
} catch {
  // Error already surfaced by TanStack Query devtools / network tab.
  // Keeping the chip visible so the user can retry.
}
```

This comment is factually wrong. Devtools and the network tab are developer-only tooling —
an end user has no feedback that their correction failed. The mutation also has no
`onError` handler in `use-correct-triage.ts` to show a toast. The chip staying visible is
NOT a useful "retry affordance" — to the user, nothing happened.

Worse, the success path calls `onDismissAiLabel?.()` which optimistically removes the chip
locally, so a subsequent manual re-click after a transient network error won't give
different behavior either.

**Fix:**
Add an `onError` handler in `use-correct-triage.ts` that surfaces a toast, and propagate
that state into ExpandedMessage:

```typescript
// use-correct-triage.ts
export function useCorrectTriageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: CorrectTriageVariables) =>
      emailsApi.correctTriage(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: emailKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: emailKeys.list() });
      toast.success(t.email.labels.correctTriageSuccess);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err) || t.common.errorSomethingWrong);
    },
  });
}
```

### WR-04: `POST/DELETE /ai/triage-overrides` lack role gates — any authenticated tenant member can mutate overrides

**File:** `backend/src/modules/ai/controllers/triage-overrides.controller.ts:52, 68-88`
**Issue:**
Class-level `@UseGuards(TenantGuard, RolesGuard)` with no `@Roles()` decorator on `create`
/ `remove` means — per the comment at lines 49-51 — those routes fall through to "any
authenticated tenant member." But triage overrides are tenant-wide policy: one user's
`never-follow-up` override silences reminders for every user in that tenant. A rank-and-file
user shouldn't be able to create or delete them, and especially not to delete someone
else's admin-created override.

Compare to `EmailActionsController` where all mutating routes carry
`@Roles('admin', 'manager', 'super-admin')`.

This is a multi-user authorization gap, not a cross-tenant leak, so I'm classifying as
Warning rather than Critical. For single-user tenants it's moot.

**Fix:**
```typescript
@Post()
@Roles('admin', 'manager', 'super-admin')
@ApiOperation({ summary: 'Create or update a triage override' })
async create(...) { ... }

@Delete(':id')
@Roles('admin', 'manager', 'super-admin')
@ApiOperation({ summary: 'Delete a triage override' })
async remove(...) { ... }
```

Keep `@Get()` un-gated so all users can see what policies are active.

### WR-05: `captureLabelDiff` runs N+1 `email.count` queries when user adds labels

**File:** `backend/src/modules/ai/services/triage-feedback.service.ts:139-161`
**Issue:**
For each added label, a separate `prisma.email.count({ where: { tenantId, from:..., aiLabels: { has: label }}})` query runs to check "was this label ever AI-suggested for this sender?" If a user adds 5 labels to one email, that's 5 sequential DB round-trips on the hot API path (PATCH /emails/:id). On top of the N `recordFeedback` writes, each of which also calls `pruneOldFeedback` — which itself runs another `count` query (see WR-06).

For a typical PATCH adding 3 labels: at minimum 3 counts + 3 writes + 3 prune-counts = 9 DB round-trips for what should be a single capture pass.

This runs fire-and-forget outside the transaction so it doesn't affect API latency, but it loads the connection pool and stacks on top of the other non-critical-path queries.

**Fix:**
Batch the "was ever AI-suggested" check into one query:

```typescript
if (added.length > 0) {
  const aiLabelsSet = new Set(email.aiLabels ?? []);
  const labelsToCheck = added.filter((l) => !aiLabelsSet.has(l));

  let siblingLabelSet = new Set<string>();
  if (labelsToCheck.length > 0) {
    const sibling = await this.prisma.email.findFirst({
      where: {
        tenantId,
        from: { equals: email.from, mode: 'insensitive' },
        aiLabels: { hasSome: labelsToCheck },
      },
      select: { aiLabels: true },
    });
    siblingLabelSet = new Set(sibling?.aiLabels ?? []);
  }

  const feedbackRows = added
    .filter((l) => aiLabelsSet.has(l) || siblingLabelSet.has(l))
    .map((l) => ({
      tenantId, emailId, type: 'label_correction' as const,
      signal: 'edit' as const, oldValue: null, newValue: l,
    }));
  if (feedbackRows.length > 0) {
    await this.prisma.emailTriageFeedback.createMany({ data: feedbackRows });
  }
}
```

One-shot createMany also eliminates N prune checks.

### WR-06: `pruneOldFeedback` runs a `COUNT(*)` on every feedback insert

**File:** `backend/src/modules/ai/services/triage-feedback.service.ts:77, 295-303`
**Issue:**
`recordFeedback` unconditionally calls `pruneOldFeedback` which does `COUNT(*)` per-tenant
BEFORE every write. Without a WHERE index hit on the count (the composite index
`tenantId, createdAt` will be used, so the count is fast), this is still a wasted round-
trip on every correction and every auto-diff edit. Over a busy tenant with 50 PATCHes/min
each doing 3 label adds, that's 150 counts/min that contribute nothing until the table
exceeds MAX_FEEDBACK_PER_TENANT=10000.

**Fix:**
Prune probabilistically (1% of writes trigger a prune check), or move prune to the existing
safety-net cron (04:17 daily) since retention is 30 days — the pruning doesn't need to be
real-time:

```typescript
async recordFeedback(params) {
  // ... no pruneOldFeedback call here
  return this.prisma.emailTriageFeedback.create({ data: {...} });
}

// Hook into runSafetyNet in TriagePromotionService, or a new @Cron:
async pruneAllTenants() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);
  const { count } = await this.prisma.emailTriageFeedback.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  this.logger.log(`Pruned ${count} stale feedback rows`);
}
```

### WR-07: Domain-scope cache-invalidation `contains` filter has substring-bleed

**File:** `backend/src/modules/ai/services/triage-promotion.service.ts:147-148`
**Issue:**
`from: { contains: '@${p.pattern}', mode: 'insensitive' }` for pattern `acme.com` matches
`boss@acme.com` (correct) but also `attacker@acme.com.evil.example` (incorrect — that's
`acme.com.evil.example` domain, not `acme.com`). This over-invalidates cache, not a
security issue — just wastes Prisma writes on a small number of emails with suspicious
`From:` headers. Also would mismatch the actual `applyOverrides` domain matcher
(`senderDomain === override.pattern`, exact match on the last domain part).

**Fix:**
Use an anchored regex or two-step extraction. Since Prisma `contains` doesn't support
regex on PostgreSQL text without raw queries, the pragmatic fix is to also require the
pattern appear at the end of the address (by checking for `@pattern` and no trailing
`.something`). Or accept that cache-invalidation is approximate and tolerate the bleed —
it's self-healing on the next email write. Either mark as "known acceptable" in a code
comment, or switch to raw SQL:

```typescript
const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
  SELECT id FROM "emails"
  WHERE "tenantId" = ${tenantId}
    AND lower("from") ~ ${`@${p.pattern}(>|$|\\s)`}
  LIMIT 5000
`;
```

---

## Info

### IN-01: `getSuggestions` sender-loop has redundant `v.raw >= MIN_CORRECTIONS_FOR_PROMOTION` check

**File:** `backend/src/modules/ai/services/triage-feedback.service.ts:253-257`
**Issue:**
```typescript
if (
  v.raw / total >= CONCENTRATION_RATIO &&        // >= 80%
  v.raw >= MIN_CORRECTIONS_FOR_PROMOTION          // >= 3
) { ... }
```
The outer loop already skips buckets with `total < MIN_CORRECTIONS_FOR_PROMOTION`, but the
inner target needs its own ≥3 gate since a target could have 80% of 5 (=4) and pass, while
a target with 80% of 3 (=2.4→2) rounds down and would fail concentration anyway at 2/3.
The check is defensive but redundant under current math. Not a bug, just unnecessary.

**Fix:**
Remove the `v.raw >= MIN_CORRECTIONS_FOR_PROMOTION` condition and document why
concentration alone is sufficient when total ≥ 3, or keep it as explicit safety. Either
way, add a comment explaining which invariant it defends.

### IN-02: `TriageOverrideService.applyOverrides` fetches all overrides per-email

**File:** `backend/src/modules/ai/services/triage-override.service.ts:123`
**Issue:**
`EmailTriageService.triageEmail` calls `applyOverrides` once per email; a batch of 20
emails triggers 20 `findMany` calls returning up to 100 rows each. A per-tenant in-memory
cache (invalidated on `addOverride` / `removeOverride`) would cut this to 1 fetch per
batch.

**Fix:** Add a short-lived per-tenant cache keyed on `tenantId` with TTL 60s, invalidated
by `addOverride`/`removeOverride`:

```typescript
private readonly overrideCache = new Map<string, { rows: TriageOverride[]; until: number }>();
async getOverrides(tenantId: string): Promise<TriageOverride[]> {
  const cached = this.overrideCache.get(tenantId);
  if (cached && cached.until > Date.now()) return cached.rows;
  const rows = await this.prisma.triageOverride.findMany({
    where: { tenantId }, orderBy: { createdAt: 'desc' },
  });
  this.overrideCache.set(tenantId, { rows: rows as TriageOverride[], until: Date.now() + 60_000 });
  return rows as TriageOverride[];
}
```

Invalidate in `addOverride` and `removeOverride` by deleting the tenant key.

### IN-03: Type cast `row as TriageFeedbackEntry` / `row as TriageOverride` without runtime validation

**File:** `backend/src/modules/ai/services/triage-feedback.service.ts:86`, `backend/src/modules/ai/services/triage-override.service.ts:75, 110`
**Issue:**
`signal` and `type` on `EmailTriageFeedback` and `action`/`type` on `TriageOverride` are
schema-level `String` but typed as `'edit' | 'correction'` / union literals in TypeScript.
Casts with `as` bypass runtime validation. If a buggy migration or a direct DB insert put
an invalid value in the column, consumers relying on the narrow type would see runtime
behavior diverging from type. Low risk given `@IsIn` validation at the controller.

**Fix:** Either accept the cast as safe-by-construction (all writers go through
`recordFeedback`/`addOverride` which accept only the union), or add a parse step in the
mapper.

### IN-04: Frontend `correctTriage` optimistic dismiss happens before server-confirmed success

**File:** `frontend/components/email/thread/ExpandedMessage.tsx:782-783`
**Issue:**
```typescript
await correctTriageMutation.mutateAsync({...});
onDismissAiLabel?.(message.id, oldValue);
```
Order is correct — `await` first, then dismiss — so this is actually NOT optimistic; it's
post-confirmation. My first read was wrong. No fix needed. Keeping this item to document
that the code does the right thing despite the surrounding silent-error issue (WR-03).

### IN-05: Hardcoded English overrideHint string in prompt injection

**File:** `backend/src/modules/ai/services/email-triage.service.ts:342`
**Issue:**
```typescript
overrideHint = `From ${or.override.pattern}: user has marked as ${or.override.action} — honor this`;
```
This goes into the LLM system prompt, not a user-facing string, so it correctly skips
translation. But the italian locale's `analyzeUnified.systemPrompt` substitutes
`${overrideHint || ''}` verbatim — an IT user gets an Italian prompt with one English
sentence embedded. The LLM will still honor it (both models understand English), but the
mixed-language prompt is a minor quality regression on Italian prompts. For consistency with
the other translatable prompt slices (LABEL_RULES, TRIAGE_RULES), consider sourcing this
string from `t.insights.analyzeUnified` too.

**Fix:** Add `overrideHintTemplate(pattern: string, action: string): string` to AI locales and
use `t.insights.analyzeUnified.overrideHint(pattern, action)` in `EmailTriageService`.

### IN-06: `TriageOverridesController.promoteSuggestions` route missing `/promote-suggestions` in `@ApiOperation.description` alignment with PLAN

**File:** `backend/src/modules/ai/controllers/triage-overrides.controller.ts:96-101`
**Issue:**
The JSDoc says "Phase 156 E2E benchmarks" and the admin path is documented as
`POST /api/admin/ai/triage/promote-suggestions` in the plan, but the actual mounted path
is `POST /ai/triage-overrides/promote-suggestions` (controller base is
`ai/triage-overrides`). Not a bug — just a documentation drift between comment and code.
Harmless.

**Fix:** Update the JSDoc comment to say `POST /ai/triage-overrides/promote-suggestions` so
future readers aren't confused.

---

## Multi-tenant Audit (summary)

Reviewed every Prisma call for `tenantId`:

- `triage-correction.service.ts:40, 58`: tenantId included ✓
- `triage-feedback.service.ts:80, 135, 143, 177, 187, 296, 300`: tenantId included ✓
- `triage-override.service.ts:72, 94, 101-105, 114`: tenantId included ✓
- `triage-promotion.service.ts:142, 146, 155, 189`: tenantId included ✓; cross-tenant fan-out at 189 uses `distinct: ['tenantId']` then loops per tenant ✓
- `email-analysis.service.ts:77-86, 254-257, 279-281, 293-300, 451-453`: tenantId included ✓
- `email-triage.service.ts:278, 297, 309, 373, 588-609`: tenantId included ✓
- `email-crud.service.ts:221, 245, 349-352, 407, 414-418`: tenantId included ✓; `correctTriage` does explicit defense-in-depth re-check ✓
- `triage-overrides.controller.ts:64, 73-74, 87, 116`: all sourced from `req.user.tenantId`, never from body ✓
- `email-actions.controller.ts:273`: sourced from `req.user.tenantId` ✓

**No cross-tenant leakage paths found.**

## Migration Audit

`20260419120000_147_feedback_loop_signal_and_triagesource/migration.sql`:

- `ALTER TABLE "email_analyses" ADD COLUMN "triageSource" TEXT` — additive, nullable, no backfill needed ✓
- `ALTER TABLE "email_triage_feedback" ADD COLUMN "signal" TEXT NOT NULL DEFAULT 'edit'` — non-null but with default, so existing rows get 'edit' which matches the D-03 semantic that legacy rows without explicit correction signal are treated as drift-detection ✓
- `CREATE INDEX ... ON "email_triage_feedback"("tenantId", "signal", "createdAt")` — supports the promotion query which filters on these 3 columns ✓
- No DROPs. Safe to run on production under Railway's `prisma migrate deploy` flow (confirmed by `backend/railway.toml` which delegates to the Dockerfile's `prisma migrate deploy && node dist/main`). ✓

---

_Reviewed: 2026-04-19T22:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
