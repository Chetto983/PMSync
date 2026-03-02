# Phase 24: Backend Core Pipeline - Research

**Researched:** 2026-03-02
**Domain:** AI SDK v6 streaming chat pipeline with NestJS, HITL, GDPR compliance
**Confidence:** HIGH

## Summary

Phase 24 replaces the deleted VoltAgent chat pipeline with a new `AiChatModule` built on AI SDK v6 `streamText`. The codebase is on `ai@6.0.77` with `@ai-sdk/mistral@3.0.19` and NestJS 11.1. The existing infrastructure provides strong foundations: `MistralProviderService` for model access, `PiiDetectionService` + `PiiResolutionService` for tokenization, `AuditService` for logging, `RedisRateLimiterService` for rate limiting, `CircuitBreaker` utilities, `ActionQueue` Prisma model for HITL persistence, `ConsentGuard` for GDPR consent enforcement, and `@nestjs/throttler` for HTTP-level rate limiting.

The critical gap is: there are **no Prisma models for conversations or chat messages**. The old VoltAgent code is fully deleted (Phase 23). The current `POST /ai/chat` endpoint is a synchronous `generateText` call returning JSON -- no streaming, no tool calling, no conversation persistence. This phase must create new Prisma models, wire AI SDK v6 streaming with `pipeUIMessageStreamToResponse`, implement multi-step tool execution with `stopWhen(stepCountIs(5))`, and integrate `needsApproval` for destructive tool calls -- all as an atomic replacement of the existing endpoint.

**Primary recommendation:** Build a new `AiChatModule` with 3 services (AiChatController, AiChatService, ConversationService) that replaces the existing `POST /ai/chat` endpoint. Use AI SDK v6's `pipeUIMessageStreamToResponse` for streaming and `needsApproval` for HITL. Create new Prisma models `AiConversation` and `AiMessage` for persistence. Wire existing PII, audit, rate-limiting, and consent services.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- AI SDK v6 native data stream protocol -- frontend (assistant-ui in Phase 27) consumes natively
- Typed chunks: text-delta, tool-call, tool-result, error, usage
- Error handling: emit typed error chunk in stream, then close gracefully. No HTTP error abort -- frontend renders partial content + error
- Optional `conversationId` param: if provided, load and continue; if omitted, create new conversation
- Conversation history: pre-compute rolling summaries of older messages (stored async), keep recent messages verbatim -- similar to Claude/ChatGPT approach
- System prompt: server-side only, injected by AiChatService, never sent to/from frontend
- Cancellation: AbortController support -- partial response saved as-is to conversation
- Multi-step agent loop: AI SDK v6 `maxSteps` with cap at 5 steps per request
- Tool events: stream emits tool-call and tool-result chunks for real-time visibility
- Usage metadata: final chunk includes token counts (prompt/completion), model, latency
- HITL: inline in stream, stream pauses, emits typed 'needs-approval' chunk with action details
- Three HITL actions: approve as-is, reject, or modify then approve (user can edit action parameters inline)
- Modified actions: show diff of changes and require re-confirmation before execution
- Timeout: 1 hour auto-deny for pending actions
- Configurable per tool: each tool tagged as needs-approval or auto-execute, user can customize in settings
- Batch approval: related destructive actions grouped into one approval card
- Per-item control in batch: user can approve/reject individual items within a batch
- Per-tool trust setting: user can mark specific tools as auto-approved
- Persistence: pending HITL actions persisted in DB (survives page refresh, required for 1-hour timeout)
- History: both inline indicator in chat + detailed entry in activity/audit log
- Rejection: AI acknowledges rejection within the stream, conversation continues
- Delete all old VoltAgent chat pipeline code in Phase 24 -- atomic swap
- Same URL path (`POST /api/v1/ai/chat`) -- new implementation, frontend doesn't need URL changes
- New dedicated NestJS module: AiChatModule (AiChatController, AiChatService, ConversationService)
- Tools defined inside AiChatModule (not imported from old AI module)
- No rollback mechanism -- E2E validation gate must pass before merge
- No feature flag -- if tests pass, ship it
- PII tokenization before LLM call -- LLM never sees raw PII
- PII detokenized before tool execution -- tools need real data to work
- Consent gate: first-time users must accept AI terms before chat activates (stored in user profile)
- Rate limiting: per-user only (X requests/minute), not per-org

