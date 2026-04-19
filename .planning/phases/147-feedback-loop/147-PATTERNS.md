# Phase 147: Close the Feedback Loop - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 17 (backend 16 + frontend 1)
**Analogs found:** 17 / 17
**Scope:** Wire orphaned `TriageFeedbackService` + `TriageOverrideService` into triage pipeline. Add debounced promotion queue, `signal` + `triageSource` columns, few-shot corrections block, 55/25/20 prompt budget.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/modules/ai/services/triage-feedback.service.ts` | service | CRUD + analytics | self (modify in place — concentration math replaces flat threshold) | exact |
| `backend/src/modules/ai/services/triage-override.service.ts` | service | CRUD | self (already returns OverrideResult — no shape change) | exact |
| `backend/src/modules/ai/services/email-triage.service.ts` | service | request-response | self (`triageEmail()` pre-LLM short-circuit insertion) | exact |
| `backend/src/modules/ai/services/email-analysis.service.ts` | service | request-response + prompt-build | self (`buildAnalyzeSystemPrompt()` budget rebalance + CORRECTIONS injection) | exact |
| `backend/src/modules/ai/services/triage-rule.service.ts` | service | prompt-build | self (`buildTriageContext()` 25% budget caller) | exact |
| `backend/src/modules/ai/services/triage-correction.service.ts` (NEW) | service | read-only analytics | `TriageFeedbackService.getSuggestions()` (grouping by sender/domain) | role-match |
| `backend/src/modules/email/services/email-crud.service.ts` | service | CRUD + fire-and-forget | self (`updateEmail()` — uses the same $transaction + `.catch()` fire-and-forget pattern already in place at lines 289–297) | exact |
| `backend/src/modules/email/controllers/email-actions.controller.ts` | controller | request-response | self (add `POST /:id/correct-triage` next to existing `@Patch(':id')`) | exact |
| `backend/src/modules/ai/controllers/triage-overrides.controller.ts` | controller | request-response | self (add admin POST endpoint on same controller OR new admin controller) | exact |
| `backend/src/modules/ai/services/triage-promotion.service.ts` (NEW — houses promotion handler + idempotency) | service | event-driven + batch | `TriageOverrideService.addOverride()` (upsert path for concurrent safety) | role-match |
| `backend/src/modules/ai/services/triage-promotion.queue.ts` (NEW) | queue-service | event-driven (debounced) | `backend/src/modules/telegram/services/reminder-notify.queue.ts` (same Queue+Worker+delay+jobId shape) | **exact** |
| `backend/src/common/services/scheduled-jobs.queue.ts` | config + registry | event-driven | self (add `TRIAGE_PROMOTION_SAFETY_NET` enum + cron) | exact |
| `backend/src/common/config/queue.config.ts` | config | — | self (add `TRIAGE_PROMOTE_OVERRIDES` to QUEUE_NAMES) | exact |
| `backend/src/common/workers/base.worker.ts` | base class | — | self (no edit — new queue-service uses its own inline Worker like `ReminderNotifyQueueService`) | reference only |
| `backend/prisma/schema.prisma` | schema | — | `backend/prisma/migrations/20260402170000_add_triage_overrides_and_feedback/migration.sql` (same-model migration pattern for add-column) | role-match |
| `backend/src/modules/ai/locales/en.ts`, `it.ts` | i18n | prompt-build | self (`insights.analyzeUnified.systemPrompt` template already takes 3 slots; extend to 5) | exact |
| `backend/src/modules/ai/utils/prompt-sanitizer.ts` | utility | — | self (`buildTaggedPromptSection` already used for `<LABEL_RULES>` — reuse for `<CORRECTIONS>` + `<USER_OVERRIDE>`) | exact |
| `backend/src/modules/ai/utils/triage-correction-weight.ts` (NEW) | utility | — | *none in codebase* — but signature mimics simple helpers like `extractDomain` in `triage-feedback.service.ts:128` | no analog |
| `backend/src/modules/ai/services/__tests__/triage-prompt-budget.test.ts` | test | — | self (assertion update) | exact |
| `frontend/components/email/thread/ExpandedMessage.tsx` (auto-diff capture — already fires on PATCH /emails/:id; UI already renders AI labels inline w/ `onDismissAiLabel`) | component | request-response | self — extend existing `onDismissAiLabel` Chip at lines 689–720 with "this should be X" action | exact |

---

## Pattern Assignments

### `backend/src/modules/ai/services/triage-feedback.service.ts` (service, CRUD + analytics)

**Analog:** self — MODIFY IN PLACE. The file already exists but is orphaned. Phase 147 touches:
1. `recordFeedback()` signature extends with `signal: 'edit' | 'correction'` parameter.
2. `getSuggestions()` body replaces `SUGGESTION_THRESHOLD = 3` flat count with concentration-ratio math (D-03/D-04).

**Existing multi-tenant Prisma query pattern** (lines 47–52) — reuse shape in all new queries:
```typescript
const entry = await this.prisma.emailTriageFeedback.create({
  data: { tenantId, emailId, type, oldValue, newValue },
});

this.logger.log(`Feedback recorded: ${type} for email=${emailId} (${oldValue} → ${newValue})`);
return entry as TriageFeedbackEntry;
```

**Existing groupBy-after-fetch pattern** (lines 62–99) — the new concentration math follows the same flow (fetch, join in-memory, count):
```typescript
const feedback = await this.prisma.emailTriageFeedback.findMany({
  where: {
    tenantId,
    type: { in: ['label_correction', 'lane_correction'] },
    createdAt: { gte: cutoff },
  },
  select: { emailId: true, type: true, newValue: true },
});

