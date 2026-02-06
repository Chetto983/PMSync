# Phase 01: AI Infrastructure Cleanup - Research

**Researched:** 2026-02-06
**Domain:** VoltAgent infrastructure, tool consolidation, scalability, observability
**Confidence:** HIGH

## Summary

This research investigates the technical requirements for cleaning up MailAgent's AI infrastructure before implementing new features. The codebase already has substantial infrastructure in place (VoltAgent integration, Redis caching, distributed locks, circuit breakers, retry utilities) but needs audit and consolidation to match official patterns and improve reliability.

The primary work involves: (1) auditing current VoltAgent implementation against official documentation patterns, (2) consolidating duplicate tool implementations into a single location, (3) implementing proper Prometheus metrics for observability, and (4) ensuring scalability for 100+ concurrent users with <100ms RAG latency.

**Primary recommendation:** Conduct formal AUDIT.md of current implementation before any fixes. Leverage existing common infrastructure (circuit breakers, retry, Redis locks) rather than adding new patterns. Use `@willsoto/nestjs-prometheus` for metrics integration with histogram-based latency tracking.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@voltagent/core` | latest | Agent runtime, memory, tools | Official VoltAgent framework for TypeScript AI agents |
| `@voltagent/postgres` | latest | PostgreSQL memory adapter | Tenant-isolated persistence for multi-user |
| `ai` (Vercel AI SDK) | 6.x | Streaming, model routing | Industry standard for streaming AI responses |
| `@mistralai/mistralai` | latest | Primary LLM provider | Already in use, keep for consistency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@willsoto/nestjs-prometheus` | latest | Prometheus metrics NestJS integration | Add /metrics endpoint, histogram latency tracking |
| `prom-client` | latest | Low-level Prometheus client | Underlying metrics library (comes with willsoto) |
| `ioredis` | already installed | Redis for caching, locks, rate limiting | Already in use via CacheService, RedisLockService |
| `@prisma/client` | 7.x | Database ORM with pgvector | Already in use, includes retry patterns |

### Already Implemented (USE, DON'T REBUILD)
| Component | Location | Purpose |
|-----------|----------|---------|
| `CacheService` | `backend/src/common/services/cache.service.ts` | Redis caching with namespaces, TTL, bulk ops |
| `RedisLockService` | `backend/src/common/services/redis-lock.service.ts` | Distributed locks with fencing tokens |
| `CircuitBreaker` | `backend/src/common/utils/circuit-breaker.utils.ts` | API failure protection with states |
| `withRetry` | `backend/src/common/utils/retry.utils.ts` | Exponential backoff with jitter |
| `PrismaRetryService` | `backend/src/common/services/prisma-retry.service.ts` | P2002/P2034 transient error handling |
| `RateLimiter` | `backend/src/common/utils/retry.utils.ts` | In-memory sliding window rate limiting |

**Installation for new dependencies:**
```bash
npm install @willsoto/nestjs-prometheus prom-client
```

## Architecture Patterns

### Recommended Project Structure (AI Module)
```
backend/src/modules/ai/
├── voltagent/
│   ├── agents/           # Agent definitions (UnifiedAgent, SupervisorAgent)
│   ├── tools/            # ALL tool implementations (consolidate here)
│   ├── services/         # Support services (metrics, memory, chat processing)
│   ├── rag/              # RAG retriever, query analyzer
│   ├── prompts/          # Prompt templates per intent
│   ├── observability/    # Hooks, learning, metrics export
│   └── locales/          # i18n for AI responses
├── services/             # Provider services (MistralService, EmbeddingsService)
├── guards/               # PII detection, prompt guard
└── errors/               # AI-specific error classes
```