### Claude's Discretion
- Data model approach: reuse existing conversation tables vs new schema -- evaluate for cleanest result
- PII boundary details: decide the full tokenize/detokenize round-trip based on what's practical vs GDPR-required
- Audit logging level: evaluate GDPR requirements and existing patterns to decide full interaction log vs summary
- Circuit breaker configuration: thresholds, recovery behavior
- Rate limiter implementation: Redis-based, in-memory, or NestJS throttler -- pick what fits
- Summary generation strategy: when to trigger, how much history to summarize, storage format

### Deferred Ideas (OUT OF SCOPE)
- None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-01 | Clean AI module with `AiChatService` using AI SDK v6 `streamText` + `pipeUIMessageStreamToResponse` -- single service handles chat orchestration, context building, and streaming | AI SDK v6 exports `streamText`, `pipeUIMessageStreamToResponse`, `tool`, `stepCountIs` -- all confirmed available in `ai@6.0.77`. NestJS cookbook shows Express `Response` integration. |
| AI-04 | `ConversationService` with direct Prisma queries for chat history -- preserves existing conversation data | No existing conversation Prisma model found. New `AiConversation` + `AiMessage` models needed. No old data to preserve (VoltAgent deleted). |
| AI-05 | HITL approval for destructive actions via AI SDK v6 `needsApproval` + `onStepFinish` callback | `needsApproval` confirmed in `tool()` API. Existing `ActionQueue` model supports PENDING_APPROVAL status, expiry, approval fields. `AgentActionFeedback` model tracks outcomes. |
| AI-06 | PII tokenization, audit logging, and consent guards wired into new chat pipeline | `PiiDetectionService` + `PiiResolutionService` exist and are production-ready. `AuditService.logToolExecution()` exists. `ConsentGuard` + `@RequiresConsent` decorator exist. |
| AI-08 | Rate limiting and circuit breaker preserved in new module | `RedisRateLimiterService` exists with atomic Lua scripts. `CircuitBreaker` class with registry exists. `@nestjs/throttler` configured globally at 100/min read, 30/min write. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.0.77 | AI SDK core -- `streamText`, `tool`, `stepCountIs`, `pipeUIMessageStreamToResponse` | Already installed. Official Vercel SDK for LLM streaming. |
| `@ai-sdk/mistral` | 3.0.19 | Mistral provider for AI SDK | Already installed. `MistralProviderService` wraps it. |
| `@nestjs/common` | 11.1.13 | NestJS framework | Already installed. Module/controller/service structure. |
| `@prisma/client` | 7.3.0 | Database ORM | Already installed. All data models use Prisma. |
| `zod` | 4.3.6 | Tool input schema validation | Already installed. AI SDK v6 `tool()` uses zod for `inputSchema`. |
| `ioredis` | 5.9.2 | Redis for PII resolution, rate limiting | Already installed. Used by cache, rate limiter, locks. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/throttler` | 6.5.0 | HTTP-level rate limiting | Already configured globally. Chat endpoint gets default protection. |
| `@sentinelseed/voltagent` | (installed) | PII detection, prompt guard | Used by existing `PiiDetectionService` and `PromptGuardService`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pipeUIMessageStreamToResponse` | `pipeDataStreamToResponse` | `pipeDataStreamToResponse` removed in AI SDK v5. `pipeUIMessageStreamToResponse` is the v6 standard. |
| `stepCountIs(5)` | `maxSteps: 5` | `maxSteps` removed in AI SDK v5. `stopWhen` with `stepCountIs()` is the v6 replacement. Note: user said "maxSteps" in context but the actual v6 API uses `stopWhen: stepCountIs(5)`. |
| New Prisma models | Reuse existing tables | No conversation table exists. Old VoltAgent is deleted. Clean new models are the only option. |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Module Structure
```
backend/src/modules/ai-chat/
├── ai-chat.module.ts           # NestJS module registration
├── controllers/
│   └── ai-chat.controller.ts   # POST /ai/chat (streaming endpoint)
├── services/
│   ├── ai-chat.service.ts      # Chat orchestration (streamText + tools + PII)
│   └── conversation.service.ts # Conversation CRUD + history building
├── dto/
│   ├── chat-request.dto.ts     # Input validation
│   └── chat-response.dto.ts    # Response types
├── tools/
│   ├── index.ts                # Tool registry
│   └── ... (individual tool files in Phase 25)
└── constants/
    └── system-prompt.ts        # Server-side system prompt
```