// ... join to email.from, group by sender/domain + target label
for (const [key, { count, action }] of domainCounts) {
  if (count >= SUGGESTION_THRESHOLD) { /* flat-threshold rule being replaced */ }
}
```
**Replace with:** per D-03, add per-group `total` and require `agreeing / total >= 0.8 AND agreeing >= 3` (sender) OR `agreeing >= 8 && distinctSenders >= 3 && no role-account matches` (domain). Keep `signal='correction'` filter — `signal='edit'` rows are NOT counted toward promotion.

**Existing `extractDomain` helper** (lines 128–131) — reuse as-is; consider promoting to `backend/src/modules/ai/utils/email-address.ts` if Phase 147 adds more sender/domain logic (per `code_context.Reusable Assets`):
```typescript
function extractDomain(from: string): string | null {
  const match = from.match(/@([^>]+)/);
  return match ? match[1].toLowerCase().trim() : null;
}
```

**Existing `mapCorrectionToAction` helper** (lines 133–138) — lane-shaped, so it stays for future `lane_correction` wiring (D-02 defers). Do NOT call it for Phase 147 label-correction promotion (D-05a: label corrections feed few-shot only, not `TriageOverride`).

---

### `backend/src/modules/ai/services/triage-override.service.ts` (service, CRUD)

**Analog:** self — NO SHAPE CHANGE. Already returns `OverrideResult` with `lane`, `suppressFollowUp`, matched `override`. Phase 147 just consumes it.

**Existing safe-upsert pattern** (lines 83–89) — promotion service MUST use this same `upsert` (per `code_context.Established Patterns.Prisma retry`):
```typescript
const row = await this.prisma.triageOverride.upsert({
  where: {
    tenantId_type_pattern: { tenantId, type, pattern: normalizedPattern },
  },
  update: { action },
  create: { tenantId, type, pattern: normalizedPattern, action },
});

this.logger.log(`Override created: ${type}:${normalizedPattern} → ${action} (tenant=${tenantId})`);
```

**Existing sender-before-domain precedence** (lines 112–134) — D-04 runtime precedence already implemented. The promotion job only INSERTS overrides; the match loop here needs no change.

**Existing `ACTION_TO_LANE` map** (lines 37–42) — reuse for D-07 visible-override post-LLM enforcement:
```typescript
const ACTION_TO_LANE: Record<string, string | undefined> = {
  'always-important': 'action-now',
  'always-review-later': 'review-later',
  'always-system-alert': 'system-alerts',
  'always-customer-vip': 'customer-vip',
};
```
Export this or reimport — `EmailTriageService.triageEmail()` needs it to force-set `aiLane` after LLM parse.

---

### `backend/src/modules/ai/services/email-triage.service.ts` (service, request-response)

**Analog:** self — insert pre-LLM `applyOverrides()` call in `triageEmail()` (lines 263–344).

**Existing fire-and-forget-after-await pattern** (lines 297–305, 309–313) — critical reference for D-01's `recordFeedback` call in `EmailCrudService`:
```typescript
if (needsFollowUp) {
  this.triageActionService
    .processTriageSignals(
      { emailId, tenantId, userId: options.userId, from: email.from, subject: email.subject },
      analysis,
    )
    .catch((err) =>
      this.logger.warn(`Follow-up creation failed for ${emailId}: ${err instanceof Error ? err.message : String(err)}`),
    );
}
```
**Pattern contract:** await the main operation, THEN fire (do not await) the side-effect, swallowing errors with `.catch(this.logger.warn(...))`. D-01 capture in `EmailCrudService.updateEmail()` MUST copy this exactly — do NOT put `recordFeedback` inside the transaction.

**Injection point for D-07** — before line 272 (`this.emailInsights.analyzeEmailUnified`). Pseudocode shape:
```typescript
// BEFORE calling analyzeEmailUnified — fetch email for override matching
const email = await this.prisma.email.findFirst({
  where: { id: emailId, tenantId },
  select: { from: true, threadId: true, subject: true },
});
const overrideResult = await this.triageOverrideService.applyOverrides(tenantId, email);

if (overrideResult.matched && MUTING_ACTIONS.has(overrideResult.override.action)) {
  // Pre-LLM short-circuit (D-07 muting branch)
  await this.prisma.email.updateMany({
    where: { id: emailId, tenantId },
    data: { aiLane: 'system-alerts', aiLabels: [], isAutoTriaged: true, autoTriagedAt: new Date(), /* triageSource: 'rule' */ },
  });
  return { /* skip LLM */ };
}
// else fall through to existing analyzeEmailUnified call; pass overrideResult through to EmailAnalysisService for visible-override hint injection
```

**Existing `@Optional()` DI pattern** (lines 122–124) — apply to `TriageOverrideService` injection to keep the service optional in tests:
```typescript
@Optional() private readonly triageActionService?: TriageActionService,
@Optional() private readonly crmSuggestionTrigger?: CrmSuggestionTriggerService,
```

---

### `backend/src/modules/ai/services/email-analysis.service.ts` (service, prompt-build)

**Analog:** self — `buildAnalyzeSystemPrompt()` (lines 274–314) rebalance to 55/25/20 and add CORRECTIONS slice.

**Existing prompt budget constants** (lines 39–43) — the invariants the planner must preserve:
```typescript
private static readonly MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600;
private static readonly LABEL_RULES_BUDGET_RATIO = 0.6;         // → change to 0.55
private static readonly TRIAGE_CONTEXT_MAX_RULES = 20;
private static readonly PROMPT_LINE_MAX_LENGTH = 220;
private static readonly LABEL_PROMPT_MAX_LENGTH = 180;
```
**D-10 contract:** DO NOT grow `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH`. Add `CORRECTIONS_BUDGET_RATIO = 0.2`; `TRIAGE_CONTEXT_BUDGET_RATIO = 0.25` (derived `= 1 - 0.55 - 0.20`).

**Existing budget-split math** (lines 282–291) — copy this shape and extend to 3 slices:
```typescript
const allowedLabelsText = allowedLabels.join(', ');
const basePrompt = t.insights.analyzeUnified.systemPrompt(allowedLabelsText, '', '');
const optionalBudget = Math.max(
  0,
  EmailAnalysisService.MAX_ANALYZE_SYSTEM_PROMPT_LENGTH - basePrompt.length,
);
const hasLabelPrompts = labelDefs.some((label) => Boolean(label.aiPrompt?.trim()));
const labelPromptBudget = hasLabelPrompts
  ? Math.floor(optionalBudget * EmailAnalysisService.LABEL_RULES_BUDGET_RATIO)
  : 0;
