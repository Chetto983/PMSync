# Phase 35: AI Observability & Permissions - Research

**Researched:** 2026-03-04
**Domain:** AI telemetry, cost tracking, permission taxonomy (NestJS + Prisma + AI SDK v6)
**Confidence:** HIGH

## Summary

Phase 35 instruments every AI call path in the application with fire-and-forget telemetry writing to the existing `AiRunLedger` Prisma model, exposes two query endpoints for cost/usage visibility, and documents a permission taxonomy for future RBAC implementation (v4.1).

The schema already exists in `backend/prisma/schema.prisma` (applied via direct SQL in Phase 31), but zero code writes to it yet -- `aiRunLedger` has no references in the codebase. There are exactly 5 AI call paths to instrument: (1) AiChatService.streamChat (streaming), (2) BriefingService.generateBriefing, (3) FollowUpDetectionService.detectFollowUps, (4) DraftGenerationService.generateDraft, and (5) MistralService.completePrompt (used by EmailInsightsService for unified analysis, smart replies, and compose). The first uses `streamText` from AI SDK v6 (streaming), the rest use `generateText`. All return usage via `usage.inputTokens` / `usage.outputTokens` / `usage.totalTokens`, but the Prisma schema uses `promptTokens` / `completionTokens` / `totalTokens` -- a trivial mapping.

**Primary recommendation:** Create an `AiRunLedgerService` as a thin, injectable Prisma writer that every AI service calls fire-and-forget via `.catch()`. Do NOT use interceptors or AOP -- the AI calls are deeply embedded in service logic with service-specific context (runType, model, tool counts). Instrument each service's existing `onFinish`/result handler to record the ledger entry.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIOBS-01 | AiRunLedger Prisma model captures runType, model, token counts, estimatedCostUsd, latencyMs, toolCallCount, hitlRequired, requestId | Schema exists. AiRunLedgerService writes entries. Cost estimation uses COST_PER_MILLION_TOKENS map. CorrelationContext.getContext()?.correlationId provides requestId. |
| AIOBS-02 | Fire-and-forget telemetry across AiChatService, BriefingService, FollowUpDetectionService, DraftGenerationService | 5 instrumentation points identified (see AI Call Paths). Each gets `startTime = Date.now()` before LLM call, `recordRun()` after. |
| AIOBS-03 | GET /api/v1/ai/runs and /cost-summary endpoints with tenant and date filters | New controller on AiModule (or AiObservabilityController). Paginated list + aggregate query. Uses existing ResponseEnvelopeInterceptor. |
| AIOBS-04 | Permission taxonomy documented with PolicyService TypeScript interface | Documentation-only + interface file. resource:action pairs enumerated. PolicyService interface defines evaluate/check/listPermissions methods. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.x (existing) | Database writes for AiRunLedger | Already in project, schema defined |
| AI SDK v6 | `ai` package (existing) | Token usage from streamText/generateText | Already used by all AI services |
| @nestjs/common | 11.x (existing) | DI, controllers, guards | Project standard |
| nanoid | (existing) | Correlation IDs | Already imported via correlation-context |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-validator | (existing) | DTO validation for query params | Endpoint DTOs |
| @nestjs/swagger | (existing) | OpenAPI decorators | Endpoint documentation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct Prisma writes | BullMQ queue for async ledger writes | Overkill -- fire-and-forget `.catch()` is sufficient for non-critical telemetry. Queue adds latency for write, not for the caller. |
| Service-level instrumentation | NestJS interceptor wrapping AI calls | AI calls are buried in service methods with service-specific context (runType, model, toolCallCount). Interceptor can't access these. |
| Flat cost constants | Dynamic pricing from Mistral API | Unnecessary complexity. Static cost map per model, updated when model pricing changes. Matches existing `OPERATION_COSTS` pattern. |