### Pattern 1: Streaming Controller with pipeUIMessageStreamToResponse
**What:** NestJS controller that streams AI SDK output directly to Express response
**When to use:** All streaming chat endpoints

```typescript
// Source: https://ai-sdk.dev/cookbook/api-servers/nest
import { Controller, Post, Body, Res, UseGuards, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { streamText, pipeUIMessageStreamToResponse, createUIMessageStream } from 'ai';

@Controller('ai')
export class AiChatController {
  @Post('chat')
  async chat(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: ChatRequestDto,
  ) {
    // AiChatService returns a ReadableStream
    const stream = await this.aiChatService.streamChat(req.user, dto, req.signal);
    pipeUIMessageStreamToResponse({ stream, response: res });
  }
}
```

### Pattern 2: AiChatService Orchestration with createUIMessageStream
**What:** Service that wraps streamText with PII tokenization, audit logging, and error handling
**When to use:** Core chat pipeline

```typescript
// Source: https://ai-sdk.dev/cookbook/api-servers/nest (custom data pattern)
import { createUIMessageStream, streamText, stepCountIs, tool } from 'ai';

async streamChat(user, dto, abortSignal): Promise<ReadableStream> {
  return createUIMessageStream({
    execute: async ({ writer }) => {
      // 1. Load conversation history
      const messages = await this.conversationService.getMessages(dto.conversationId);

      // 2. PII tokenize user message
      const piiResult = this.piiDetectionService.detect(dto.message);
      if (piiResult.hasPii) {
        await this.piiResolutionService.storeMapping(tenantId, sessionId, piiResult.details);
      }

      // 3. Stream with tools
      const result = streamText({
        model: this.mistralProvider.getChatModel(modelId),
        system: SYSTEM_PROMPT,
        messages: [...history, { role: 'user', content: piiResult.redactedText }],
        tools: this.getToolSet(),
        stopWhen: stepCountIs(5),
        abortSignal,
        onStepFinish: async (step) => {
          // Persist step, audit log tool calls
        },
        onFinish: async (result) => {
          // Save conversation, track usage
        },
      });

      // 4. Merge streamText output into UI message stream
      writer.merge(result.toUIMessageStream({
        onError: (error) => error instanceof Error ? error.message : String(error),
      }));
    },
  });
}
```

### Pattern 3: HITL via needsApproval + ActionQueue
**What:** Destructive tools use `needsApproval: true`, creating ActionQueue entries
**When to use:** Send email, delete email, move email, etc.

```typescript
// Source: https://ai-sdk.dev/cookbook/next/human-in-the-loop
const sendEmailTool = tool({
  description: 'Send an email',
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  needsApproval: true, // Always requires approval
  execute: async ({ to, subject, body }) => {
    // PII resolve before execution
    const resolvedTo = await piiResolutionService.resolveText(tenantId, sessionId, to);
    // Execute the action
    return await emailService.send({ to: resolvedTo, subject, body });
  },
});
```

### Pattern 4: Conversation Persistence
**What:** New Prisma models for AI conversations and messages
**When to use:** All chat interactions

```prisma
model AiConversation {
  id        String      @id @default(cuid())
  tenantId  String
  userId    String
  title     String?
  summary   String?     // Rolling summary of older messages
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  messages  AiMessage[]
  tenant    Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId, updatedAt(sort: Desc)])
  @@map("ai_conversations")
}

model AiMessage {
  id              String         @id @default(cuid())
  conversationId  String
  role            String         // 'user' | 'assistant' | 'tool'
  content         Json           // Text content or tool call/result
  toolCallId      String?        // For tool result messages
  tokenCount      Int?           // Token usage tracking
  createdAt       DateTime       @default(now())
  conversation    AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("ai_messages")
}
```

### Pattern 5: PII Tokenize/Detokenize Round-Trip
**What:** PII detected and redacted before LLM, resolved before tool execution
**When to use:** Every chat message

```
User message: "Send email to john@example.com"
  → PiiDetectionService.detect() → "[EMAIL_REDACTED:abcd1234]"
  → PiiResolutionService.storeMapping() → Redis
  → LLM sees: "Send email to [EMAIL_REDACTED:abcd1234]"
  → LLM calls tool: sendEmail({ to: "[EMAIL_REDACTED:abcd1234]" })
  → PiiResolutionService.resolvePayload() → { to: "john@example.com" }
  → Tool executes with real data
```