const triageContextBudget = Math.max(0, optionalBudget - labelPromptBudget);
```
**Extend to:** `correctionsBudget = Math.floor(optionalBudget * 0.20)` then `triageContextBudget = optionalBudget - labelPromptBudget - correctionsBudget`. Update the `t.insights.analyzeUnified.systemPrompt(...)` call site to pass 5 args (D-11 + D-07).

**Existing `buildTaggedPromptSection` usage** (line 357) — CORRECTIONS block uses the exact same helper:
```typescript
return buildTaggedPromptSection('LABEL_RULES', lines, maxLength, 'Apply these labels when the described conditions match:');
```
**Phase 147 contract (D-11):** `buildTaggedPromptSection('CORRECTIONS', correctionLines, correctionsBudget, 'Recent user corrections for this sender/domain:')` and `buildTaggedPromptSection('USER_OVERRIDE', [hintLine], hintBudget)` for D-07 visible-override hint.

**Existing PII redaction + sanitization pipeline** (lines 390–393, 407–414) — CORRECTIONS examples include sender addresses (PII). Apply `this.redactPii(...)` + `sanitizeForLLM(..., { maxLength: 80 })` per line (D-09c hard cap 80 chars):
```typescript
private redactPii(text: string): string {
  if (!this.piiDetection || !text) return text;
  try {
    const result = this.piiDetection.detect(text);
    if (result.details.length > 0) this.logger.debug(`Redacted ${result.details.length} PII items`);
    return result.redactedText;
  } catch { return text; }
}
```

**Existing `invalidateCache` method** (lines 240–250) — promotion handler's end-of-run call site (`code_context.Integration Points`):
```typescript
async invalidateCache(tenantId: string, emailIds: string[]): Promise<number> {
  if (emailIds.length === 0) return 0;
  const { count } = await this.prisma.emailAnalysis.updateMany({
    where: { tenantId, emailId: { in: emailIds } },
    data: { processedAt: new Date(0) },
  });
  if (count > 0) {
    this.logger.debug(`Invalidated analysis cache for ${count} emails (tenant: ${tenantId})`);
  }
  return count;
}
```
**Call site after promotion:** find emails matching the new override's `(type, pattern)`, pass their IDs to `invalidateCache`.

**Existing `triageSource` persistence site** (lines 194–220) — the `analysisData` block + `this.prisma.emailAnalysis.upsert`. D-08 adds the new column here:
```typescript
const analysisData = {
  priority: this.mapPriorityToEnum(result.priority),
  category: this.mapIntentToCategory(result.intent),
  // ... existing fields ...
  lane: result.lane, intent: result.intent, actionability: result.actionability,
  suggestedActions: { /* ... */ },
  processedAt, latencyMs,
  // ADD: triageSource: 'llm' | 'rule' | 'llm+rule'
};

if (persistResult) {
  await this.prisma.emailAnalysis.upsert({
    where: { emailId_tenantId: { emailId, tenantId } },
    update: analysisData, create: { emailId, tenantId, ...analysisData },
  });
  // ...
}
```

---

### `backend/src/modules/ai/services/triage-rule.service.ts` (service, prompt-build)

**Analog:** self — `buildTriageContext()` is the 25% budget CALLEE. Called from `EmailAnalysisService.buildAnalyzeSystemPrompt()` with `maxLength: triageContextBudget`. No internal math change needed — just receive the smaller budget.

**Existing budget-bounded section builder** (lines 185–220) — pattern the new CORRECTIONS path mirrors:
```typescript
private buildSection(tag: string, lines: string[], maxLength?: number): string {
  if (lines.length === 0) return '';
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const limit = typeof maxLength === 'number' ? maxLength : Number.MAX_SAFE_INTEGER;
  const overhead = open.length + close.length + 2;
  if (limit <= overhead) return '';

  const accepted: string[] = [];
  let currentLength = overhead;

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized) continue;
    const lineCost = normalized.length + (accepted.length > 0 ? 1 : 0);
    if (currentLength + lineCost > limit) {
      const available = limit - currentLength - (accepted.length > 0 ? 1 : 0);
      if (available > 6) accepted.push(this.truncateText(normalized, available));
      break;
    }
    accepted.push(normalized);
    currentLength += lineCost;
  }
  // ...
}
```
**Note:** This is the TriageRule-local variant. `buildTaggedPromptSection` in `prompt-sanitizer.ts` does the same thing with slightly different overhead math. For CORRECTIONS, use `buildTaggedPromptSection` (the shared helper), not this method.

---

### `backend/src/modules/ai/services/triage-correction.service.ts` (NEW, service, read-only)

**Analog:** `TriageFeedbackService.getSuggestions()` — same tenant-scoped, cutoff-windowed `findMany` + in-memory group.

**Imports pattern** (copy from `triage-feedback.service.ts` lines 1–2):
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
```

**Service contract (D-09a/b/c):**
```typescript
@Injectable()
export class TriageCorrectionService {
  private readonly logger = new Logger(TriageCorrectionService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns up to 3 few-shot correction examples for the email's sender.
   * Sender-first; falls back to parent domain if < 2 sender rows.
   * Ranked by frequency × exp(-ageDays / 14). Truncated to 80 chars each.
   */
  async getFewShotExamples(
    tenantId: string,
    senderFrom: string,
  ): Promise<Array<{ pattern: string; oldValue: string; newValue: string; count: number }>> {
    // 1. Extract sender email + domain (reuse extractDomain from triage-feedback.service.ts:128)
    // 2. Query signal='correction' rows, within 30-day window, tenant-scoped
    // 3. Group by (scope, target-label) pair; compute count × exp(-ageDays / 14)
    // 4. Rank desc, cap at 3, return
  }
}
```

**Ranking math (D-09b + D-12):** import the new `weightCorrection` helper from `triage-correction-weight.ts`. In Phase 147 the few-shot path uses `Math.exp(-ageDays / 14)` DIRECTLY (per D-12 divergence note) — the helper is used by the promotion path where `return ageDays <= 30 ? 1 : 0`.