**Installation:**
No new packages needed. All dependencies already exist.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
  modules/ai/
    services/
      ai-run-ledger.service.ts       # NEW: Thin Prisma writer
    controllers/
      ai-observability.controller.ts  # NEW: GET /runs, GET /runs/cost-summary
    dto/
      ai-runs-query.dto.ts           # NEW: Query param validation
  docs/
    permission-taxonomy.ts            # NEW: PolicyService interface + resource:action enum
```

### Pattern 1: Fire-and-Forget Ledger Recording
**What:** Each AI service calls `ledgerService.recordRun()` in its completion handler, wrapped in `.catch()` so failures never affect the user.
**When to use:** Every AI call path.
**Example:**
```typescript
// In AiChatService.streamChat, inside onFinish callback:
const startTime = Date.now();
// ... existing streamText call ...
onFinish: async ({ usage, steps }) => {
  const toolCallCount = steps?.reduce(
    (sum, s) => sum + (s.toolCalls?.length ?? 0), 0
  ) ?? 0;

  this.ledgerService.recordRun({
    tenantId,
    userId,
    runType: 'chat',
    model: model ?? 'mistral-small-latest',
    promptTokens: usage?.inputTokens ?? 0,
    completionTokens: usage?.outputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    latencyMs: Date.now() - startTime,
    toolCallCount,
    requestId: CorrelationContext.getContext()?.correlationId,
  }).catch(err => this.logger.warn(`Ledger write failed: ${err.message}`));
}
```

### Pattern 2: Cost Estimation via Static Map
**What:** Map model name to per-token pricing. Calculate `estimatedCostUsd` from token counts.
**When to use:** Inside `AiRunLedgerService.recordRun()` before Prisma write.
**Example:**
```typescript
// Cost per 1M tokens (input, output)
const COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'mistral-small-latest': { input: 0.06, output: 0.18 },
  'mistral-small-3.2': { input: 0.06, output: 0.18 },
  'ministral-3b-latest': { input: 0.10, output: 0.10 },
  'mistral-large-latest': { input: 2.00, output: 6.00 },
  'mistral-embed': { input: 0.01, output: 0.01 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = COST_PER_MILLION_TOKENS[model]
    ?? COST_PER_MILLION_TOKENS['mistral-small-latest']; // Fallback
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
```

### Pattern 3: Aggregated Cost Summary Endpoint
**What:** Use Prisma `groupBy` + `_sum` for tenant cost aggregation.
**When to use:** `GET /api/v1/ai/runs/cost-summary`
**Example:**
```typescript
const summary = await this.prisma.aiRunLedger.aggregate({
  where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
  _sum: { estimatedCostUsd: true, promptTokens: true, completionTokens: true },
  _count: true,
});
```

### Anti-Patterns to Avoid
- **Synchronous ledger writes blocking the response:** Always fire-and-forget with `.catch()`. Never `await` the ledger write in the hot path.
- **Token count NaN propagation:** AI SDK can return NaN for token counts with some providers. Always `?? 0` defensive coalescing.
- **Wrapping streamText in try/catch for ledger:** The ledger write goes in `onFinish`/`onStepFinish`, not wrapping the stream creation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Manual tokenizer | AI SDK `usage` object | Returned by streamText/generateText natively |
| Correlation ID access | Custom context passing | `CorrelationContext.getContext()?.correlationId` | Already propagated by Phase 33 CorrelationInterceptor |
| Response envelope | Manual wrapping | Existing `ResponseEnvelopeInterceptor` | Phase 33 global interceptor handles `{ data, meta }` |
| Pagination | Custom offset logic | Prisma `skip`/`take` with cursor-based option | Standard Prisma pagination |
| Cost tracking | Complex metering | Static cost map + arithmetic | Mistral pricing is stable, updates are rare |

## Common Pitfalls

### Pitfall 1: AI SDK Token Usage Returns NaN
**What goes wrong:** `streamText` with some providers returns `NaN` for `inputTokens`, `outputTokens`, `totalTokens` in the `onFinish` callback.
**Why it happens:** Provider doesn't report usage for streaming, or the stream is aborted before completion.
**How to avoid:** Always coalesce: `usage?.inputTokens ?? 0`. For streaming, also check `isNaN()` and fallback to 0.
**Warning signs:** Ledger entries with `promptTokens = 0` or `NaN` in database.

### Pitfall 2: AI SDK v6 Property Name Mismatch
**What goes wrong:** Code references `usage.promptTokens` (OpenAI naming) but AI SDK v6 uses `usage.inputTokens` / `usage.outputTokens`.
**Why it happens:** Confusion between OpenAI SDK naming conventions and Vercel AI SDK v6 naming.
**How to avoid:** The mapping is: `inputTokens` -> `promptTokens` (Prisma), `outputTokens` -> `completionTokens` (Prisma).
**Warning signs:** TypeScript compile errors or always-zero token counts.

### Pitfall 3: Streaming Latency Regression
**What goes wrong:** Adding `await prisma.aiRunLedger.create()` in the stream pipeline adds 5-50ms to first-token time.
**Why it happens:** Prisma write is synchronous and blocks the stream.
**How to avoid:** NEVER await the ledger write. Use fire-and-forget: `this.ledgerService.recordRun(...).catch(...)`. The `recordRun` call itself should be in `onFinish` (after stream completes), not `onStepFinish`.
**Warning signs:** First-token-time increases >50ms in before/after comparison.

### Pitfall 4: Missing Instrumentation for MistralService.completePrompt
**What goes wrong:** Only BriefingService, FollowUpDetectionService, and DraftGenerationService are instrumented, but EmailInsightsService calls MistralService.completePrompt directly.
**Why it happens:** `completePrompt` is a lower-level facade used by multiple higher-level services (email analysis, smart replies, compose).
**How to avoid:** Instrument at the `MistralService.completePrompt` level, passing `runType` as a parameter (e.g., 'email-analysis', 'smart-reply', 'compose'). This catches ALL callers.
**Warning signs:** AI calls appear in billing but not in the ledger.

### Pitfall 5: Double-Counting with Retry
**What goes wrong:** `MistralService.completePrompt` uses `withRetry` (up to 3 retries). Each retry is a separate LLM call with its own cost.
**Why it happens:** Retry wrapper re-executes the `generateText` call.
**How to avoid:** Instrument inside the retry loop (per-call), or instrument outside and accept that retried calls are counted as a single logical run with cumulative cost. Decision: instrument per-call for accurate cost tracking.
**Warning signs:** Cost estimates are 3x lower than actual Mistral invoices.

## AI Call Paths (Complete Inventory)

All paths that make LLM API calls and need ledger instrumentation:

| # | Service | Method | AI SDK Function | RunType | Model | Has Usage Access | Notes |
|---|---------|--------|-----------------|---------|-------|-----------------|-------|
| 1 | AiChatService | streamChat | streamText | `chat` | configurable (default: mistral-small-latest) | Yes, via onFinish `usage` + `steps` for toolCallCount | Streaming -- instrument in onFinish only |
| 2 | AiChatService | maybeTriggerSummaryGeneration | generateText | `chat-summary` | mistral-small-latest | Yes, via result.usage (not currently captured) | Fire-and-forget from onFinish |
| 3 | BriefingService | generateBriefing/generateWithFallback | generateText | `briefing` | mistral-small-latest | Yes, via result (not currently captured) | Has retry path -- both attempts should log |
| 4 | FollowUpDetectionService | detectFollowUps/generateWithFallback | generateText | `follow-up-detection` | mistral-small-latest | Yes, via result (not currently captured) | Has retry path |
| 5 | DraftGenerationService | generateDraft/generateWithFallback | generateText | `draft-generation` | mistral-small-latest | Yes, via result (not currently captured) | Has retry path |
| 6 | MistralService | completePrompt | generateText | `email-analysis` / `smart-reply` / `compose` / `title-gen` | configurable via modelTier | Yes, via `text` return only -- usage not captured | Central facade -- instrument here catches EmailInsightsService calls |

### Services That Do NOT Need Direct Instrumentation
- **EmailInsightsService** -- delegates to MistralService.completePrompt (instrumented at #6)
- **EmailTriageService** -- delegates to EmailInsightsService.analyzeEmailUnified
- **MeetingPrepService** -- no AI calls (data assembly only)
- **IntentRouterService** -- uses regex/FastText classifier, no LLM calls
- **MemoryService** -- retrieval only, no generation

## Code Examples

### AiRunLedgerService (new file)
```typescript
// backend/src/modules/ai/services/ai-run-ledger.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiRunStatus } from '@prisma/client';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

export interface RecordRunParams {
  tenantId: string;
  userId: string;
  runType: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  toolCallCount?: number;
  hitlRequired?: boolean;
  requestId?: string;
  status?: AiRunStatus;
  errorCode?: string;
  errorMessage?: string;
  promptVersion?: string;
}

// Cost per 1M tokens { input, output }
const COST_MAP: Record<string, { input: number; output: number }> = {
  'mistral-small-latest': { input: 0.06, output: 0.18 },
  'ministral-3b-latest': { input: 0.10, output: 0.10 },
  'mistral-large-latest': { input: 2.00, output: 6.00 },
  'mistral-embed': { input: 0.01, output: 0.01 },
};

@Injectable()
export class AiRunLedgerService {
  private readonly logger = new Logger(AiRunLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordRun(params: RecordRunParams): Promise<void> {
    const pricing = COST_MAP[params.model] ?? COST_MAP['mistral-small-latest'];
    const estimatedCostUsd =
      (params.promptTokens * pricing.input +
        params.completionTokens * pricing.output) / 1_000_000;

    const requestId =
      params.requestId ??
      CorrelationContext.getContext()?.correlationId;

    await this.prisma.aiRunLedger.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        runType: params.runType,
        model: params.model,
        promptTokens: this.safeInt(params.promptTokens),
        completionTokens: this.safeInt(params.completionTokens),
        totalTokens: this.safeInt(params.totalTokens),
        estimatedCostUsd,
        latencyMs: params.latencyMs,
        toolCallCount: params.toolCallCount ?? 0,
        hitlRequired: params.hitlRequired ?? false,
        requestId,
        status: params.status ?? AiRunStatus.SUCCESS,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        promptVersion: params.promptVersion,
      },
    });
  }

  private safeInt(value: number): number {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
}
```

### Instrumentation in BriefingService (example pattern for non-chat services)
```typescript
// Inside generateWithFallback method:
const startTime = Date.now();
try {
  const result = await generateText({ ... });
  // Record success
  this.ledgerService.recordRun({
    tenantId, userId: 'system',
    runType: 'briefing',
    model: 'mistral-small-latest',
    promptTokens: result.usage?.inputTokens ?? 0,
    completionTokens: result.usage?.outputTokens ?? 0,
    totalTokens: result.usage?.totalTokens ?? 0,
    latencyMs: Date.now() - startTime,
  }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
  return { data: result.output };
} catch (error) {
  // Record failure
  this.ledgerService.recordRun({
    tenantId, userId: 'system',
    runType: 'briefing',
    model: 'mistral-small-latest',
    promptTokens: 0, completionTokens: 0, totalTokens: 0,
    latencyMs: Date.now() - startTime,
    status: AiRunStatus.FAILED,
    errorMessage: error instanceof Error ? error.message : String(error),
  }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
  // existing error handling...
}
```

### Query Endpoints (controller pattern)
```typescript
// GET /api/v1/ai/runs?page=1&limit=20&startDate=2026-03-01&endDate=2026-03-04
@Get('runs')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiOperation({ summary: 'List AI run records' })
async listRuns(
  @Req() req: AuthenticatedRequest,
  @Query() query: AiRunsQueryDto,
) {
  const where = {
    tenantId: req.user.tenantId,
    ...(query.startDate && { createdAt: { gte: new Date(query.startDate) } }),
    ...(query.endDate && { createdAt: { ...where.createdAt, lte: new Date(query.endDate) } }),
    ...(query.runType && { runType: query.runType }),
  };
  const [items, total] = await Promise.all([
    this.prisma.aiRunLedger.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
      take: query.limit ?? 20,
    }),
    this.prisma.aiRunLedger.count({ where }),
  ]);
  return { items, total, page: query.page ?? 1, limit: query.limit ?? 20 };
}
```

### Permission Taxonomy Interface
```typescript
// backend/src/common/interfaces/policy-service.interface.ts

