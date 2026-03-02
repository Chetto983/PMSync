# Phase 26: Non-Chat AI & Backend Testing - Research

**Researched:** 2026-03-02
**Domain:** AI SDK v6 structured output, NestJS service architecture, Vitest + MSW integration testing
**Confidence:** HIGH

## Summary

Phase 26 replaces the deleted VoltAgent agent loops with direct `generateText + Output.object()` calls for three non-chat AI features: daily briefing, follow-up detection, and draft generation. It also requires building new domain services (CRM relationship scoring in contacts module, calendar conflict/focus/meeting-prep in calendar module) and comprehensive integration test suites for both the chat and non-chat AI pipelines.

The project already has all core infrastructure in place: AI SDK v6 (`ai@6.0.77`) with `generateText` and `Output.object()`, Zod 4 (`zod@4.3.6`) for schema definitions (already used in 5 tool service files), MSW v2 (`msw@2.12.10`) with SSE streaming handlers, Vitest (`vitest@4.0.18`), and a `MistralProviderService` that wraps `@ai-sdk/mistral`. The main challenge is designing the Zod schemas, wiring new services with proper NestJS DI, and building MSW handlers that return deterministic structured outputs for testing.

**Primary recommendation:** Build three new `@Injectable()` services in `backend/src/modules/ai/services/` (BriefingService, FollowUpDetectionService, DraftGenerationService), each co-locating its Zod schema, fetching its own data from existing services, and calling `generateText` with `Output.object()`. Add domain services directly in contacts and calendar modules. Wire all new endpoints through the existing `AiController` (non-chat AI) and new domain controllers. Test with MSW-mocked non-streaming Mistral responses.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New services (BriefingService, FollowUpDetectionService, DraftGenerationService) live inside the existing `ai` module as `ai/services/*.service.ts`
- Each service uses `generateText + Output.object()` with pre-fetched data -- no agent loops, no tool calls during generation
- Per-service data fetching: each service fetches exactly the data it needs from existing services (EmailsService, ContactsService, CalendarService) -- no shared DataContextBuilder
- API routes change from `/api/v1/voltagent/*` to `/api/v1/ai/*` (clean break from VoltAgent naming). Frontend `voltAgentApi` client updated in this phase
- 50+ case quality comparison via automated comparison script
- Build domain services from scratch in the proper modules (VoltAgent code is already deleted)
- Contacts module: RelationshipScoreService with full CRM analysis
- Calendar module: Three services -- CalendarConflictService, FocusTimeService, MeetingPrepService
- All new domain services get both REST endpoints (controllers) AND are injectable by other services
- Test runner: Vitest
- Chat pipeline tests: full pipeline with MSW mocks -- MSW intercepts Mistral API, returns deterministic responses triggering specific tools, verify full chain
- Non-chat AI tests: snapshot fixtures from anonymized production data (JSON), stored in `backend/test/fixtures/ai/`
- E2E validation gate: separate test files, CI-optional with test tag, requires `MISTRAL_API_KEY` secret
- Zod schemas co-located with their services
- Strict validation with graceful fallback: Zod strict parse -> on failure: log raw output + error, retry once with tighter prompt, then return safe fallback with error flag
- Frontend types derived from Zod via `z.infer<typeof schema>` -- single source of truth
- Briefing schema: comprehensive (priority emails, calendar, follow-ups, summary, stale contacts, draft suggestions, volume trends, focus time recs)
- Follow-up detection: batch analysis mode (24h window), one LLM call per batch
- Draft generation: reply context + tone + output via Output.object()