### Pattern 1: VoltAgent Official Agent Creation
**What:** Create agents with typed tools, memory, and hooks
**When to use:** All AI agent creation
**Example:**
```typescript
// Source: VoltAgent GitHub README + existing MailAgent implementation
import { Agent, type AgentHooks, type Memory, type Tool } from '@voltagent/core';

const agent = new Agent({
  name: 'UnifiedAgent',
  purpose: 'Intelligent email assistant with dynamic capabilities',
  model,                    // LanguageModel from AI SDK
  instructions: dynamicInstructions,
  tools,                    // Array of Tool definitions
  memory,                   // PostgreSQLMemoryAdapter
  hooks,                    // Observability hooks
  maxSteps: 8,              // Prevent runaway tool loops
});
```

### Pattern 2: Tool Definition with Zod Schema
**What:** Type-safe tool parameters with Zod validation
**When to use:** All VoltAgent tool implementations
**Example:**
```typescript
// Source: VoltAgent docs + existing MailAgent tools
import { Tool, createTool } from '@voltagent/core';
import { z } from 'zod';

const searchEmailsTool = createTool({
  name: 'search_emails',
  description: 'Search user emails with query',
  parameters: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().default(10).describe('Max results'),
  }),
  execute: async ({ query, limit }) => {
    // Tool implementation
  },
});
```

### Pattern 3: Multi-Provider LLM Abstraction
**What:** Abstract provider layer so tools don't know which LLM is used
**When to use:** Any code calling LLM APIs
**Example:**
```typescript
// Source: 2026 multi-provider patterns research
// Provider Strategy Pattern - tools use interface, not concrete provider
interface LLMProvider {
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateEmbedding(text: string): Promise<number[]>;
  streamText(prompt: string, options?: StreamOptions): AsyncGenerator<string>;
}

// Factory selects provider based on config/task
class LLMProviderFactory {
  getProvider(task: TaskType): LLMProvider {
    if (task.requiresLowLatency) return this.mistralSmall;
    if (task.requiresHighQuality) return this.mistralLarge;
    return this.mistralMedium;
  }
}
```

### Pattern 4: Prometheus Metrics in NestJS
**What:** Histogram-based latency tracking with custom metrics
**When to use:** All AI operations that need monitoring
**Example:**
```typescript
// Source: @willsoto/nestjs-prometheus + prom-client docs
import { PrometheusModule, makeHistogramProvider } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';

// In module
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    makeHistogramProvider({
      name: 'ai_chat_response_duration_seconds',
      help: 'AI chat response duration in seconds',
      labelNames: ['agent', 'status', 'model'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    }),
  ],
})

// In service
@Injectable()
class AiMetricsService {
  constructor(
    @InjectMetric('ai_chat_response_duration_seconds')
    private readonly chatDuration: Histogram<string>,
  ) {}

  recordChatDuration(agent: string, status: string, model: string, durationSeconds: number) {
    this.chatDuration.labels(agent, status, model).observe(durationSeconds);
  }
}
```

### Anti-Patterns to Avoid
- **Hand-rolling retry logic:** Use existing `withRetry()` from common utils
- **Creating new Redis connections:** Use `CacheService` or `RedisLockService`
- **Inline circuit breaker:** Use `getCircuitBreaker()` from common utils
- **Multiple tool implementations for same capability:** Consolidate to one
- **Metrics in Redis only:** Use Prometheus for proper time-series + alerting
- **Synchronous embedding generation:** Use BullMQ queues for batch processing

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed locking | Custom Redis SETNX | `RedisLockService.withLock()` | Already handles TTL, fencing tokens, retry |
| API retry with backoff | Custom retry loop | `withRetry()` from retry.utils.ts | Handles jitter, circuit breaker, rate limit detection |
| Prisma P2002/P2034 | Custom error catching | `PrismaRetryService.withRetry()` | Handles all retryable Prisma errors |
| Provider circuit breaker | Custom failure counter | `getCircuitBreaker('mistral', 'chat')` | CLOSED/OPEN/HALF_OPEN states, reset timeout |
| Rate limiting | Custom token bucket | `RateLimiter` class or Redis-based | Already has sliding window, wait-if-needed |
| Caching with TTL | Custom Map with setTimeout | `CacheService.set(key, val, { ttl })` | Handles connection, serialization, namespacing |