/** Resource:action pairs for PMSync platform */
export enum Permission {
  // Email
  EMAIL_READ = 'email:read',
  EMAIL_WRITE = 'email:write',
  EMAIL_DELETE = 'email:delete',
  EMAIL_SEND = 'email:send',

  // AI
  AI_CHAT = 'ai:chat',
  AI_BRIEFING = 'ai:briefing',
  AI_TRIAGE = 'ai:triage',
  AI_DRAFT = 'ai:draft',
  AI_RUNS_READ = 'ai:runs:read',
  AI_RUNS_EXPORT = 'ai:runs:export',

  // Calendar
  CALENDAR_READ = 'calendar:read',
  CALENDAR_WRITE = 'calendar:write',
  CALENDAR_DELETE = 'calendar:delete',

  // Contacts
  CONTACTS_READ = 'contacts:read',
  CONTACTS_WRITE = 'contacts:write',
  CONTACTS_DELETE = 'contacts:delete',
  CONTACTS_EXPORT = 'contacts:export',

  // Admin
  ADMIN_USERS = 'admin:users',
  ADMIN_BILLING = 'admin:billing',
  ADMIN_AUDIT = 'admin:audit',
  ADMIN_SETTINGS = 'admin:settings',
}

export interface PolicyEvaluation {
  allowed: boolean;
  reason?: string;
  requiredPermissions: Permission[];
}

