# Phase 23: SDK Foundation & Test Infrastructure - Research

**Researched:** 2026-02-27
**Domain:** Mistral LLM SDK consolidation, AI SDK v6 embedding/chat provider, NestJS test infrastructure
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Clean break: remove `@mistralai/mistralai` AND `@voltagent/core` in one pass -- no coexistence period
- DB is purgeable (dev environment) -- no data migration concerns
- All files migrated in one shot, not gradual
- Standalone `MistralModule` (not inside AI module) -- any NestJS module can import it
- Thin provider: `MistralProviderService` exposes model instances via `getChatModel(modelId?)` and `getEmbeddingModel(modelId?)`
- Callers use AI SDK functions (`streamText`, `embed`, `generateText`) directly with provider models
- Default chat model: `mistral-small-latest` with optional per-call override
- Default embedding model: `mistral-embed` (same as current -- 1024 dimensions, compatible with existing pgvector indexes)
- Provider service does NOT handle retries -- callers decide retry strategy based on context
- Provider DOES standardize error types: wraps raw SDK errors into typed NestJS exceptions (MistralRateLimitError, MistralAuthError, etc.)
- BullMQ embedding queue keeps its own retry logic (already has 6-retry + DLQ)
- Wipe all existing embeddings -- clean slate
- Re-generate everything via new AI SDK `embed()`/`embedMany()` through BullMQ pipeline
- Keep existing BullMQ queue architecture (batching 50 items, 200ms flush, 2 req/s rate limit)
- Bulk re-embed triggered via CLI script: `npx ts-node scripts/re-embed-all.ts`
- Script processes both emails AND contacts
- 3301 emails available in `D:\PMSync\data\posta_extracted.jsonl` (PST extract, JSONL format)
- Test data flow: JSONL -> embedding pipeline (BullMQ -> AI SDK embed() -> pgvector)
- No app accounts/folders created -- data is purely for LLM pipeline validation
- Full pipeline test: streaming chat response + DB persistence + tool detection + embedding query
- Tests BOTH chat/streaming AND embedding generation+retrieval
- Local dev only -- no CI (requires real MISTRAL_API_KEY)
- Hard fail: phase is NOT complete until E2E gate passes with real Mistral API
- TEST-01 (MSW v2 mocking) dropped from Phase 23 -- all tests use real Mistral API calls
- Test runner: Vitest (native ESM/TS, fast, modern)
- Test file location: colocated with source (e.g., `src/ai/services/__tests__/chat.service.test.ts`)

### Claude's Discretion
- Internal structure of MistralProviderService implementation
- Exact typed exception class hierarchy
- Vitest configuration details
- Re-embed script progress reporting and error handling
- Seed script batching strategy for 3301 emails

### Deferred Ideas (OUT OF SCOPE)
- **MSW v2 mocking infrastructure (TEST-01)** -- dropped from Phase 23. All tests use real API. Mocking can be added in a future phase if CI speed becomes an issue.
- **MSDK-03 partial** -- `@voltagent/core` removal is included in Phase 23 (per user decision), but may have deep tentacles that surface during implementation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MSDK-01 | All LLM chat/completion calls routed through `@ai-sdk/mistral` provider -- no direct `@mistralai/mistralai` SDK usage | Codebase audit identifies 14 files importing `@mistralai/mistralai`, all in `modules/ai/`. AI SDK `createMistral` + `streamText`/`generateText` replaces all direct Mistral client usage. See Architecture Patterns and Code Examples sections. |
| MSDK-02 | All embedding generation routed through AI SDK `embed()`/`embedMany()` via `@ai-sdk/mistral` | AI SDK provides `mistral.embedding('mistral-embed')` factory. `embed()` returns `{ embedding: number[], usage }`, `embedMany()` returns `{ embeddings: number[][], usage }`. Both auto-chunk large batches. See Code Examples section. |
| TEST-01 | MSW v2 infrastructure with SSE handlers for mocking LLM streaming responses | **DEFERRED per user decision.** All tests use real Mistral API calls. MSW infrastructure deferred to future phase. |
</phase_requirements>