**Key insight:** The codebase already has industrial-grade infrastructure. The audit should verify these are being used consistently across all AI services, not bypassed with inline implementations.

## Common Pitfalls

### Pitfall 1: Tool Duplication Across Modules
**What goes wrong:** Same capability implemented in multiple files with slight variations
**Why it happens:** Different developers add tools without checking existing implementations
**How to avoid:**
- All tools MUST live in `backend/src/modules/ai/voltagent/tools/`
- TOOLS.md inventory documents all capabilities
- Code review rejects new tools that duplicate existing ones
**Warning signs:** `grep -r "createTool\|createEmailTools" backend/src` returns >1 location per capability

### Pitfall 2: Memory Corruption Under Concurrent Load
**What goes wrong:** VoltAgent memory operations race, losing conversation context
**Why it happens:** Multiple requests for same user processed simultaneously without locking
**How to avoid:** Use `RedisLockService.withLock()` for memory operations per user
**Warning signs:** Lost messages in conversation threads, context window issues

### Pitfall 3: LLM Timeout Cascade
**What goes wrong:** One slow LLM request blocks all requests, system appears hung
**Why it happens:** No timeout on LLM calls, or timeout but no graceful fallback
**How to avoid:**
- 60-second timeout per LLM request (already in decisions)
- Circuit breaker opens after 3 consecutive failures
- Return graceful fallback message, don't throw
**Warning signs:** Chat responses hang indefinitely, all users affected by one slow request

### Pitfall 4: RAG Latency Spikes from Unindexed Queries
**What goes wrong:** pgvector similarity search takes >1000ms instead of <100ms target
**Why it happens:** Missing HNSW index, querying wrong columns, no embedding cache
**How to avoid:**
- Verify HNSW index exists on embedding vector column
- Use `QueryEmbeddingCacheService` (already implemented)
- Profile with EXPLAIN ANALYZE on vector queries
**Warning signs:** RAG latency >500ms in logs, high CPU during embedding search

### Pitfall 5: Metrics Not Exported to Prometheus
**What goes wrong:** Redis-only metrics can't be queried by Grafana, no alerting possible
**Why it happens:** Current AgentMetricsService writes to Redis, not Prometheus format
**How to avoid:** Add `@willsoto/nestjs-prometheus` module, export histogram metrics
**Warning signs:** No `/metrics` endpoint, Grafana dashboards show "No data"

## Code Examples

Verified patterns from existing codebase:

### Tool Registration with Auto-Discovery (Current Pattern)
```typescript
// Source: backend/src/modules/ai/voltagent/agents/unified.agent.ts
import { createEmailTools } from '../tools/email.tools';
import { createCalendarTools } from '../tools/calendar.tools';
// ... other tool imports

function buildToolsForIntent(intent: TaskIntent, options: UnifiedAgentOptions): Tool[] {
  const groups = getToolGroupsForIntent(intent, serviceFlags);
  const toolsMap = new Map<string, Tool>();

  for (const group of groups) {
    const tools = createToolsForGroup(group, options);
    for (const tool of tools) {
      // Deduplicate by tool name
      if (!toolsMap.has(tool.name)) {
        toolsMap.set(tool.name, tool);
      }
    }
  }

  return Array.from(toolsMap.values());
}
```

### Circuit Breaker with Retry (Common Utils)
```typescript
// Source: backend/src/common/utils/retry.utils.ts
import { withRetry, getCircuitBreaker } from '../common/utils/retry.utils';

const result = await withRetry(
  () => mistralClient.chat(messages),
  {
    maxRetries: 3,
    provider: 'mistral',
    operationName: 'chat',
  }
);
```