### Claude's Discretion
- CRM relationship scoring schema fields and scoring algorithm approach
- Calendar AI service schema fields (conflict, focus, meeting prep)
- Exact MSW handler structure for mocked Mistral responses
- Test fixture anonymization strategy
- Error retry prompt wording for schema validation failures
- Exact Zod schema field naming (camelCase vs snake_case) -- match existing codebase conventions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-07 | Non-chat AI (daily briefing, follow-up detection, draft generation, email analysis) uses `generateText + Output.object()` -- single LLM call per operation, no agent loops | `Output.object()` API verified in AI SDK v6.0.77; Zod 4 schemas work with `tool()` already in codebase; `NoObjectGeneratedError` available for error handling; `MistralProviderService.getChatModel()` provides the model |
| TEST-02 | Integration tests for new AI chat pipeline (message -> tool execution -> streaming response) | MSW v2 infrastructure exists (`backend/src/test/`); SSE streaming handler pattern established in `mistral-chat.handler.ts`; Vitest configured; E2E test pattern established in `ai-chat-e2e.test.ts` and `tools-rag-e2e.test.ts` |
| TEST-03 | Integration tests for non-chat AI (briefing, follow-ups, drafts via generateText) | MSW non-streaming handler (`HttpResponse.json()`) pattern available; Vitest test structure matches `.test.ts` include pattern; fixture-based testing with Zod schema validation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.0.77 | `generateText` + `Output.object()` for structured LLM output | Already installed; provides type-safe structured generation with Zod schemas |
| `zod` | 4.3.6 | Schema definitions for structured output + validation | Already installed; used by 5 tool services; `z.infer<>` for frontend type derivation |
| `@ai-sdk/mistral` | (via MistralProviderService) | LLM provider for generateText calls | Already wired; `MistralProviderService.getChatModel()` returns `LanguageModel` |
| `msw` | 2.12.10 | HTTP mocking for integration tests | Already installed with SSE handler infrastructure |
| `vitest` | 4.0.18 | Test runner for AI pipeline tests | Already configured; `.test.ts` pattern separate from Jest `.spec.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/common` | (existing) | `@Injectable()`, DI, controllers | All new services and controllers |
| `@prisma/client` | (existing) | Database queries for pre-fetching context data | BriefingService, FollowUpDetectionService fetch email/contact/calendar data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Output.object()` | `generateObject()` (deprecated) | `generateObject` still exists in SDK but is deprecated; `Output.object()` is the v6 canonical approach |
| Co-located Zod schemas | Separate schema package | Co-location is simpler and follows the per-service pattern in CONTEXT.md |
| Per-service data fetching | Shared DataContextBuilder | CONTEXT.md explicitly locked per-service fetching; avoids over-fetching |

**Installation:**
No new packages needed -- all dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/modules/
├── ai/
│   ├── services/
│   │   ├── briefing.service.ts              # NEW: Daily briefing generation
│   │   ├── follow-up-detection.service.ts   # NEW: Follow-up batch detection
│   │   ├── draft-generation.service.ts      # NEW: Reply draft generation
│   │   ├── email-insights.service.ts        # EXISTING: Email analysis (unchanged)
│   │   └── ...existing services...
│   ├── schemas/                              # NEW: Co-located with services OR
│   │   └── (schemas inline in service files) #  inline exports in each service file
│   ├── controllers/
│   │   └── ai.controller.ts                 # EXISTING: Add new non-chat endpoints
│   └── ai.module.ts                         # EXISTING: Register new services
├── contacts/
│   ├── services/
│   │   ├── relationship-score.service.ts    # NEW: CRM relationship scoring
│   │   └── ...existing services...
│   ├── controllers/
│   │   └── contacts.controller.ts           # EXISTING: Add CRM endpoints
│   └── contacts.module.ts                   # EXISTING: Register new service
├── calendar/
│   ├── services/
│   │   ├── calendar-conflict.service.ts     # NEW: Conflict detection
│   │   ├── focus-time.service.ts            # NEW: Focus block suggestions
│   │   └── meeting-prep.service.ts          # NEW: Pre-meeting briefing
│   ├── controllers/
│   │   └── calendar.controller.ts           # EXISTING: Add AI endpoints
│   └── calendar.module.ts                   # EXISTING: Register new services
└── ai-chat/
    └── __tests__/
        ├── chat-pipeline-msw.test.ts        # NEW: MSW-mocked chat pipeline tests
        └── ...existing tests...

backend/src/test/
├── fixtures/
│   └── ai/
│       ├── briefing-inputs/                 # NEW: Anonymized fixture data
│       ├── follow-up-inputs/                # NEW: Anonymized fixture data
│       └── draft-inputs/                    # NEW: Anonymized fixture data
├── msw-handlers/
│   ├── mistral-chat.handler.ts             # EXISTING: Streaming handler
│   ├── mistral-embed.handler.ts            # EXISTING: Embedding handler
│   └── mistral-generate.handler.ts         # NEW: Non-streaming structured output handler
└── setup.ts                                 # EXISTING: MSW server setup
```