## Summary

This phase replaces two SDK dependencies (`@mistralai/mistralai` and `@voltagent/core`) with a single unified provider built on `@ai-sdk/mistral` (already installed at `^3.0.19`) and the AI SDK core (`ai` at `^6.0.77`). The backend already has one file using `@ai-sdk/mistral` (`voltagent/providers/mistral.provider.ts`) -- that file is the evolutionary ancestor of the new `MistralProviderService`.

The codebase audit reveals 14 files importing `@mistralai/mistralai` directly and 23 files importing `@voltagent/core`. The VoltAgent directory contains 121 TypeScript files (the main service alone is 1091 lines). This is a significant rip-out, not a thin refactor.

The embedding pipeline is well-structured: `KnowledgeBaseService` (facade) delegates to `EmbeddingComposerService`, `EmbeddingCrudService`, `EmbeddingSearchService`, and `EmbeddingBackfillService`. Two BullMQ queues (`EmailEmbeddingQueueService`, `ContactEmbeddingQueueService`) handle async processing. The AI SDK `embed()`/`embedMany()` functions are drop-in replacements for the raw `Mistral.embeddings.create()` calls -- same model (`mistral-embed`), same 1024 dimensions, same output shape.

**Primary recommendation:** Create a standalone `MistralModule` with `MistralProviderService` exposing `getChatModel()`/`getEmbeddingModel()` methods. Rewrite all 14 direct-SDK call sites to use AI SDK functions with provider models. Introduce Vitest alongside Jest (coexistence is fine) for new real-API tests. Run re-embed script to backfill 3301 emails from JSONL.

## CRITICAL: Vitest vs Jest Conflict

**REQUIREMENTS.md says "Vitest migration" is out of scope** (listed in "Out of Scope" table with reason "Jest 30 already configured, cost > benefit"). However, **CONTEXT.md (user decision) says "Test runner: Vitest"**.

**Resolution:** CONTEXT.md is the user's explicit decision from the discussion phase. It overrides the general requirements table. The user chose Vitest specifically for Phase 23's new test files. This does NOT mean migrating existing Jest tests -- it means new Phase 23 tests use Vitest while existing 35 spec files remain on Jest 30. Both can coexist since they have separate config files and separate test file patterns (`.test.ts` for Vitest, `.spec.ts` for Jest).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | ^6.0.77 (already installed) | AI SDK core -- `streamText`, `generateText`, `embed`, `embedMany` | Vercel's official AI SDK; de facto standard for TypeScript LLM integration |
| `@ai-sdk/mistral` | ^3.0.19 (already installed) | Mistral provider -- `createMistral()`, `.embedding()` | Official AI SDK provider for Mistral; already in package.json |
| `@nestjs/common` + `@nestjs/core` | (existing) | NestJS DI framework | Project foundation -- MistralModule is a NestJS module |
| `bullmq` | (existing) | Async job queues for embedding pipeline | Already powers email/contact embedding queues |
| `vitest` | ^3.x (NEW) | Test runner for real-API integration tests | User decision. Native ESM/TS support, fast startup, globals mode |
| `unplugin-swc` | ^1.x (NEW) | SWC transpiler plugin for Vitest | Required for NestJS decorators + emitDecoratorMetadata in Vitest |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@swc/core` | ^1.x (NEW dev dep) | SWC compiler backend | Required by unplugin-swc for decorator metadata |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest 30 (existing) | Jest already configured with 35 spec files. Vitest chosen per user decision for new tests only. Coexistence works. |
| unplugin-swc | ts-jest equivalent for Vitest | unplugin-swc is the NestJS-recommended approach for Vitest (Trilon/nest-vitest) |

**Installation:**
```bash
npm install --save-dev vitest unplugin-swc @swc/core
```

No new runtime dependencies needed. `ai` and `@ai-sdk/mistral` are already installed.

## Architecture Patterns

### Recommended Module Structure
```
backend/src/
├── modules/
│   ├── mistral/                         # NEW standalone module
│   │   ├── mistral.module.ts            # NestJS module definition
│   │   ├── mistral-provider.service.ts  # Thin provider (getChatModel, getEmbeddingModel)
│   │   ├── mistral-error.ts             # Typed error classes (MistralRateLimitError, etc.)
│   │   └── __tests__/
│   │       └── mistral-provider.test.ts # Real-API test (Vitest)
│   ├── ai/                              # EXISTING -- rewired to import MistralModule
│   │   ├── services/
│   │   │   ├── mistral-embedding.service.ts  # Rewired to use AI SDK embed()/embedMany()
│   │   │   ├── mistral.service.ts            # Rewired to use AI SDK generateText()
│   │   │   └── ...
│   │   └── voltagent/                   # DELETED (121 files)
│   └── ...
├── scripts/
│   └── re-embed-all.ts                  # CLI script for bulk re-embedding
```

### Pattern 1: Standalone MistralModule as Provider
**What:** A thin NestJS module that wraps `@ai-sdk/mistral`'s `createMistral()` and exposes model factories via DI.
**When to use:** Any module that needs LLM chat or embedding models.
**Example:**
```typescript
// Source: https://ai-sdk.dev/providers/ai-sdk-providers/mistral
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMistral } from '@ai-sdk/mistral';
import type { LanguageModel, EmbeddingModel } from 'ai';