### Anti-Patterns to Avoid
- **Using `maxSteps` instead of `stopWhen(stepCountIs(N))`:** `maxSteps` was removed in AI SDK v5. The codebase is on v6. Use `stopWhen: stepCountIs(5)`.
- **Using `pipeDataStreamToResponse`:** Removed in v5. Use `pipeUIMessageStreamToResponse`.
- **Using `parameters` in tool definitions:** Renamed to `inputSchema` in v5.
- **Importing tools from the old AI module:** User explicitly decided tools live inside AiChatModule.
- **Storing conversation history as JSON blob:** Use proper normalized Prisma models for queryability.
- **Calling `res.json()` in a streaming endpoint:** The response is piped by the SDK. Do NOT call `res.json()` or `res.send()`.

## Discretion Recommendations

### Data Model: New Schema (Recommended)
**Decision:** Create new `AiConversation` + `AiMessage` Prisma models.
**Rationale:** No existing conversation table exists. VoltAgent is deleted. Clean models give proper indexing, typed queries, and normalized storage. The `Session` model is for auth tokens, not chat.

### PII Boundary: Tokenize User Messages Only
**Decision:** Tokenize user messages before LLM. Detokenize tool call arguments before execution. Do NOT tokenize LLM output or tool results.
**Rationale:** The LLM output already uses redacted placeholders (it was given redacted input). Tool results are system-generated data, not user PII. Tokenizing everything adds complexity without GDPR benefit. The existing `PiiDetectionService` + `PiiResolutionService` already implement this exact flow.

### Audit Logging: Summary Per Interaction
**Decision:** One audit log entry per chat request (not per token/chunk). Tool executions get their own audit entries via existing `AuditService.logToolExecution()`.
**Rationale:** Existing pattern in `AuditService`. Full token-level logging would bloat the audit_logs table and slow streaming. GDPR requires "what was accessed" not "every byte".

### Circuit Breaker: Reuse Existing
**Decision:** Use existing `getAiCircuitBreaker('mistral', 'chat-stream')` from `ai/utils/index.ts`.
**Rationale:** Already configured with 3 failure threshold, 60s reset, 2 success recovery. Same LLM provider, same failure modes.

### Rate Limiter: Redis-Based Per-User
**Decision:** Use existing `RedisRateLimiterService.checkRateLimit()` with key `ai-chat:${userId}`.
**Rationale:** User explicitly said per-user rate limiting. Redis-based is already battle-tested in the codebase. NestJS throttler provides HTTP-level protection on top.

### Summary Generation: Async After Threshold
**Decision:** Trigger summary generation when a conversation exceeds 20 messages. Store summary in `AiConversation.summary`. Use `generateText` (not streaming) to generate a summary of messages 1-N, keeping the last 10 messages verbatim.
**Rationale:** Claude/ChatGPT approach. Keeps context window manageable. Async = no latency impact on chat.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming | Custom SSE writer | `pipeUIMessageStreamToResponse` from `ai` | Handles backpressure, encoding, headers, keep-alive automatically |
| Tool schema validation | Manual JSON validation | `tool()` with zod `inputSchema` | AI SDK validates tool inputs against schema automatically |
| PII detection | Regex-based detection | `PiiDetectionService` (uses `@sentinelseed/voltagent`) | 12 PII types, hash-based placeholders, battle-tested patterns |
| PII resolution | In-memory map | `PiiResolutionService` (Redis-backed) | Tenant-isolated, session-scoped, 30min TTL, survives restarts |
| Rate limiting | Token bucket | `RedisRateLimiterService` | Atomic Lua scripts, distributed, lockout support |
| Circuit breaker | Simple counter | `CircuitBreaker` from `common/utils` | Windowed failures, HALF_OPEN recovery, registry for named breakers |
| Audit logging | Custom DB writes | `AuditService.logAudit()` / `logToolExecution()` | Consistent format, truncation, fire-and-forget |
| Consent checking | Manual DB query | `@RequiresConsent('ai_email_processing')` + `ConsentGuard` | Decorator-based, already wired into NestJS guard pipeline |
| HITL persistence | Custom action table | `ActionQueue` Prisma model | Already has PENDING_APPROVAL, APPROVED, REJECTED, EXPIRED statuses + expiry field |