### Redis Lock for Concurrent Safety
```typescript
// Source: backend/src/modules/ai/voltagent/voltagent.service.ts (line ~574)
const memoryLockKey = `memory:user:${options.tenantId}:${options.userId}`;

if (this.redisLockService) {
  this.redisLockService.tryWithLock(
    memoryLockKey,
    10000, // 10s TTL
    async () => {
      await this.memoryIntelligenceService!.processMemoryFromMessage(
        options.tenantId,
        options.userId,
        conversationPair,
      );
    },
    { maxRetries: 2, baseDelayMs: 50 },
  ).catch(err => {
    this.logger.warn(`Memory extraction failed: ${err.message}`);
  });
}
```

### Prometheus Histogram for Latency
```typescript
// Source: prom-client docs + NestJS integration pattern
import { Histogram } from 'prom-client';

// Define in metrics provider
const aiChatHistogram = new Histogram({
  name: 'ai_chat_duration_seconds',
  help: 'AI chat response latency in seconds',
  labelNames: ['agent', 'model', 'status'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
});

// Usage in service
const end = aiChatHistogram.startTimer({ agent: 'UnifiedAgent', model });
try {
  const result = await agent.generateText(message, options);
  end({ status: 'success' });
  return result;
} catch (error) {
  end({ status: 'error' });
  throw error;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multi-agent routing (10 agents) | Single UnifiedAgent with dynamic tools | Jan 2026 | 5x faster startup, 60% token reduction |
| Full tool loading per request | Intent-based tool groups | Jan 2026 | Better tool selection accuracy |
| In-memory metrics only | Redis-buffered metrics | Jan 2026 | Multi-instance support |
| Polling-based chat | Vercel AI SDK streaming | Planned v3.0 | <500ms first token target |
| OpenAI only | Multi-provider abstraction | 2025 trend | Cost optimization, fallback |

**Deprecated/outdated:**
- **ModelRouterService:** Removed - VoltAgent 2.x handles model routing natively
- **Semantic cache:** Disabled due to cross-tenant security issues
- **Multiple specialized agents:** Consolidated to UnifiedAgent + SupervisorAgent

## Open Questions

Things that couldn't be fully resolved:

1. **VoltAgent Runtime Agent Spawning**
   - What we know: User decided to implement if officially supported
   - What's unclear: Cannot access live VoltAgent docs (404) to verify support
   - Recommendation: Check @voltagent/core package exports during audit, look for `spawnAgent` or similar

2. **Optimal pgvector Index Configuration**
   - What we know: HNSW index exists for embeddings
   - What's unclear: Current index parameters (m, ef_construction, ef_search)
   - Recommendation: Run `SELECT * FROM pg_indexes WHERE tablename = 'Embedding'` and tune if latency >100ms

3. **Connection Pool Sizing for 100+ Concurrent Users**
   - What we know: Prisma, Redis, LLM all need pooling review
   - What's unclear: Current pool sizes vs optimal for target load
   - Recommendation: Load test before/after with custom TypeScript scripts, measure at 10/50/100 concurrent

## Sources

### Primary (HIGH confidence)
- VoltAgent GitHub README: https://github.com/VoltAgent/voltagent - Architecture, Agent creation, Memory
- Existing codebase `backend/src/common/` - Circuit breaker, retry, Redis lock implementations
- Existing codebase `backend/src/modules/ai/voltagent/` - Current VoltAgent integration patterns

### Secondary (MEDIUM confidence)
- Vercel AI SDK docs (sdk.vercel.ai) - Streaming patterns, NestJS integration
- @willsoto/nestjs-prometheus GitHub - Metrics integration patterns
- prom-client npm docs - Histogram configuration, buckets

### Tertiary (LOW confidence - validate)
- Multi-provider orchestration patterns (dev.to 2026) - Factory pattern recommendations
- pgvector optimization guides - HNSW parameter tuning (needs verification with benchmarks)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on existing codebase + official VoltAgent docs
- Architecture: HIGH - Patterns extracted from working code
- Pitfalls: MEDIUM - Based on code review + common issues, needs production validation

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - infrastructure patterns stable)