---

### `backend/src/modules/email/services/email-crud.service.ts` (service, CRUD + fire-and-forget)

**Analog:** self — add D-01 auto-diff fire-and-forget at the END of `updateEmail()` (after line 299, before `return updated;`).

**Existing $transaction + post-commit fire-and-forget pattern** (lines 208–299) — canonical shape for D-01:
```typescript
async updateEmail(
  id: string,
  tenantId: string,
  data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string; aiLabels?: string[] },
) {
  // Use transaction with row-level lock to prevent TOCTOU race condition
  const { updated, originalFolder } = await this.prisma.$transaction(async (tx) => {
    // ... SELECT FOR UPDATE + update ...
    return { updated: updatedEmail, originalFolder: email.folder };
  });

  // ... realtime emits, folder counts ...

  // Sync changes back to provider (async, don't wait)
  this.syncChangesToProvider(updated, data).catch((error) => {
    this.logger.error(`Failed to sync email update to provider: ${error.message}`);
  });

  return updated;
}
```

**D-01 auto-diff insertion point** — AFTER the `$transaction` block, in the same fire-and-forget style as `syncChangesToProvider`:
```typescript
// D-01 Phase 147: Capture label corrections for triage feedback loop
if (data.aiLabels !== undefined) {
  this.triageFeedbackService
    .captureLabelDiff(tenantId, id, email.aiLabels /* old */, data.aiLabels /* new */)
    .catch((err) =>
      this.logger.warn(`Triage feedback capture failed for ${id}: ${err instanceof Error ? err.message : String(err)}`),
    );
}
```

**Classification rules (Specifics §auto-diff):**
- `removed_ai_label` (old has X, new does not): write `recordFeedback({ signal: 'edit', type: 'label_correction', oldValue: X })`.
- `added_back_correction` (new has X, old did not, X was in prior AI suggestions): write `recordFeedback({ signal: 'edit', type: 'label_correction', newValue: X })`.
- `added_personal_label` (new has X, old did not, X never AI-suggested): **do NOT fire**.
- `pure_reorder`: **do NOT fire**.

**Constructor DI injection pattern** (lines 42–53) — add `triageFeedbackService` via the same style:
```typescript
constructor(
  private prisma: PrismaService,
  private emailSyncBack: EmailSyncBackService,
  // ...
  private crypto: CryptoService,
  // ADD: private triageFeedbackService: TriageFeedbackService,
) {}
```
**Risk flag:** circular-import potential between `ai` and `email` modules. Follow memory `feedback_no_circular_deps` — if Nest emits a cycle warning, extract the feedback-capture call site into a dedicated injectable in the `ai` module that `email-crud` depends on (not the reverse).

---

### `backend/src/modules/email/controllers/email-actions.controller.ts` (controller, request-response)

**Analog:** self — add `POST /:id/correct-triage` next to existing `@Patch(':id')`.

**Existing auth + rate-tier pattern** (lines 80–82, 230–240):
```typescript
@ApiTags('Emails')
@ApiCookieAuth()
@Controller('emails')
@UseGuards(TenantGuard, RolesGuard)
export class EmailActionsController {
  // ...

  @Patch(':id')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async updateEmail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string; aiLabels?: string[] },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.updateEmail(id, tenantId, data);
  }
}
```

**New endpoint (D-01 explicit path) — exact-copy template:**
```typescript
@Post(':id/correct-triage')
@Roles('admin', 'manager', 'super-admin')
@RateTierDecorator('safe-write')
async correctTriage(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
  @Body() dto: { type: 'label_correction'; oldValue?: string; newValue: string },
) {
  const tenantId = req.user.tenantId;
  return this.emailsService.correctTriage(id, tenantId, dto);
}
```

---

### `backend/src/modules/ai/controllers/triage-overrides.controller.ts` (controller, request-response)

**Analog:** self — add admin promote endpoint.

**Existing guard + validation + Req pattern** (lines 42–70):
```typescript
@ApiTags('AI Triage Overrides')
@ApiCookieAuth()
@Controller('ai/triage-overrides')
@UseGuards(TenantGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TriageOverridesController {
  constructor(private readonly overrideService: TriageOverrideService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update a triage override' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateOverrideDto) {
    const override = await this.overrideService.addOverride(
      req.user.tenantId, dto.type, dto.pattern, dto.action,
    );
    return { override };
  }
}
```

**D-06 admin endpoint — add `RolesGuard` + `@Roles('super-admin')` following `email-actions.controller.ts` pattern:**
```typescript
@UseGuards(TenantGuard, RolesGuard)  // class-level: ADD RolesGuard
// ...

@Post('promote-suggestions')
@Roles('super-admin')
@ApiOperation({ summary: 'Admin: force-run override promotion for tenant' })
async promoteSuggestions(@Req() req: AuthenticatedRequest) {
  const result = await this.triagePromotionService.promoteOverrides(req.user.tenantId);
  return { promoted: result };
}
```
**Note:** `RolesGuard` already imported by `email-actions.controller.ts` line 12. Same import path: `../../../common/auth/roles.guard`. `@Roles` decorator from `../../../common/auth/roles.decorator`.

---

### `backend/src/modules/ai/services/triage-promotion.queue.ts` (NEW, queue-service, event-driven)

**Analog:** `backend/src/modules/telegram/services/reminder-notify.queue.ts` — EXACT pattern match. Standalone Queue+Worker in one file, shared Redis connections, delayed/deduplicated jobs, `withoutTenantScopingAsync` in the processor.

**Imports + class skeleton (copy verbatim from reminder-notify.queue.ts lines 16–59):**
```typescript
import {
  Injectable, Logger, OnModuleInit, OnModuleDestroy, OnApplicationBootstrap,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import {
  getDefaultJobOptions,
  getSharedRedisConnection,
  getSharedWorkerConnection,
  QUEUE_NAMES,
  releaseSharedRedisConnection,
  releaseSharedWorkerConnection,
} from '../../../common/config/queue.config';
// + TriagePromotionService (sibling)

interface TriagePromoteJobData {
  tenantId: string;
  triggeredAt: string;
}

@Injectable()
export class TriagePromotionQueueService
  implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap
{
  private readonly logger = new Logger(TriagePromotionQueueService.name);
  private redisConnection: Redis | null = null;
  private workerConnection: Redis | null = null;
  private queue: Queue<TriagePromoteJobData>;
  private worker: Worker<TriagePromoteJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly promotionService: TriagePromotionService,
  ) {}
```