**Key insight:** Nearly every cross-cutting concern (PII, audit, rate limiting, consent, HITL persistence) already has production-ready infrastructure. The work is wiring these into the new streaming pipeline, not building them from scratch.

## Common Pitfalls

### Pitfall 1: maxSteps vs stopWhen API Mismatch
**What goes wrong:** Using `maxSteps` parameter in `streamText()` call causes runtime error or silent ignore.
**Why it happens:** User's context document says "maxSteps with cap at 5" but AI SDK v5+ replaced `maxSteps` with `stopWhen: stepCountIs(N)`.
**How to avoid:** Always use `stopWhen: stepCountIs(5)` in streamText options. The `stepCountIs` function is exported from `ai` package (verified).
**Warning signs:** TypeScript compiler warning about unknown property `maxSteps`.

### Pitfall 2: Calling res.json() After Piping Stream
**What goes wrong:** NestJS tries to send headers after stream has already started writing, crashes with "headers already sent".
**Why it happens:** Default NestJS controller behavior returns JSON. When using `@Res()` with streaming, you must NOT return a value from the handler.
**How to avoid:** Use `@Res() res: Response` and call `pipeUIMessageStreamToResponse({ stream, response: res })`. Return `void` from the handler.
**Warning signs:** "Cannot set headers after they are sent to the client" error.

### Pitfall 3: Not Passing AbortSignal for Cancellation
**What goes wrong:** User disconnects but LLM keeps generating tokens, wasting API credits.
**Why it happens:** AbortSignal not threaded from request to streamText.
**How to avoid:** Create `AbortController` from request lifecycle, pass `abortSignal` to both `streamText` and tool executions. NestJS doesn't natively expose request abort -- use `req.on('close', () => controller.abort())`.
**Warning signs:** LLM bills for tokens user never sees; partial conversations accumulate.

### Pitfall 4: PII Resolution Race Condition
**What goes wrong:** Tool execution tries to resolve PII before mapping is stored in Redis.
**Why it happens:** `storeMapping` is async, tool execution starts before it completes.
**How to avoid:** Await `piiResolutionService.storeMapping()` BEFORE starting `streamText`. PII detection/storage is on the user message, which happens before LLM inference.
**Warning signs:** Tool receives redacted placeholders instead of real values.

### Pitfall 5: NestJS Guards Not Running on @Res() Endpoints
**What goes wrong:** ConsentGuard and ThrottlerGuard might not execute when using `@Res()`.
**Why it happens:** When you use `@Res()`, NestJS switches to "express mode" and some interceptors/guards may behave differently.
**How to avoid:** Guards still run with `@Res()` (they execute before the handler). However, interceptors that modify the response will NOT work. Verify guards fire in tests.
**Warning signs:** Unauthenticated or unconsented requests reach the streaming handler.

### Pitfall 6: Conversation History Token Explosion
**What goes wrong:** Loading all messages for a long conversation exceeds LLM context window.
**Why it happens:** No truncation or summarization of old messages.
**How to avoid:** Implement the rolling summary strategy: keep last 10 messages verbatim, use stored summary for older messages. Check total token count before sending to LLM.
**Warning signs:** 400 errors from Mistral API ("context length exceeded"), or severely degraded response quality as context fills with noise.

### Pitfall 7: Missing HITL Timeout Cleanup
**What goes wrong:** Pending HITL actions never expire, accumulating forever.
**Why it happens:** 1-hour auto-deny requires a scheduled job or TTL mechanism.
**How to avoid:** Set `expiresAt` on `ActionQueue` entries. Use a NestJS `@Cron` job or Prisma query to expire old actions. The `ActionQueue` model already has `expiresAt` field.
**Warning signs:** Users see stale approval prompts for actions that are no longer relevant.

### Pitfall 8: Streaming Error After Partial Content
**What goes wrong:** Error occurs mid-stream, but HTTP status 200 was already sent.
**Why it happens:** SSE streams commit to 200 on first byte. You cannot change status code after.
**How to avoid:** User's decision is correct: emit a typed error chunk (`{ type: 'error', message: '...' }`) in the stream, then close. Frontend renders partial content + error banner.
**Warning signs:** Frontend shows spinner forever because stream died without an error event.