@Injectable()
export class MistralProviderService {
  private readonly provider: ReturnType<typeof createMistral>;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('MISTRAL_API_KEY');
    this.provider = createMistral({ apiKey });
  }

  getChatModel(modelId?: string): LanguageModel {
    return this.provider(modelId ?? 'mistral-small-latest');
  }

  getEmbeddingModel(modelId?: string): EmbeddingModel<string> {
    return this.provider.embedding(modelId ?? 'mistral-embed');
  }
}
```

### Pattern 2: Callers Use AI SDK Functions Directly
**What:** Services import `streamText`/`generateText`/`embed`/`embedMany` from `'ai'` and get the model from `MistralProviderService`.
**When to use:** Every call site that currently uses `new Mistral()` or `@voltagent/core` Agent.
**Example:**
```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-core/embeddings
import { embed, embedMany } from 'ai';
import { MistralProviderService } from '../../mistral/mistral-provider.service';

@Injectable()
export class MistralEmbeddingService {
  constructor(private readonly mistralProvider: MistralProviderService) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.mistralProvider.getEmbeddingModel(),
      value: text,
    });
    return embedding;
  }

  async generateBulkEmbeddings(texts: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.mistralProvider.getEmbeddingModel(),
      values: texts,
    });
    return embeddings;
  }
}
```

### Pattern 3: Chat/Completion via AI SDK
**What:** Replace `client.chat.complete()` calls with `generateText()` and `streamText()`.
**When to use:** Every LLM chat/completion call site.
**Example:**
```typescript
// Source: https://ai-sdk.dev/examples/api-servers/nest
import { generateText, streamText } from 'ai';

@Injectable()
export class MistralChatService {
  constructor(private readonly mistralProvider: MistralProviderService) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const { text } = await generateText({
      model: this.mistralProvider.getChatModel(),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.4,
      maxTokens: 512,
    });
    return text;
  }

  async stream(messages: CoreMessage[], res: Response): Promise<void> {
    const result = streamText({
      model: this.mistralProvider.getChatModel(),
      messages,
    });
    result.pipeUIMessageStreamToResponse(res);
  }
}
```

### Pattern 4: Error Wrapping at Provider Level
**What:** Catch raw SDK errors in `MistralProviderService` methods and wrap them into typed NestJS-compatible exceptions.
**When to use:** The provider itself. Callers get typed errors they can handle without knowing SDK internals.
**Example:**
```typescript
// Typed exceptions (NestJS HttpException subclasses or custom)
export class MistralRateLimitError extends AiError {
  constructor(retryAfterMs?: number) {
    super('Mistral rate limit exceeded', AiErrorCode.RATE_LIMITED, {
      retryable: true,
      context: { retryAfterMs },
    });
  }
}