**Queue init (copy from reminder-notify.queue.ts lines 61–77):**
```typescript
async onModuleInit() {
  this.redisConnection = getSharedRedisConnection();

  this.queue = new Queue<TriagePromoteJobData>(QUEUE_NAMES.TRIAGE_PROMOTE_OVERRIDES, {
    connection: this.redisConnection,
    defaultJobOptions: {
      ...getDefaultJobOptions('SCHEDULED'),
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    },
  });
  this.logger.log('TriagePromotionQueue initialized');
}
```

**Worker init (copy from reminder-notify.queue.ts lines 79–113):**
```typescript
async onApplicationBootstrap() {
  const jobsEnabled = (process.env.JOBS_ENABLED || 'true').toLowerCase() !== 'false';
  if (!jobsEnabled) {
    this.logger.warn('Triage promotion worker disabled via JOBS_ENABLED=false');
    return;
  }

  this.workerConnection = getSharedWorkerConnection();
  this.worker = new Worker<TriagePromoteJobData>(
    QUEUE_NAMES.TRIAGE_PROMOTE_OVERRIDES,
    async (job) => this.processPromotion(job),
    {
      connection: this.workerConnection,
      concurrency: 2,           // Multiple tenants can run in parallel
      lockDuration: 60000,      // 1min — promotion is fast
    },
  );

  this.worker.on('failed', (job, err) => {
    this.logger.error(`Triage promote job ${job?.id} failed: ${err.message}`);
  });
  this.worker.on('completed', (job) => {
    this.logger.log(`Triage promote job ${job.id} completed`);
  });
}
```

**Debounced enqueue pattern (D-06 trigger 1) — adapt reminder-notify's `scheduleNotification` (lines 134–168) + `triggerJobDeduped` shape from `scheduled-jobs.queue.ts` lines 279–290:**
```typescript
/** D-06 trigger 1: debounced enqueue — called from TriageFeedbackService.recordFeedback() */
async enqueueDebounced(tenantId: string): Promise<void> {
  await this.queue.add(
    'promote-overrides',
    { tenantId, triggeredAt: new Date().toISOString() },
    {
      delay: 5 * 60 * 1000,
      deduplication: { id: `promote:${tenantId}`, ttl: 5 * 60 * 1000 },
    },
  );
  this.logger.debug(`Queued debounced promotion for tenant ${tenantId}`);
}
```
**Key contract:** `deduplication.id` uses the `promote:{tenantId}` template per D-06. BullMQ drops the duplicate adds during the 5min window so a burst of 20 corrections collapses to one job.

**Processor wrapped in `withoutTenantScopingAsync` (reminder-notify.queue.ts lines 196–199):**
```typescript
private async processPromotion(job: Job<TriagePromoteJobData>): Promise<void> {
  return withoutTenantScopingAsync(() => this.promotionService.promoteOverrides(job.data.tenantId));
}
```

**Teardown — identical to reminder-notify.queue.ts lines 116–128:**
```typescript
async onModuleDestroy() {
  await this.worker?.close();
  await this.queue?.close();
  if (this.redisConnection) { releaseSharedRedisConnection(); this.redisConnection = null; }
  if (this.workerConnection) { releaseSharedWorkerConnection(); this.workerConnection = null; }
}
```

---

### `backend/src/common/services/scheduled-jobs.queue.ts` (config + registry)

**Analog:** self — add one enum value + one cron entry (3-file pattern).

**Existing enum pattern** (lines 32–88):
```typescript
export enum ScheduledJobType {
  SYNC_SCHEDULER = 'sync-scheduler',
  // ...
  LEAD_FEATURE_COMPUTE = 'lead-feature-compute',
  // ADD:
  TRIAGE_PROMOTION_SAFETY_NET = 'triage-promotion-safety-net',
}
```

**Existing cron registry pattern** (lines 93–126) — **CRITICAL: do not add to `0 3 * * *` cluster** (documented thundering-herd per D-06):
```typescript
export const SCHEDULED_JOB_PATTERNS: Record<ScheduledJobType, string> = {
  [ScheduledJobType.SYNC_SCHEDULER]: '*/5 * * * *',
  // ...existing entries that cluster on 0 3 * * *:
  //   WEBHOOK_DEEP_CHECK: '0 3 * * *',
  //   LEAD_FEATURE_COMPUTE: '0 3 * * *',
  //   DATA_CLEANUP: '0 3 * * *',
  // ADD (per D-06 — deliberately off-cluster):
  [ScheduledJobType.TRIAGE_PROMOTION_SAFETY_NET]: '17 4 * * *',
};
```

**Handler registration pattern** (lines 229–235) — the safety-net handler in `TriagePromotionService` calls `scheduledJobsQueue.registerHandler(ScheduledJobType.TRIAGE_PROMOTION_SAFETY_NET, (job) => this.runSafetyNet(job))` in its `onModuleInit`:
```typescript
registerHandler(jobType: ScheduledJobType, handler: ScheduledJobHandler): void {
  if (this.handlers.has(jobType)) {
    this.logger.warn(`Handler for ${jobType} already registered, replacing...`);
  }
  this.handlers.set(jobType, handler);
  this.logger.debug(`Registered handler for ${jobType}`);
}
```

**Safety-net handler body — tenant fan-out pattern:**
```typescript
// Inside TriagePromotionService.runSafetyNet:
const tenants = await this.prisma.emailTriageFeedback.findMany({
  where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  distinct: ['tenantId'],
  select: { tenantId: true },
});
for (const { tenantId } of tenants) {
  const jitter = Math.floor(Math.random() * 60_000);
  await this.triagePromotionQueueService.enqueueDebounced(tenantId, { delayOverride: jitter });
}
```