## Code Examples

### Complete NestJS Streaming Controller
```typescript
// Source: https://ai-sdk.dev/cookbook/api-servers/nest
import { Controller, Post, Body, Res, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { pipeUIMessageStreamToResponse } from 'ai';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { ConsentGuard } from '../../compliance/guards/consent.guard';
import { RequiresConsent } from '../../compliance/decorators/requires-consent.decorator';
import { AiChatService } from '../services/ai-chat.service';
import { ChatRequestDto } from '../dto/chat-request.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, TenantGuard, ConsentGuard)
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_chat')
  async chat(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: ChatRequestDto,
  ): Promise<void> {
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const stream = await this.aiChatService.streamChat({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      message: dto.message,
      conversationId: dto.conversationId,
      abortSignal: abortController.signal,
    });

    pipeUIMessageStreamToResponse({ stream, response: res });
  }
}
```

### Tool Definition with needsApproval
```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
import { tool } from 'ai';
import { z } from 'zod';

export const sendEmailTool = tool({
  description: 'Send an email to a recipient',
  inputSchema: z.object({
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body content'),
  }),
  needsApproval: true, // Always requires user approval
  execute: async ({ to, subject, body }, { abortSignal }) => {
    // execution handled after approval
    return { success: true, messageId: 'msg_123' };
  },
});
```