export class MistralAuthError extends AiError {
  constructor() {
    super('Mistral API key invalid or expired', AiErrorCode.AUTH_FAILED, {
      retryable: false,
    });
  }
}
```

### Pattern 5: Vitest Config for NestJS
**What:** Vitest configuration with SWC plugin for NestJS decorator metadata support.
**When to use:** All new real-API tests.
**Example:**
```typescript
// Source: https://github.com/TrilonIO/nest-vitest
// backend/vitest.config.ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.test.ts'],     // Vitest uses .test.ts
    // .spec.ts stays with Jest
    testTimeout: 60_000,               // Real API calls need generous timeout
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2021',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
```

### Anti-Patterns to Avoid
- **Do NOT keep `@mistralai/mistralai` "just for batch API"**: The Batch API (`client.batch.jobs.*`) is Mistral-specific and has no AI SDK equivalent. However, the user decided clean break. For batch operations, either defer them or implement them via raw HTTP calls through the AI SDK's fetch customization.
- **Do NOT instantiate `createMistral()` in multiple places**: One singleton in MistralProviderService. All other services get models via DI.
- **Do NOT add retry logic in the provider**: User decision says callers decide retry strategy. Provider only wraps errors.
- **Do NOT migrate existing .spec.ts files to Vitest**: They stay on Jest 30. Only new Phase 23 tests use Vitest with `.test.ts` extension.
- **Do NOT try to use `embed()`/`embedMany()` for the Batch API**: The Batch API is a Mistral-specific async file-upload workflow, not the same as real-time embedding generation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM streaming | Custom SSE chunking | `streamText()` + `pipeUIMessageStreamToResponse()` | AI SDK handles backpressure, encoding, abort signals, SSE formatting |
| Embedding batching | Manual chunk splitting | `embedMany()` with `maxParallelCalls` | AI SDK auto-splits large batches when model has limits |
| Mistral provider creation | Manual HTTP client | `createMistral({ apiKey })` | Handles auth, base URL, model routing, error parsing |
| Decorator metadata in Vitest | Custom transforms | `unplugin-swc` | NestJS decorators require `emitDecoratorMetadata`; SWC handles it natively |
| Abort/timeout for LLM calls | Manual Promise.race | `abortSignal: AbortSignal.timeout(ms)` on `generateText`/`embed` | AI SDK built-in, cleaner than raw Promise.race |

**Key insight:** The AI SDK already handles the exact problems the current codebase solves manually -- embedding batching, streaming, error normalization, abort signals. The migration should DELETE complexity, not add it.

## Common Pitfalls

### Pitfall 1: Batch API Has No AI SDK Equivalent
**What goes wrong:** Assuming `embedMany()` replaces the Mistral Batch API (`client.batch.jobs.create()`). They are completely different features. `embedMany()` is real-time batch embedding. The Batch API is async file-upload-based processing at lower cost.
**Why it happens:** Naming similarity. "Batch" in both contexts means different things.
**How to avoid:** The two BullMQ queues (`EmailEmbeddingQueueService`, `ContactEmbeddingQueueService`) use real-time embedding calls, NOT the Batch API. The Batch API is used separately in `MistralBatchProvider` and `mistral-batch.service.ts`. Since the user wants a clean break from `@mistralai/mistralai`, batch API features must either be deferred or reimplemented via raw HTTP.
**Warning signs:** If the planner creates a task "replace batch API with embedMany" -- that's wrong.

### Pitfall 2: VoltAgent Tentacles Are Deep
**What goes wrong:** Deleting the `voltagent/` directory breaks 20+ import chains across the AI module and its consumers.
**Why it happens:** VoltAgent provides `Memory`, `BaseRetriever`, `Agent`, `createTool`, `createHooks`, `createWorkflow`, and `AgentHooks`. These are used in 23 files across tools, services, agents, observability, and RAG.
**How to avoid:** Phase 23's scope is the SDK provider and embeddings. VoltAgent removal should be limited to: (1) removing the `@voltagent/core` Agent-based chat path, (2) removing `@voltagent/postgres` Memory, and (3) stubbing/deleting files that only VoltAgent uses. Full cleanup is Phase 28 (MSDK-03). Don't try to preserve VoltAgent functionality -- just cut it.
**Warning signs:** If implementation tries to "port" VoltAgent tools to AI SDK tools -- that's Phase 25 (AI-02), not Phase 23.

### Pitfall 3: EmbeddingModel Type Mismatch
**What goes wrong:** `mistral.embedding('mistral-embed')` returns `EmbeddingModel<string>` from `ai` package. The existing `IEmbeddingProvider` interface expects `generateEmbedding(text: string): Promise<number[]>`. These are different abstraction levels.
**Why it happens:** The existing code has its own provider abstraction (`EmbeddingProviderService` -> `IEmbeddingProvider` -> `MistralEmbeddingProvider`). The AI SDK has its own abstraction (`EmbeddingModel` -> `embed()`).
**How to avoid:** Don't try to make AI SDK's `EmbeddingModel` implement `IEmbeddingProvider`. Instead, rewrite the callers (`MistralEmbeddingService`, `EmbeddingProviderService`) to use `embed()`/`embedMany()` directly. The `IEmbeddingProvider` abstraction becomes unnecessary since the AI SDK already provides provider abstraction.
**Warning signs:** If the implementation tries to wrap `embed()` inside a class that implements `IEmbeddingProvider` -- that's adding a layer, not removing one.

### Pitfall 4: Vitest + Jest File Pattern Collision
**What goes wrong:** Both test runners pick up the same test files, causing double-execution or failures.
**Why it happens:** Default patterns overlap. Jest uses `*.spec.ts` (configured in jest.config.js). If Vitest is not explicitly scoped to `*.test.ts`, it may also match `*.spec.ts`.
**How to avoid:** Vitest config MUST explicitly set `include: ['src/**/*.test.ts']`. Jest config already uses `testMatch: ['<rootDir>/src/**/*.spec.ts']`. New Phase 23 tests MUST use `.test.ts` extension. Add a `vitest` script to package.json separate from `test` (which runs Jest).
**Warning signs:** If `npm test` starts running Vitest tests or `npm run vitest` runs Jest specs.

### Pitfall 5: Missing AbortSignal Timeout on Real API Tests
**What goes wrong:** Real Mistral API tests hang forever when the API is slow or down, blocking the test suite.
**Why it happens:** No timeout set on API calls. Vitest's `testTimeout` alone doesn't abort the HTTP request.
**How to avoid:** Always pass `abortSignal: AbortSignal.timeout(15_000)` (or similar) in test `embed()`/`generateText()` calls. Also set Vitest `testTimeout: 60_000` as a safety net.
**Warning signs:** CI/local tests hanging with no output.

### Pitfall 6: pgvector Dimensions Must Match
**What goes wrong:** New embeddings generated with AI SDK have different dimensions than the pgvector index expects.
**Why it happens:** Using a different embedding model ID or a model update changes dimensions.
**How to avoid:** The model is `mistral-embed` (1024 dimensions) -- same as current. Prisma schema has `vector` as `Unsupported("vector")` with no dimension constraint in the schema itself (constraint is in the SQL migration). Verify after first embed that `embedding.length === 1024`.
**Warning signs:** Prisma raw SQL insert fails with dimension mismatch error.

## Code Examples

### Creating the Mistral Provider Module
```typescript
// Source: https://ai-sdk.dev/providers/ai-sdk-providers/mistral
// backend/src/modules/mistral/mistral.module.ts
import { Module, Global } from '@nestjs/common';
import { MistralProviderService } from './mistral-provider.service';