---

### `backend/src/common/config/queue.config.ts` (config)

**Analog:** self — add one entry to `QUEUE_NAMES` (lines 357–426).

**Existing QUEUE_NAMES pattern** (lines 357–426):
```typescript
export const QUEUE_NAMES = {
  EMAIL_SYNC_HIGH: 'email-sync-high',
  // ...
  REMINDER_NOTIFY: 'reminder-notify',
  // ADD:
  TRIAGE_PROMOTE_OVERRIDES: 'triage-promote-overrides',
} as const;
```

**No `QUEUE_PRESETS` change required** — reuse `'SCHEDULED'` preset (lines 197–207): `attempts: 1, backoff: { type: 'exponential', delay: 1000 }`. Per-queue override in `triage-promotion.queue.ts` already sets `attempts: 2` in `defaultJobOptions`.

---

### `backend/prisma/schema.prisma` (schema)

**Analog:** `backend/prisma/migrations/20260402170000_add_triage_overrides_and_feedback/migration.sql` — same two models are where Phase 147 adds columns.

**Migration workflow (MANDATORY per CLAUDE.md §"Prisma schema changes"):**
1. Edit `schema.prisma`:
```prisma
model EmailTriageFeedback {
  id        String   @id @default(cuid())
  tenantId  String
  emailId   String
  type      String   // 'label_correction' | 'lane_correction' | 'followup_dismiss' | 'urgency_correction'
  signal    String   @default("edit")  // D-01: 'edit' | 'correction'
  oldValue  String?
  newValue  String?
  createdAt DateTime @default(now())

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, type])
  @@index([tenantId, createdAt])
  @@index([tenantId, signal, createdAt])  // D-03: concentration-ratio query support
  @@map("email_triage_feedback")
}

model EmailAnalysis {
  // ... existing fields ...
  triageSource     String?       // D-08: 'llm' | 'rule' | 'llm+rule' — nullable until backfilled
  // ... remaining existing fields ...
}
```
2. Run `npx prisma migrate dev --name 147_feedback_loop_signal_and_triagesource` — review generated SQL, NO DROP statements expected (both are pure ADD COLUMN).
3. `npx prisma generate`.
4. Commit migration file + schema together.
5. **NEVER** `prisma db push` — memory `feedback_never_db_push_production` (2026-04-01 data-loss incident).

**Analog migration (lines 1–43)** — shape of the expected generated SQL:
```sql
-- ALTER TABLE "email_triage_feedback" ADD COLUMN "signal" TEXT NOT NULL DEFAULT 'edit';
-- ALTER TABLE "email_analyses" ADD COLUMN "triageSource" TEXT;
-- CREATE INDEX "email_triage_feedback_tenantId_signal_createdAt_idx" ON "email_triage_feedback"("tenantId", "signal", "createdAt");
```

---

### `backend/src/modules/ai/locales/en.ts` + `it.ts` (i18n, prompt-build)

**Analog:** self — extend the `analyzeUnified.systemPrompt(...)` template signature.

**Existing template** (`en.ts` lines 200–253) — closure with 3 args currently, extend to 5:
```typescript
analyzeUnified: {
  description: 'Complete email analysis in a single LLM call: ...',
  systemPrompt: (allowedLabels: string, labelRules?: string, triageRules?: string) => `You are an expert email analyst. ...

<ALLOWED_LABELS>
${allowedLabels}
</ALLOWED_LABELS>
${labelRules || ''}
${triageRules || ''}

<OUTPUT_FORMAT>
...
</OUTPUT_FORMAT>`,
},
```

**Extend signature to (per canonical_refs):**
```typescript
systemPrompt: (
  allowedLabels: string,
  labelRules?: string,
  triageRules?: string,
  correctionsBlock?: string,   // D-11: new — <CORRECTIONS>
  overrideHint?: string,        // D-07: new — <USER_OVERRIDE>
) => `You are an expert email analyst. ...

<ALLOWED_LABELS>
${allowedLabels}
</ALLOWED_LABELS>
${labelRules || ''}
${triageRules || ''}
${correctionsBlock || ''}
${overrideHint || ''}

<OUTPUT_FORMAT>
...
</OUTPUT_FORMAT>`,
```
**D-09d placement contract:** CORRECTIONS goes AFTER triageRules, then overrideHint goes LAST — RoPE recency amplifies rightmost slice. Claude's Discretion (D-07 placement) notes override hint can alternatively go before LABEL_RULES; defer to the planner.

**`types.ts` update:** the `AiTranslations` interface type for `analyzeUnified.systemPrompt` must add the two optional trailing string params so both `en.ts` and `it.ts` stay in lockstep.

**`it.ts`** — identical structural change, Italian copy for new section titles ("Correzioni recenti", "Override utente" or similar).

---

### `backend/src/modules/ai/utils/prompt-sanitizer.ts` (utility)

**Analog:** self — NO CHANGE. Reuse `buildTaggedPromptSection` as-is for `<CORRECTIONS>` and `<USER_OVERRIDE>` blocks.

**Existing helper — reuse verbatim** (lines 195–232):
```typescript
export function buildTaggedPromptSection(
  tag: string,
  lines: string[],
  maxLength?: number,
  prefix?: string,
): string {
  if (lines.length === 0) return '';

  const open = `\n<${tag}>\n`;
  const prefixBlock = prefix ? `${prefix}\n` : '';
  const close = `\n</${tag}>`;
  const limit = typeof maxLength === 'number' ? maxLength : Number.MAX_SAFE_INTEGER;
  const overhead = open.length + prefixBlock.length + close.length;
  if (limit <= overhead) return '';

  const accepted: string[] = [];
  let currentLength = overhead;

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized) continue;

    const lineCost = normalized.length + (accepted.length > 0 ? 1 : 0);
    if (currentLength + lineCost > limit) {
      const available = limit - currentLength - (accepted.length > 0 ? 1 : 0);
      if (available > 6) {
        accepted.push(truncatePromptLine(normalized, available));
      }
      break;
    }

    accepted.push(normalized);
    currentLength += lineCost;
  }
  // ...
}
```