### Pattern 1: generateText + Output.object() with Zod Schema

**What:** The canonical AI SDK v6 pattern for structured LLM output.
**When to use:** All non-chat AI operations (briefing, follow-up detection, draft generation).

```typescript
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-core/output
import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { MistralProviderService } from '../../mistral/mistral-provider.service';

// Co-located Zod schema -- exported for frontend type derivation
export const briefingSchema = z.object({
  priorityEmails: z.array(z.object({
    emailId: z.string(),
    subject: z.string(),
    sender: z.string(),
    urgency: z.enum(['critical', 'high', 'medium', 'low']),
    reason: z.string(),
  })).describe('Top 5 priority emails requiring attention'),
  calendarSnapshot: z.array(z.object({
    eventId: z.string(),
    title: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    hasConflict: z.boolean(),
  })).describe('Today calendar events with conflict flags'),
  // ...more fields...
  executiveSummary: z.string().describe('Natural language executive summary'),
});

export type BriefingOutput = z.infer<typeof briefingSchema>;

// Service implementation
@Injectable()
export class BriefingService {
  constructor(
    private readonly mistralProvider: MistralProviderService,
    private readonly prisma: PrismaService,
  ) {}

  async generateBriefing(tenantId: string): Promise<BriefingOutput> {
    // 1. Pre-fetch all data BEFORE LLM call
    const [emails, events, followUps, contacts] = await Promise.all([
      this.fetchPriorityEmails(tenantId),
      this.fetchTodayEvents(tenantId),
      this.fetchPendingFollowUps(tenantId),
      this.fetchStaleContacts(tenantId),
    ]);

    // 2. Build prompt with pre-fetched data
    const dataContext = this.buildDataContext(emails, events, followUps, contacts);

    // 3. Single generateText call with Output.object()
    try {
      const { output } = await generateText({
        model: this.mistralProvider.getChatModel(),
        output: Output.object({ schema: briefingSchema }),
        system: 'You are a professional executive assistant...',
        prompt: dataContext,
      });

      return output; // Type-safe BriefingOutput
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        this.logger.error(`Briefing schema validation failed: ${error.text}`);
        // Retry once with tighter prompt
        return this.retryWithTighterPrompt(dataContext);
      }
      throw error;
    }
  }
}
```

### Pattern 2: Graceful Fallback with Schema Validation

**What:** Zod strict parse -> retry -> safe fallback pattern.
**When to use:** All non-chat AI services (per CONTEXT.md locked decision).

```typescript
// Error handling pattern for Output.object() failures
async generateWithFallback<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<{ data: T; error?: string }> {
  try {
    const { output } = await generateText({
      model: this.mistralProvider.getChatModel(),
      output: Output.object({ schema }),
      system: systemPrompt,
      prompt: userPrompt,
    });
    return { data: output };
  } catch (firstError) {
    if (NoObjectGeneratedError.isInstance(firstError)) {
      this.logger.warn(`Schema validation failed, retrying: ${firstError.cause}`);
      // Retry with tighter prompt
      try {
        const { output } = await generateText({
          model: this.mistralProvider.getChatModel(),
          output: Output.object({ schema }),
          system: systemPrompt + '\nIMPORTANT: Return ONLY valid JSON matching the exact schema.',
          prompt: userPrompt,
        });
        return { data: output };
      } catch (retryError) {
        this.logger.error(`Schema validation retry failed: ${retryError}`);
        return { data: fallback, error: 'Schema validation failed after retry' };
      }
    }
    throw firstError;
  }
}
```