export interface IPolicyService {
  /** Evaluate whether a subject can perform action on resource */
  evaluate(
    subjectId: string,
    permission: Permission,
    context?: Record<string, unknown>,
  ): Promise<PolicyEvaluation>;

  /** Batch check multiple permissions */
  checkAll(
    subjectId: string,
    permissions: Permission[],
  ): Promise<Map<Permission, boolean>>;

  /** List effective permissions for a subject */
  listPermissions(subjectId: string): Promise<Permission[]>;
}

export const POLICY_SERVICE = Symbol('POLICY_SERVICE');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `usage.promptTokens` (OpenAI naming) | `usage.inputTokens` (AI SDK v6) | AI SDK v4->v6 | Must map to Prisma schema field names |
| `onStepFinish` for total usage | `onFinish` for cumulative usage | AI SDK v6 | onFinish gives total across all steps |
| Manual token counting | AI SDK native usage reporting | AI SDK v4+ | No need for tokenizer library |

**Deprecated/outdated:**
- `usage.promptTokens` / `usage.completionTokens` -- AI SDK v6 uses `inputTokens` / `outputTokens`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x + Jest 30.x (dual) |
| Config file | `backend/vitest.config.ts` (vitest), `backend/jest.config.js` (jest) |
| Quick run command | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIOBS-01 | AiRunLedger record created with all fields | unit | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts -t "creates ledger entry"` | Wave 0 |
| AIOBS-01 | Cost estimation calculates correctly | unit | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts -t "estimates cost"` | Wave 0 |
| AIOBS-02 | Chat stream onFinish creates ledger entry | integration | `cd backend && npx vitest run src/modules/ai-chat/__tests__/chat-ledger.test.ts` | Wave 0 |
| AIOBS-02 | Briefing generates ledger entry | integration | `cd backend && npx vitest run src/modules/ai/services/__tests__/briefing-ledger.test.ts` | Wave 0 |
| AIOBS-03 | GET /runs returns paginated results | integration | `cd backend && npx vitest run src/modules/ai/__tests__/ai-observability.controller.test.ts -t "list runs"` | Wave 0 |
| AIOBS-03 | GET /runs/cost-summary returns aggregates | integration | `cd backend && npx vitest run src/modules/ai/__tests__/ai-observability.controller.test.ts -t "cost summary"` | Wave 0 |
| AIOBS-04 | Permission enum covers all resource:action pairs | unit | `cd backend && npx vitest run src/common/__tests__/policy-service.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/ai/services/__tests__/ai-run-ledger.test.ts` -- covers AIOBS-01 (service unit tests)
- [ ] `backend/src/modules/ai/__tests__/ai-observability.controller.test.ts` -- covers AIOBS-03 (endpoint tests)
- [ ] `backend/src/common/__tests__/policy-service.test.ts` -- covers AIOBS-04 (interface validation)