**Also reuse `sanitizeForLLM`** (lines 116–149) — D-11 contract: sanitize each correction-example line with `{ maxLength: 80, stripCodeBlocks: true }` before passing to `buildTaggedPromptSection`.

---

### `backend/src/modules/ai/utils/triage-correction-weight.ts` (NEW, utility)

**Analog:** no direct analog — single-function helper.

**File contents (D-12 contract):**
```typescript
/**
 * Phase 149 pre-stage helper. Phase 147 implementation is a flat 30-day TTL;
 * Phase 149 swaps this for exponential decay without changing call sites.
 *
 * Call sites:
 *   - TriageFeedbackService.getSuggestions (promotion math, D-03)
 * NOT called by:
 *   - TriageCorrectionService.getFewShotExamples (uses Math.exp(-ageDays/14)
 *     directly — see D-09b / D-12 divergence note).
 */
export function weightCorrection(ageDays: number): number {
  return ageDays <= 30 ? 1 : 0;
}
```
**Tests:** co-locate simple unit spec asserting `weightCorrection(0) === 1`, `weightCorrection(30) === 1`, `weightCorrection(31) === 0`.

---

### `backend/src/modules/ai/services/__tests__/triage-prompt-budget.test.ts` (test)

**Analog:** self — update assertions for 55/25/20 split.

**Existing invariants the test enforces** (lines 120–122):
```typescript
expect(promptArgs.systemPrompt.length).toBeLessThanOrEqual(4600);
expect(triageRulesSection).not.toContain('Use this label for complex customer and system situations');
expect(labelMetadataSection).not.toContain('Use this label for complex customer and system situations');
```
**D-10 invariant preservation:** `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600` stays. DO NOT loosen. Prefix-cache invariant == test-asserted length ≤ 4600 chars — planner must keep this line untouched.

**New assertions required (D-10):**
```typescript
// LABEL_RULES section should consume <= 55% of optionalBudget (was 60%).
const labelRulesSection = String(promptArgs.systemPrompt).split('<LABEL_RULES>')[1]?.split('</LABEL_RULES>')[0] ?? '';
// Rough bound: (4600 - basePromptLen) * 0.55 — assert section length does not exceed this.

// CORRECTIONS section should be present if few-shot examples were provided.
const correctionsSection = String(promptArgs.systemPrompt).split('<CORRECTIONS>')[1]?.split('</CORRECTIONS>')[0] ?? '';
expect(correctionsSection).toBeDefined();
// CORRECTIONS budget: (4600 - basePromptLen) * 0.20
```

**Existing mock shape** (lines 9–53) — keep; add a mock for `TriageCorrectionService.getFewShotExamples` that returns 3 examples so the 20% slice is exercised.

---

### `frontend/components/email/thread/ExpandedMessage.tsx` (component, request-response)

**Analog:** self — existing `onDismissAiLabel` Chip handler (lines 689–720) is the closest UX pattern for "this should be X".

**Existing AI-label-chip pattern** (lines 672–722) — the "dismiss" affordance is here; the "correct to X" affordance extends the same Chip's interaction surface:
```typescript
{/* AI-suggested Labels */}
{message.aiLabels && message.aiLabels.length > 0 && (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, /* ... */ }}>
    <Sparkles size={14} style={{ color: 'var(--mui-palette-text-disabled)' }} />
    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
      {t.email?.labels?.aiSuggestedLabel || 'AI'}
    </Typography>
    {message.aiLabels.map((aiLabel) => (
      <Chip
        key={aiLabel}
        label={localizeAiLabel(aiLabel, locale)}
        size="small"
        variant="outlined"
        deleteIcon={
          onDismissAiLabel ? (
            <Tooltip title={t.email?.labels?.dismissAiLabel || 'Dismiss'}>
              <X size={12} />
            </Tooltip>
          ) : undefined
        }
        onDelete={onDismissAiLabel ? () => onDismissAiLabel(message.id, aiLabel) : undefined}
        onClick={onAcceptAiLabel ? () => onAcceptAiLabel(message.id, aiLabel) : undefined}
        icon={onAcceptAiLabel ? <Check size={12} /> : undefined}
        sx={{ /* ... */ }}
      />
    ))}
  </Box>
)}
```

**D-01 extension approach — Claude's Discretion per CONTEXT.md §decisions:**
- Add a secondary action (popover menu or icon button next to the `X`) that opens a label picker → calls new `POST /emails/:id/correct-triage` endpoint.
- Only attach to AI-SUGGESTED labels (`message.aiLabels`), NOT to user-added labels in `message.labels`. This is explicit per D-01 — keeps "personal organization" out of the learning signal.
- Follow `LabelPickerDialog.tsx` (`frontend/components/email/labels/LabelPickerDialog.tsx`) as the label-selection pattern; attach to the Chip via a `...Tooltip` wrapper mirroring the existing dismiss action.

**Translations (CLAUDE.md §Frontend Procedure step 1):** before writing the component, add keys to `frontend/locales/en.ts` and `it.ts` (e.g., `t.email.labels.correctTo = 'Should be...' / 'Dovrebbe essere...'`) and to `frontend/locales/index.ts` types. Do NOT hardcode strings.

**TanStack Query hook (CLAUDE.md §Frontend Procedure step 2):** create `frontend/hooks/queries/use-correct-triage.ts` wrapping the new endpoint via the existing `lib/api` pattern (mutation, not query). Export from `hooks/queries/index.ts`.

---

## Shared Patterns

### Multi-Tenant Query Filter (MANDATORY)

**Source:** `triage-override.service.ts` line 54, `triage-feedback.service.ts` line 63, `email-crud.service.ts` line 141
**Apply to:** every new Prisma query in every new/modified file

```typescript
await this.prisma.triageOverride.findMany({
  where: { tenantId },
  orderBy: { createdAt: 'desc' },
});

// or with compound filter:
await this.prisma.emailTriageFeedback.findMany({
  where: {
    tenantId,
    type: { in: ['label_correction', 'lane_correction'] },
    createdAt: { gte: cutoff },
  },
  select: { emailId: true, type: true, newValue: true },
});
```
**Contract (CLAUDE.md §"Multi-tenant rule"):** every query MUST include `tenantId`. A query without it is a security vulnerability. Enforced by the planner task-level.