### Pattern 3: MSW Non-Streaming Handler for generateText

**What:** MSW handler that returns deterministic Mistral API JSON responses for `generateText`.
**When to use:** Integration tests for non-chat AI services.

```typescript
// backend/src/test/msw-handlers/mistral-generate.handler.ts
import { http, HttpResponse } from 'msw';

/**
 * MSW handler for non-streaming Mistral chat completions.
 * Used by generateText + Output.object() calls.
 *
 * The handler inspects the system prompt to determine which fixture to return,
 * then returns a chat completion with the JSON content as the assistant message.
 */
export function createGenerateHandler(fixtureMap: Record<string, unknown>) {
  return http.post(
    'https://api.mistral.ai/v1/chat/completions',
    async ({ request }) => {
      const body = (await request.json()) as {
        stream?: boolean;
        messages?: Array<{ role: string; content: string }>;
      };

      // Only handle non-streaming requests (generateText)
      if (body.stream) return; // Let streaming handler take over

      // Match system prompt to fixture
      const systemMsg = body.messages?.find(m => m.role === 'system')?.content || '';
      let responseContent = JSON.stringify({ error: 'no matching fixture' });

      for (const [key, fixture] of Object.entries(fixtureMap)) {
        if (systemMsg.includes(key)) {
          responseContent = JSON.stringify(fixture);
          break;
        }
      }

      return HttpResponse.json({
        id: 'chatcmpl-msw-generate',
        object: 'chat.completion',
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: responseContent },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });
    },
  );
}
```

### Pattern 4: Domain Service in NestJS Module

**What:** New `@Injectable()` service registered in an existing module with proper DI wiring.
**When to use:** RelationshipScoreService in contacts, calendar AI services.

```typescript
// backend/src/modules/contacts/services/relationship-score.service.ts
@Injectable()
export class RelationshipScoreService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Calculate relationship score using weighted components:
   * - Recency (40%): Days since last interaction (exponential decay)
   * - Frequency (30%): Interaction count in rolling 90-day window
   * - Reciprocity (20%): Ratio of sent/received (closer to 1:1 = higher)
   * - Trend (10%): Is interaction frequency increasing or decreasing?
   */
  async calculateScore(tenantId: string, contactId: string): Promise<RelationshipScore> {
    // Pure data-driven, no LLM needed
  }
}

// Register in contacts.module.ts:
// providers: [...existing, RelationshipScoreService],
// exports: [...existing, RelationshipScoreService],
```

### Anti-Patterns to Avoid
- **Agent loops for non-chat AI:** No tool calls during briefing/follow-up/draft generation. These are single-shot `generateText` calls with pre-fetched data.
- **JSONB metadata queries on Embedding table:** Use indexed fields (`emailId`, `contactId`), never `metadata.path` queries.
- **Shared DataContextBuilder:** Per CONTEXT.md, each service fetches its own data. No shared context assembly.
- **Direct `@mistralai/mistralai` SDK:** Route everything through `MistralProviderService.getChatModel()`.
- **`generateObject()` usage:** Deprecated in AI SDK v6. Use `generateText` with `output: Output.object()` instead.
- **`.optional()` in Zod schemas for Output.object():** Use `.nullable()` instead. `.optional()` can produce JSON Schema patterns incompatible with some providers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parsing + regex extraction | `Output.object({ schema })` | Type-safe, validated, handles edge cases |
| Schema validation | Manual try/catch JSON.parse + field checks | Zod 4 `z.object()` + `z.infer<>` | Single source of truth for backend + frontend types |
| HTTP mocking | Custom fetch interceptors | MSW v2 `http.post()` handlers | Already configured, ecosystem standard |
| Streaming mock | Manual SSE construction | Existing `mistral-chat.handler.ts` pattern | Already working for Phase 24/25 tests |
| Relationship scoring | LLM-based scoring | Algorithmic scoring (recency/frequency/reciprocity/trend) | Deterministic, fast, no LLM cost, Prisma queries |