@Global()  // Makes it importable anywhere without explicit module import
@Module({
  providers: [MistralProviderService],
  exports: [MistralProviderService],
})
export class MistralModule {}
```

### Embedding with AI SDK (replacing MistralEmbeddingProvider)
```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-core/embeddings
import { embed, embedMany } from 'ai';

// Single embedding
const { embedding, usage } = await embed({
  model: mistralProvider.getEmbeddingModel(),  // mistral.embedding('mistral-embed')
  value: 'some text to embed',
  maxRetries: 3,
  abortSignal: AbortSignal.timeout(10_000),
});
// embedding: number[] (1024 dimensions)
// usage: { tokens: number }

// Bulk embeddings
const { embeddings, usage: bulkUsage } = await embedMany({
  model: mistralProvider.getEmbeddingModel(),
  values: ['text 1', 'text 2', 'text 3'],
  maxRetries: 3,
  maxParallelCalls: 2,  // matches existing 2 req/s rate limit
});
// embeddings: number[][] (maintains input order)
```

### Generating Text (replacing Mistral client.chat.complete)
```typescript
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
import { generateText } from 'ai';

const { text, usage, finishReason } = await generateText({
  model: mistralProvider.getChatModel(),  // mistral('mistral-small-latest')
  system: 'You are a helpful assistant.',
  prompt: userMessage,
  temperature: 0.4,
  maxTokens: 512,
  abortSignal: AbortSignal.timeout(30_000),
  providerOptions: {
    mistral: { safePrompt: true },
  },
});
```

### Streaming in NestJS Controller
```typescript
// Source: https://ai-sdk.dev/examples/api-servers/nest
import { Controller, Post, Res, Body } from '@nestjs/common';
import { streamText } from 'ai';
import { Response } from 'express';