### Prisma Upsert (Concurrent-Safe Promotion)

**Source:** `triage-override.service.ts` lines 83–89
**Apply to:** promotion handler in `triage-promotion.service.ts` — use `addOverride` call, NOT a raw `create`

```typescript
const row = await this.prisma.triageOverride.upsert({
  where: {
    tenantId_type_pattern: { tenantId, type, pattern: normalizedPattern },
  },
  update: { action },
  create: { tenantId, type, pattern: normalizedPattern, action },
});
```
**Why:** the debounced queue can still run twice in rare cases (job retry). `upsert` + the existing `@@unique([tenantId, type, pattern])` constraint makes it idempotent. `code_context.Established Patterns.Prisma retry` — handles P2002 cleanly.

### Fire-and-Forget Side Effect After Await

**Source:** `email-triage.service.ts` lines 297–305, `email-crud.service.ts` lines 289–297
**Apply to:** D-01 `recordFeedback` call in `EmailCrudService.updateEmail`

```typescript
this.triageActionService
  .processTriageSignals(args, analysis)
  .catch((err) =>
    this.logger.warn(`Follow-up creation failed for ${emailId}: ${err instanceof Error ? err.message : String(err)}`),
  );
```
**Contract:** (1) await the main operation (commit transaction) first, (2) THEN invoke the side effect WITHOUT await, (3) swallow the error via `.catch(this.logger.warn(...))` — never throw from a post-commit side effect. This is the sanctioned PMSync pattern.

### BullMQ Queue+Worker Module

**Source:** `backend/src/modules/telegram/services/reminder-notify.queue.ts` (exact template for new `triage-promotion.queue.ts`)
**Apply to:** `TriagePromotionQueueService`

Key invariants:
- `getSharedRedisConnection()` / `getSharedWorkerConnection()` — ref-counted singletons, release in `onModuleDestroy`.
- Queue created in `onModuleInit`, worker created in `onApplicationBootstrap` (lets handlers register first).
- `JOBS_ENABLED=false` bypass (see `scheduled-jobs.queue.ts` lines 171–175 and `reminder-notify.queue.ts` lines 80–85).
- Processor wrapped with `withoutTenantScopingAsync` from `backend/src/prisma/tenant-scoping/tenant-context`.
- `removeOnComplete` / `removeOnFail` limits + 2 attempts with exponential backoff.

### Controller Auth Stack

**Source:** `email-actions.controller.ts` lines 78–82, `triage-overrides.controller.ts` lines 42–46
**Apply to:** new `POST /:id/correct-triage` and `POST /promote-suggestions`

```typescript
@ApiTags('...')
@ApiCookieAuth()
@Controller('...')
@UseGuards(TenantGuard, RolesGuard)
export class XxxController { /* ... */ }

@Post('...')
@Roles('admin', 'manager', 'super-admin')  // OR @Roles('super-admin') for admin-only
@RateTierDecorator('safe-write')            // OR 'destructive-write'
async handler(@Req() req: AuthenticatedRequest, @Body() dto: DtoType) {
  const tenantId = req.user.tenantId;
  // ...
}
```
**Contract:** `tenantId = req.user.tenantId` — NEVER accept `tenantId` from request body.

### Prompt-Sanitizer Pipeline

**Source:** `email-analysis.service.ts` lines 384–391 (sanitize + redact + wrap)
**Apply to:** CORRECTIONS block line construction (D-11)

```typescript
const piiRedacted = this.redactPii(rawText);
const sanitized = sanitizeForLLM(piiRedacted, { maxLength: 80, stripCodeBlocks: true });
// Then pass to buildTaggedPromptSection(...)
```
**Contract:** any user-originated string (sender addresses, old/new label values) that enters an LLM prompt MUST flow: `redactPii` → `sanitizeForLLM` → truncate. NEVER pass raw email data to the LLM.

### Prisma Migration Workflow (MANDATORY — NEVER `prisma db push`)

**Source:** CLAUDE.md §"Prisma schema changes (MANDATORY migration workflow)", memory `feedback_never_db_push_production` (2026-04-01 prod wipe)
**Apply to:** `147_feedback_loop_signal_and_triagesource` migration

1. Edit `schema.prisma` (add `signal` + `triageSource` columns + new compound index).
2. `npx prisma migrate dev --name 147_feedback_loop_signal_and_triagesource`.
3. Review generated SQL — expect ONLY `ALTER TABLE ... ADD COLUMN` and `CREATE INDEX`. Any `DROP` → STOP + ASK.
4. `npx prisma generate`.
5. Commit migration file + schema together; Railway deploy pipeline applies on push.
6. **FORBIDDEN:** `prisma db push`, `prisma migrate reset`, direct SQL to prod.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/modules/ai/utils/triage-correction-weight.ts` | utility | — | Trivial single-function helper; no similar stand-alone weight utility in codebase. Pattern is self-contained and intentionally small per D-12 pre-staging contract. |

---

## Metadata

**Analog search scope:**
- `backend/src/modules/ai/**` (services, controllers, utils, locales)
- `backend/src/modules/email/**` (services, controllers)
- `backend/src/common/**` (workers, services, config, auth)
- `backend/src/modules/telegram/services/reminder-notify.queue.ts` (exact-match debounced-queue template)
- `backend/prisma/schema.prisma` + `backend/prisma/migrations/**`
- `frontend/components/email/thread/ExpandedMessage.tsx` + `frontend/components/email/labels/**`

**Files scanned:** ~45 source files, 29 migration files, 3 worker files, 1 queue-service template, 2 locale files.

**Pattern extraction date:** 2026-04-19

**Downstream contract:** Planner references this file from every task in `147-*-PLAN.md`. Each task MUST cite the specific "Pattern Assignments §{file}" section and/or "Shared Patterns §{pattern}" it copies from. "Follow existing patterns" is not a valid task — every task must name the analog file + line range.