## Open Questions

1. **BriefingService has no userId**
   - What we know: `generateBriefing(tenantId)` takes only tenantId, no userId.
   - What's unclear: Should ledger entries for briefing use `'system'` as userId, or should we thread userId through?
   - Recommendation: Use `'system'` for Phase 35. If user-scoped briefing is needed later, add userId parameter.

2. **MistralService.completePrompt usage data**
   - What we know: `completePrompt` returns only `text` (string), not the full `generateText` result. Token usage is discarded.
   - What's unclear: Whether to refactor `completePrompt` to return usage, or wrap the generateText call.
   - Recommendation: Modify `completePrompt` to capture `usage` from the `generateText` result and pass it to ledger internally. The return type stays `string` to avoid breaking callers.

3. **Exact Mistral model pricing accuracy**
   - What we know: Pricing changes over time. Current mistral-small-latest maps to mistral-small-3.2 at $0.06/$0.18 per 1M tokens.
   - What's unclear: Whether "latest" alias will shift to a different model/price.
   - Recommendation: Use static cost map with model name keys. Log unknown models at WARN level with fallback to mistral-small-latest pricing. Update map when model pricing changes.

## Sources

### Primary (HIGH confidence)
- `backend/prisma/schema.prisma` lines 1456-1486 -- AiRunLedger model definition with indexes
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` -- streamChat pipeline with onFinish/onStepFinish
- `backend/src/modules/ai/services/briefing.service.ts` -- generateText + Output.object pattern
- `backend/src/modules/ai/services/follow-up-detection.service.ts` -- batch detection pattern
- `backend/src/modules/ai/services/draft-generation.service.ts` -- single-email draft pattern
- `backend/src/modules/ai/services/mistral.service.ts` -- completePrompt facade used by EmailInsights
- `backend/src/common/services/correlation-context.service.ts` -- CorrelationContext.getContext()
- [AI SDK streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) -- onFinish usage structure
- [AI SDK generateText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text) -- usage.inputTokens/outputTokens

### Secondary (MEDIUM confidence)
- [Mistral AI Pricing (pricepertoken.com)](https://pricepertoken.com/pricing-page/provider/mistral-ai) -- mistral-small-3.2 at $0.06/$0.18 per 1M tokens
- `backend/src/modules/subscription/services/usage-tracking.service.ts` -- OPERATION_COSTS pattern for static cost maps
- `backend/src/modules/auth/guards/roles.guard.ts` -- existing RBAC pattern (string roles via @Roles decorator)
- `backend/src/modules/auth/decorators/roles.decorator.ts` -- SetMetadata pattern for future PolicyService integration

### Tertiary (LOW confidence)
- Exact model pricing may drift -- Mistral updates pricing periodically. Cost map needs periodic review.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- patterns directly observed in codebase, AI SDK docs verified
- Pitfalls: HIGH -- NaN token issue well-documented in AI SDK GitHub issues; property name mismatch verified against codebase test file
- Cost estimation: MEDIUM -- pricing verified via third-party aggregator, not official docs (JS-rendered page)
- Permission taxonomy: HIGH -- requirements explicitly state "interface defined, ready for RBAC in v4.1" -- no runtime enforcement needed

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain -- Prisma schema locked, AI SDK v6 stable)