@Controller('api/v1/chat')
export class ChatController {
  constructor(private readonly mistralProvider: MistralProviderService) {}

  @Post('stream')
  async streamChat(@Body() body: { messages: CoreMessage[] }, @Res() res: Response) {
    const result = streamText({
      model: this.mistralProvider.getChatModel(),
      messages: body.messages,
    });
    result.pipeUIMessageStreamToResponse(res);
  }
}
```

### Real-API Vitest Test Example
```typescript
// backend/src/modules/mistral/__tests__/mistral-provider.test.ts
import { describe, it, expect } from 'vitest';
import { embed, generateText } from 'ai';
import { createMistral } from '@ai-sdk/mistral';

const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY!,
});

describe('MistralProviderService (real API)', () => {
  it('generates embedding with correct dimensions', async () => {
    const { embedding } = await embed({
      model: mistral.embedding('mistral-embed'),
      value: 'test embedding for pipeline validation',
      abortSignal: AbortSignal.timeout(15_000),
    });

    expect(embedding).toHaveLength(1024);
    expect(embedding.every(v => typeof v === 'number' && Number.isFinite(v))).toBe(true);
  }, 30_000);

  it('generates text response', async () => {
    const { text, finishReason } = await generateText({
      model: mistral('mistral-small-latest'),
      prompt: 'Reply with exactly: PIPELINE_OK',
      maxTokens: 10,
      abortSignal: AbortSignal.timeout(15_000),
    });

    expect(text).toContain('PIPELINE_OK');
    expect(finishReason).toBe('stop');
  }, 30_000);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `new Mistral({ apiKey })` + `client.chat.complete()` | `createMistral()` + `generateText()`/`streamText()` | AI SDK v3 provider (2024) | Unified API across providers, built-in streaming, abort signals |
| `client.embeddings.create({ inputs })` | `embed({ model, value })` / `embedMany({ model, values })` | AI SDK v3 provider (2024) | Auto-chunking, telemetry, consistent error types |
| VoltAgent `Agent` class with `generateText()`/`streamText()` | Raw AI SDK `streamText()` with tool definitions | v3.2 decision | Removes 33K LOC framework overhead, direct control |
| Jest + ts-jest for all tests | Jest for existing specs + Vitest for new real-API tests | Phase 23 decision | Vitest: native ESM/TS, faster startup, better DX for integration tests |
| `@voltagent/core` `createTool()` | AI SDK `tool()` from `ai` package | v3.2 decision (Phase 25) | NestJS DI-compatible, no VoltAgent dependency |

**Deprecated/outdated:**
- `@mistralai/mistralai` direct SDK: Replaced by `@ai-sdk/mistral` provider. All 14 import sites must be migrated.
- `@voltagent/core` (Agent, Memory, BaseRetriever, createTool, createHooks, createWorkflow): Replaced by raw AI SDK functions + NestJS services. 23 import sites. Full removal in Phases 23-28.
- `@voltagent/postgres` (PostgreSQLMemoryAdapter): Replaced by direct Prisma queries (Phase 24, AI-04).

## Codebase Audit: Files Requiring Migration

### Files Importing `@mistralai/mistralai` (14 files -- ALL must be migrated in Phase 23)
1. `modules/ai/services/mistral.service.ts` -- Main facade, `completePrompt()`, batch API
2. `modules/ai/services/mistral-embedding.service.ts` -- `generateEmbedding()`, `generateBulkEmbeddings()`
3. `modules/ai/services/mistral-rag.service.ts` -- RAG chat with context injection
4. `modules/ai/services/mistral-agent-cleanup.service.ts` -- GDPR agent deletion
5. `modules/ai/services/embedding/mistral-embedding.provider.ts` -- Embedding provider abstraction
6. `modules/ai/services/embedding/mistral-batch.provider.ts` -- Batch API embedding
7. `modules/ai/voltagent/providers/mistral.provider.ts` -- AI SDK provider (ALREADY uses `@ai-sdk/mistral`)
8. `modules/ai/voltagent/services/analytics.service.ts` -- Analytics with direct Mistral client
9. `modules/ai/voltagent/services/document-library.service.ts` -- Document processing
10. `modules/ai/voltagent/services/mistral-batch.service.ts` -- Batch processing service
11. `modules/ai/voltagent/tools/web-search.tools.ts` -- Web search tool
12. `modules/ai/voltagent/tools/analytics.tools.ts` -- Analytics tool

### Files Importing `@voltagent/core` (23 files -- removed with voltagent/ directory)
The entire `voltagent/` directory (121 files) is deleted. Key imports:
- `Agent`, `Memory`, `Tool` -- agent orchestration
- `createTool` -- tool definitions (14 tool files)
- `createHooks`, `AgentHooks` -- observability hooks
- `createWorkflow`, `andThen` -- approval workflow
- `BaseRetriever` -- RAG retriever base class

### Files Importing `ai` package (2 files -- keep and expand)
1. `voltagent/agents/unified.agent.ts` -- `LanguageModel` type
2. `voltagent/providers/mistral.provider.ts` -- `LanguageModel` type

### Batch API Decision
The `MistralBatchProvider` and `mistral-batch.service.ts` use Mistral's Batch API (`client.batch.jobs.*`, `client.files.upload()`). This API has NO AI SDK equivalent. Options:
1. **Delete batch functionality** -- simplest, aligns with clean break
2. **Reimplement via raw HTTP** -- more work, preserves cost savings
3. **Keep `@mistralai/mistralai` ONLY for batch** -- contradicts clean break decision

**Recommendation:** Delete batch functionality in Phase 23. It's used for large-scale reindexing which can be done via `embedMany()` through the existing BullMQ queue (slightly more expensive but simpler). If batch API cost savings are needed later, add it back via raw HTTP in a future phase.

## JSONL Data File Structure

The file at `D:\PMSync\data\posta_extracted.jsonl` contains 3301 email records. Each line is a JSON object with fields:
```json
{
  "subject": "string",
  "bodyText": "string",
  "bodyHtml": "string",
  "from": "email@example.com",
  "fromName": "Display Name",
  "to": ["email@example.com"],
  "cc": [],
  "bcc": [],
  "sentAt": "ISO date",
  "receivedAt": "ISO date",
  "messageId": "string",
  "threadId": "string",
  "folder": "INBOX|SENT|TRASH|...",
  "isRead": boolean,
  "hasAttachments": boolean,
  "externalId": "pst-xxxx",
  "snippet": "string"
}
```

The re-embed script needs to read each line, compose embedding content (subject + bodyText + from), and feed it through the BullMQ pipeline. No Prisma email records need to be created -- the embeddings are standalone test data.

## Open Questions

1. **Batch API fate**
   - What we know: User wants clean break from `@mistralai/mistralai`. Batch API has no AI SDK equivalent.
   - What's unclear: Whether the cost savings of batch API matter enough to keep it.
   - Recommendation: Delete it. Use `embedMany()` via BullMQ for bulk operations. Revisit if cost becomes an issue.

2. **GDPR agent cleanup without direct SDK**
   - What we know: `MistralAgentCleanupService` uses `new Mistral()` to delete Mistral agents on tenant deletion.
   - What's unclear: Whether Mistral's agent API has an equivalent in AI SDK (it almost certainly doesn't -- it's a Mistral-specific feature).
   - Recommendation: If Mistral agents are no longer used (VoltAgent removed), this service becomes dead code. Delete it.

3. **VoltAgent removal scope boundary**
   - What we know: User says "remove `@voltagent/core` in one pass." But 23 files import it, and the AI chat pipeline depends on VoltAgent's Agent class.
   - What's unclear: Whether Phase 23 should only remove the SDK dependency or also all files using it.
   - Recommendation: Delete the entire `voltagent/` directory. The chat pipeline breaks (expected -- it's rebuilt in Phase 24). The embedding pipeline survives because it doesn't use VoltAgent.

## Sources

### Primary (HIGH confidence)
- [AI SDK Embeddings docs](https://ai-sdk.dev/docs/ai-sdk-core/embeddings) -- `embed()`, `embedMany()` API, return types, options
- [AI SDK Mistral Provider](https://ai-sdk.dev/providers/ai-sdk-providers/mistral) -- `createMistral()`, `.embedding()`, providerOptions
- [AI SDK embedMany reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/embed-many) -- Full function signature, maxParallelCalls, telemetry
- [AI SDK NestJS example](https://ai-sdk.dev/examples/api-servers/nest) -- streamText + pipeUIMessageStreamToResponse pattern
- [Trilon nest-vitest](https://github.com/TrilonIO/nest-vitest) -- Official NestJS + Vitest configuration with unplugin-swc
- Codebase audit: Direct grep/read of 14 `@mistralai/mistralai` imports, 23 `@voltagent/core` imports

### Secondary (MEDIUM confidence)
- [NestJS v12 roadmap](https://github.com/nestjs/nest/pull/16391) -- NestJS v12 (Q3 2026) will default to Vitest for ESM projects. Current v10/v11 coexistence pattern validated by Trilon.
- [Vitest config docs](https://vitest.dev/config/) -- Configuration options, include patterns, timeouts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed or well-documented; AI SDK docs are current and complete
- Architecture: HIGH -- patterns directly from official docs and existing codebase analysis; user decisions are clear
- Pitfalls: HIGH -- based on direct codebase audit (14 + 23 import sites counted); type mismatches verified in source code

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain -- AI SDK and Mistral provider are mature)