### streamText with stopWhen and onStepFinish
```typescript
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
import { streamText, stepCountIs } from 'ai';

const result = streamText({
  model: this.mistralProvider.getChatModel('mistral-small-latest'),
  system: systemPrompt,
  messages: conversationMessages,
  tools: toolSet,
  stopWhen: stepCountIs(5), // Cap at 5 steps
  abortSignal: signal,
  onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
    // Persist step to conversation
    // Audit log tool executions
  },
  onFinish: async ({ text, usage, finishReason, steps }) => {
    // Save final assistant message
    // Track token usage for billing
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `maxSteps: N` | `stopWhen: stepCountIs(N)` | AI SDK v5 (late 2025) | Must use `stopWhen` or TypeScript error |
| `pipeDataStreamToResponse` | `pipeUIMessageStreamToResponse` | AI SDK v5 (late 2025) | New method name, different stream format |
| `parameters` in tool | `inputSchema` in tool | AI SDK v5 (late 2025) | Schema key renamed |
| `toDataStreamResponse()` | `toUIMessageStreamResponse()` | AI SDK v5 (late 2025) | Method renamed |
| `args` in tool result | `input` in tool result | AI SDK v5 (late 2025) | Property renamed |
| `result` in step | `output` in step | AI SDK v5 (late 2025) | Property renamed |
| VoltAgent framework | Raw AI SDK v6 | Project v3.2 decision | No framework overhead |
| `@voltagent/core` | Deleted | Phase 23 | Clean slate for this phase |

**Deprecated/outdated:**
- `maxSteps`: Removed in v5. Use `stopWhen: stepCountIs(N)`.
- `pipeDataStreamToResponse`: Removed in v5. Use `pipeUIMessageStreamToResponse`.
- `toDataStreamResponse()`: Removed in v5. Use `toUIMessageStreamResponse()`.
- VoltAgent: Deleted from codebase. Do not reference or import.

## Existing Infrastructure Map

Existing services to wire into the new pipeline (NOT to rebuild):

| Service | Location | How Used in Phase 24 |
|---------|----------|---------------------|
| `MistralProviderService` | `modules/mistral/mistral-provider.service.ts` | `getChatModel()` for streamText model parameter |
| `PiiDetectionService` | `modules/ai/guards/pii-detection-sentinel.service.ts` | `detect()` on user messages before LLM |
| `PiiResolutionService` | `modules/ai/guards/pii-resolution.service.ts` | `storeMapping()` + `resolvePayload()` for tool args |
| `PromptGuardService` | `modules/ai/guards/prompt-guard-sentinel.service.ts` | `validateInput()` on user messages, `getDefensiveSystemPrompt()` |
| `AuditService` | `common/services/audit.service.ts` | `logAudit()` for chat events, `logToolExecution()` for tools |
| `RedisRateLimiterService` | `common/services/redis-rate-limiter.service.ts` | `checkRateLimit()` per-user before streaming |
| `CircuitBreaker` | `common/utils/circuit-breaker.utils.ts` | `getAiCircuitBreaker('mistral', 'chat-stream')` |
| `ConsentGuard` | `modules/compliance/guards/consent.guard.ts` | `@RequiresConsent('ai_chat')` decorator |
| `ConsentEnforcementService` | `modules/compliance/services/consent-enforcement.service.ts` | Used by ConsentGuard internally |
| `QuotaGuard` | `modules/subscription/guards/quota.guard.ts` | `@RequiresQuota('ai')` for usage limits |
| `UsageTrackingService` | `modules/subscription/services/usage-tracking.service.ts` | Track AI call usage for billing |
| `ActionQueue` (model) | `prisma/schema.prisma` | HITL action persistence with PENDING_APPROVAL status |
| `MistralService.generateChatTitle()` | `modules/ai/services/mistral.service.ts` | Generate conversation title from first messages |

## Open Questions

1. **`stopWhen` vs `stepCountIs` exact API**
   - What we know: `stepCountIs` is exported from `ai` package (confirmed). Web docs say `stopWhen: stepCountIs(5)`. But `stopWhen` itself is NOT a named export (checked).
   - What's unclear: Is `stopWhen` a parameter name on `streamText` options, not a standalone export? The migration guide says it replaced `maxSteps`.
   - Recommendation: In implementation, use the pattern `stopWhen: stepCountIs(5)` as a streamText option. If TypeScript rejects it, fall back to checking `ai` package types directly.

2. **HITL Stream Pause Mechanics**
   - What we know: `needsApproval: true` on a tool causes the SDK to emit an `approval-requested` part. Frontend calls `addToolApprovalResponse`.
   - What's unclear: In a NestJS backend (not Next.js), how does the approval response get back to the server? The AI SDK HITL docs are Next.js-centric with `useChat`.
   - Recommendation: For Phase 24 (backend only), implement HITL as: (1) stream emits tool-call with `needsApproval`, (2) `ActionQueue` entry created in `onStepFinish`, (3) stream completes with pending actions. Approval is a SEPARATE endpoint (`POST /ai/chat/approve`). Phase 27 (frontend) wires the approval UI.

3. **Batch HITL Grouping**
   - What we know: User wants related destructive actions grouped into one approval card with per-item control.
   - What's unclear: AI SDK v6 doesn't natively support batch approval. Each tool call has its own `needsApproval`.
   - Recommendation: Implement at the application level: when multiple tool calls in a single step need approval, group their `ActionQueue` entries with a shared `batchId`. Frontend renders as one card. Consider adding a `batchId` field to `ActionQueue` or a `conversationId` field to correlate actions.

## Sources

### Primary (HIGH confidence)
- AI SDK v6 NestJS cookbook: https://ai-sdk.dev/cookbook/api-servers/nest
- AI SDK v6 streamText reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- AI SDK v6 tool calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI SDK v6 HITL: https://ai-sdk.dev/cookbook/next/human-in-the-loop
- AI SDK v6 pipeUIMessageStreamToResponse: https://ai-sdk.dev/docs/reference/ai-sdk-ui/pipe-ui-message-stream-to-response
- AI SDK v5 migration guide: https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
- Runtime verification of `ai@6.0.77` exports (confirmed locally)

### Secondary (MEDIUM confidence)
- AI SDK v6 announcement: https://vercel.com/blog/ai-sdk-6
- ZeroClaw architecture reference: https://github.com/openagen/zeroclaw/tree/main/src (structure only, no implementation details)
- Tool execution approval tutorial: https://oboe.com/learn/mastering-vercel-ai-sdk-v6-1nmf34r/tool-execution-approval-156v70c

### Tertiary (LOW confidence)
- None -- all findings verified against official docs or local package inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified installed, exports confirmed
- Architecture: HIGH -- patterns from official AI SDK docs + verified against NestJS patterns in codebase
- Pitfalls: HIGH -- most pitfalls from verified API changes (v5 migration guide) and existing codebase patterns
- HITL mechanics: MEDIUM -- AI SDK docs are Next.js-centric; NestJS backend-only HITL needs custom wiring
- stopWhen API: MEDIUM -- confirmed `stepCountIs` export exists, but `stopWhen` parameter name needs TypeScript validation

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable -- AI SDK v6 is released, not beta)