**Key insight:** The `Output.object()` API eliminates the need for manual JSON parsing that `EmailInsightsService.parseJsonResponse()` currently does. Zod schemas provide runtime validation + TypeScript types from a single definition.

## Common Pitfalls

### Pitfall 1: Zod 4 + AI SDK Compatibility
**What goes wrong:** AI SDK v6.0.77 may have incomplete Zod 4 support. The GitHub issue (#7291) was marked completed but later reports suggest edge cases.
**Why it happens:** AI SDK internally converts Zod schemas to JSON Schema. Zod 4 changed some internals.
**How to avoid:** The codebase already uses Zod 4 with `tool()` in 5 services (email-tools, calendar-tools, etc.) without issues. `Output.object()` uses the same `zodSchema()` conversion internally. If issues arise, use explicit `zodSchema()` wrapper from `'ai'` package.
**Warning signs:** `NoObjectGeneratedError` with cause mentioning schema conversion; empty `inputSchema` in tool definitions.

### Pitfall 2: `.optional()` vs `.nullable()` in Zod Schemas for Output.object()
**What goes wrong:** `.optional()` and `.nullish()` generate JSON Schema `anyOf` patterns that some providers reject.
**Why it happens:** Provider-specific structured output implementations vary in JSON Schema support.
**How to avoid:** Use `.nullable()` for optional fields in Output.object() schemas. All fields should be present in output, some with `null` values.
**Warning signs:** `NoObjectGeneratedError` with `content_filter` finish reason.

### Pitfall 3: Frontend Route Migration Breakage
**What goes wrong:** Changing from `/api/v1/voltagent/*` to `/api/v1/ai/*` breaks the frontend if done piecemeal.
**Why it happens:** 50+ endpoint references in `frontend/lib/api/ai.ts` point to `/api/v1/voltagent/*`.
**How to avoid:** Batch all route changes in a single commit. Consider temporary dual-registration (old route redirects to new) if incremental migration is needed. Update `voltAgentApi` object methods and `crmApi` methods simultaneously.
**Warning signs:** 404s in browser network tab after backend route changes.

### Pitfall 4: NestJS Circular Module Dependencies
**What goes wrong:** New calendar AI services need AiModule (for MistralProvider), but AiModule may need calendar data.
**Why it happens:** Domain services in calendar/contacts need LLM access, creating potential circular imports.
**How to avoid:** The domain services (RelationshipScoreService, CalendarConflictService, etc.) do NOT need LLM access -- they are pure data/algorithmic services. Only the BriefingService/FollowUpDetectionService/DraftGenerationService in the `ai` module need LLM access. Keep LLM-dependent services in `ai` module, data-driven services in their domain modules.
**Warning signs:** NestJS startup error: "Nest cannot create... instance. Potential causes: circular dependency."

### Pitfall 5: MSW Handler Ordering for Streaming vs Non-Streaming
**What goes wrong:** MSW handlers for the same URL (`/v1/chat/completions`) conflict between streaming (streamText) and non-streaming (generateText) requests.
**Why it happens:** Both use `http.post('https://api.mistral.ai/v1/chat/completions')`. MSW matches first registered handler.
**How to avoid:** Use a single handler that checks `body.stream` to branch behavior. The existing `mistral-chat.handler.ts` already does this (returns JSON for non-streaming, SSE for streaming). Extend it rather than adding a competing handler.
**Warning signs:** Tests getting streaming responses when expecting JSON, or vice versa.

### Pitfall 6: 50-Case Comparison Script Assumes Identical Output Shape
**What goes wrong:** New services output different field names/structures than old VoltAgent output, making comparison meaningless.
**Why it happens:** Old VoltAgent agent loops returned ad-hoc JSON; new services return Zod-validated structured output with different field names.
**How to avoid:** Define explicit mapping between old output fields and new Zod schema fields in the comparison script. Compare semantic equivalence (e.g., old `urgency: "high"` maps to new `urgency: "high"`), not structural identity. Store expected baselines as fixture JSON files with the NEW schema shape.
**Warning signs:** 0% match rate despite correct outputs.

## Code Examples

### Example 1: BriefingService Core Pattern

```typescript
// backend/src/modules/ai/services/briefing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';

export const briefingSchema = z.object({
  priorityEmails: z.array(z.object({
    emailId: z.string(),
    subject: z.string(),
    sender: z.string(),
    urgency: z.enum(['critical', 'high', 'medium', 'low']),
    reason: z.string(),
  })).describe('Top 5 priority emails requiring attention'),
  calendarSnapshot: z.array(z.object({
    eventId: z.string(),
    title: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    hasConflict: z.boolean(),
  })).describe('Today calendar snapshot'),
  pendingFollowUps: z.array(z.object({
    emailId: z.string(),
    contactName: z.string(),
    reason: z.string(),
    suggestedDueDate: z.string(),
    urgency: z.enum(['high', 'medium', 'low']),
  })).describe('Pending follow-ups requiring action'),
  executiveSummary: z.string().describe('2-3 sentence natural language summary'),
  staleContactsAlert: z.array(z.object({
    contactId: z.string(),
    name: z.string(),
    daysSinceContact: z.number(),
    suggestedAction: z.string(),
  })).describe('Contacts losing touch'),
  draftSuggestions: z.array(z.object({
    emailId: z.string(),
    subject: z.string(),
    reason: z.string(),
  })).describe('Emails that may need a reply'),
  emailVolumeTrends: z.object({
    todayReceived: z.number(),
    todaySent: z.number(),
    weeklyAvgReceived: z.number(),
    weeklyAvgSent: z.number(),
    trend: z.enum(['increasing', 'stable', 'decreasing']),
  }).describe('Email volume trends'),
  focusTimeRecommendations: z.array(z.object({
    startTime: z.string(),
    endTime: z.string(),
    reason: z.string(),
  })).describe('Recommended focus time blocks'),
});

export type BriefingOutput = z.infer<typeof briefingSchema>;
```

### Example 2: Follow-Up Detection Batch Pattern

```typescript
// backend/src/modules/ai/services/follow-up-detection.service.ts
export const followUpDetectionSchema = z.object({
  detectedFollowUps: z.array(z.object({
    emailId: z.string(),
    reason: z.string().describe('Why this email needs follow-up'),
    suggestedDueDate: z.string().describe('ISO date string'),
    urgency: z.enum(['high', 'medium', 'low']),
    confidence: z.number().min(0).max(1),
  })),
  batchSummary: z.object({
    totalAnalyzed: z.number(),
    totalDetected: z.number(),
    highUrgencyCount: z.number(),
  }),
});

export type FollowUpDetectionOutput = z.infer<typeof followUpDetectionSchema>;

// Usage: One LLM call per batch of recent emails (24h window)
async detectFollowUps(tenantId: string): Promise<FollowUpDetectionOutput> {
  const recentEmails = await this.fetchRecentEmails(tenantId, 24); // hours
  const emailSummaries = recentEmails.map(e => ({
    id: e.id,
    subject: e.subject,
    from: e.from,
    to: e.to,
    snippet: e.bodyText?.slice(0, 500),
    receivedAt: e.receivedAt.toISOString(),
  }));

  const { output } = await generateText({
    model: this.mistralProvider.getChatModel(),
    output: Output.object({ schema: followUpDetectionSchema }),
    system: 'Analyze these emails and detect which ones need follow-up...',
    prompt: JSON.stringify(emailSummaries),
  });

  return output;
}
```

### Example 3: MSW Integration Test for Non-Chat AI

```typescript
// backend/src/modules/ai/services/__tests__/briefing-msw.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { BriefingService, briefingSchema } from '../briefing.service';

const MOCK_BRIEFING_OUTPUT = {
  priorityEmails: [{ emailId: 'e1', subject: 'Urgent', sender: 'boss@co.com', urgency: 'high', reason: 'Deadline' }],
  calendarSnapshot: [],
  pendingFollowUps: [],
  executiveSummary: 'Today is quiet.',
  staleContactsAlert: [],
  draftSuggestions: [],
  emailVolumeTrends: { todayReceived: 5, todaySent: 2, weeklyAvgReceived: 10, weeklyAvgSent: 5, trend: 'stable' },
  focusTimeRecommendations: [],
};

const server = setupServer(
  http.post('https://api.mistral.ai/v1/chat/completions', () => {
    return HttpResponse.json({
      id: 'test',
      object: 'chat.completion',
      model: 'mistral-small-latest',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: JSON.stringify(MOCK_BRIEFING_OUTPUT) },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('generates briefing with valid schema output', async () => {
  const service = new BriefingService(/* ... */);
  const result = await service.generateBriefing('tenant-1');

  // Validate against schema
  const parsed = briefingSchema.parse(result);
  expect(parsed.priorityEmails).toHaveLength(1);
  expect(parsed.executiveSummary).toBe('Today is quiet.');
});
```

### Example 4: Relationship Score Algorithm (No LLM)

```typescript
// backend/src/modules/contacts/services/relationship-score.service.ts
/**
 * Weighted scoring: recency 40%, frequency 30%, reciprocity 20%, trend 10%
 * Already used by frontend crmApi -- matches ContactRelationshipStats interface.
 */
calculateScore(interactions: InteractionData[]): RelationshipScore {
  const now = new Date();
  const window90d = interactions.filter(i =>
    (now.getTime() - new Date(i.occurredAt).getTime()) < 90 * 24 * 60 * 60 * 1000
  );

  // Recency: exponential decay from last interaction
  const lastInteraction = interactions[0]?.occurredAt;
  const daysSinceLast = lastInteraction
    ? (now.getTime() - new Date(lastInteraction).getTime()) / (24 * 60 * 60 * 1000)
    : 365;
  const recencyScore = Math.max(0, 100 * Math.exp(-daysSinceLast / 30));

  // Frequency: count in 90-day window, normalized to 0-100
  const frequencyScore = Math.min(100, window90d.length * 5);

  // Reciprocity: ratio of sent/received (1:1 = 100, all one-way = 50)
  const sent = window90d.filter(i => i.direction === 'OUTBOUND').length;
  const received = window90d.filter(i => i.direction === 'INBOUND').length;
  const total = sent + received;
  const reciprocityScore = total > 0
    ? 100 * (1 - Math.abs(sent - received) / total)
    : 0;

  // Trend: compare last 30d vs prior 30d
  const last30d = window90d.filter(i =>
    (now.getTime() - new Date(i.occurredAt).getTime()) < 30 * 24 * 60 * 60 * 1000
  ).length;
  const prior30d = window90d.filter(i => {
    const age = now.getTime() - new Date(i.occurredAt).getTime();
    return age >= 30 * 24 * 60 * 60 * 1000 && age < 60 * 24 * 60 * 60 * 1000;
  }).length;
  const trendScore = prior30d > 0
    ? Math.min(100, Math.max(0, 50 + (last30d - prior30d) / prior30d * 50))
    : (last30d > 0 ? 75 : 25);

  const totalScore = Math.round(
    recencyScore * 0.4 + frequencyScore * 0.3 + reciprocityScore * 0.2 + trendScore * 0.1
  );

  return { recencyScore, frequencyScore, reciprocityScore, trendScore, totalScore };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject()` | `generateText` + `Output.object()` | AI SDK v6 (2025) | Unified API; generateObject deprecated |
| VoltAgent agent loops | Single `generateText` call | This phase | No tool calls during generation; faster, cheaper |
| Manual JSON.parse + validation | Zod schema + `Output.object()` | This phase | Type-safe, single source of truth |
| Custom JSON fencing removal | `extractJsonMiddleware` (AI SDK) | AI SDK v6 | Built-in middleware for markdown-wrapped JSON |

**Deprecated/outdated:**
- `generateObject()`: Still works in AI SDK 6.0.77 but deprecated. Use `Output.object()` with `generateText`.
- VoltAgent agent loops: Deleted in Phase 23. Non-chat AI must not use agent patterns.
- `MistralService.completePrompt()`: Legacy wrapper. New services should use `MistralProviderService.getChatModel()` directly with `generateText`.

## Open Questions

1. **Zod 4 edge cases with Output.object()**
   - What we know: Zod 4 works with `tool()` in 5 existing services. GitHub issue #7291 was marked resolved.
   - What's unclear: Whether complex nested schemas (arrays of objects with nullable fields) hit any Zod 4 conversion edge cases in `Output.object()`.
   - Recommendation: Start with a simple schema, validate it works end-to-end, then expand. If issues arise, use explicit `zodSchema()` wrapper.

2. **50+ case comparison baseline source**
   - What we know: Old VoltAgent code is deleted. CONTEXT.md says "production-anonymized fixture data."
   - What's unclear: Where the baseline expected outputs come from if old services no longer exist.
   - Recommendation: Generate baselines by running new services against fixture inputs and manually validating a sample. The comparison script then ensures subsequent runs match these validated baselines (regression testing, not legacy comparison).

3. **Calendar module importing MistralModule**
   - What we know: Calendar AI services (conflict, focus, meeting-prep) are data-driven per the architecture.
   - What's unclear: MeetingPrepService might need LLM for "pre-meeting briefing with attendee info + recent emails."
   - Recommendation: If MeetingPrepService needs LLM, keep it in the `ai` module (like BriefingService) and have it inject CalendarService. Only pure data services go in calendar module.

## Sources

### Primary (HIGH confidence)
- AI SDK v6 official docs: `Output.object()` API reference (https://ai-sdk.dev/docs/reference/ai-sdk-core/output)
- AI SDK v6 structured data guide (https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- AI SDK v6 `zodSchema()` reference (https://ai-sdk.dev/docs/reference/ai-sdk-core/zod-schema)
- Codebase: `backend/node_modules/ai/dist/index.d.ts` -- verified `Output` export, `NoObjectGeneratedError`, `NoOutputGeneratedError` types
- Codebase: 5 tool services using `z` from `'zod'` (Zod 4) with `tool()` successfully

### Secondary (MEDIUM confidence)
- Zod 4 migration guide (https://zod.dev/v4/changelog) -- `.optional()` behavior changes
- GitHub issue #7291 (https://github.com/vercel/ai/issues/7291) -- Zod 4 support marked closed/completed
- MSW v2 docs: HTTP handlers (https://mswjs.io/docs/api/http)
- CRM scoring best practices: weighted recency/frequency model (https://www.nimble.com/blog/crm-best-practices-for-lead-scoring-qualification/)

### Tertiary (LOW confidence)
- Calendar AI assistant patterns: Reclaim.ai, Clockwise feature comparison -- design patterns for conflict detection and focus time (https://reclaim.ai/, https://www.getclockwise.com/)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and proven in codebase
- Architecture: HIGH -- patterns directly extend existing Phase 24/25 infrastructure
- Pitfalls: HIGH -- identified from codebase inspection and official docs
- CRM/Calendar schemas: MEDIUM -- based on industry patterns, user discretion area

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable stack, no fast-moving dependencies)
