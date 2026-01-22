# VoltAgentService Refactoring Plan

## Current State

| Metric | Current | Target |
|--------|---------|--------|
| File lines | 2302 | <500 per file |
| `chat()` method | ~490 lines | ~50 lines |
| `streamChat()` method | ~316 lines | ~80 lines |
| Code duplication | HIGH | ZERO |

## Problems

1. **Massive file (2302 lines)** - Violates <500 line guideline
2. **Duplicate code** - `chat()` and `streamChat()` repeat:
   - PII detection/redaction (lines 918-938, 1391-1414)
   - Rate limit checks (lines 939-955, 1416-1427)
   - Model routing (lines 971-993, 1436-1448)
   - Context injection (lines 1030-1138, 1463-1580)
   - HITL extraction (lines 1264-1319)
3. **Mixed responsibilities** - One class handles:
   - Request validation
   - Context building
   - Agent execution
   - Response processing
   - Memory persistence
   - Metrics collection
   - Job queuing
   - Conversation management

## Refactoring Strategy

Extract into 4 focused services following Single Responsibility Principle:

### 1. ChatRequestProcessor (NEW)

**File**: `voltagent/services/chat-request-processor.service.ts`
**Lines**: ~200

**Responsibilities**:
- Input validation (prompt guard)
- PII detection and redaction
- Rate limit checking
- Model routing
- PII mapping storage

**Interface**:
```typescript
interface ProcessedRequest {
  processedMessage: string;
  selectedModel: MistralModel;
  suggestedAgent: AgentType;
  piiSessionId: string;
  hasPii: boolean;
}

class ChatRequestProcessorService {
  async process(
    message: string,
    options: ChatOptions
  ): Promise<ProcessedRequest>;

  validateInput(message: string): ValidationResult;
  detectAndRedactPii(message: string, sessionId: string): PiiResult;
  checkRateLimit(tenantId: string, tokens: number): Promise<RateLimitResult>;
  routeModel(message: string, options: RoutingOptions): RoutingResult;
}
```

### 2. ChatContextBuilder (NEW)

**File**: `voltagent/services/chat-context-builder.service.ts`
**Lines**: ~250

**Responsibilities**:
- Episodic memory injection
- Long-term memory injection
- Conversation history injection
- Conversation compaction
- Context sanitization

**Interface**:
```typescript
interface EnhancedContext {
  enhancedMessage: string;
  contextTruncated: boolean;
  conversationEnsured: boolean;
}

class ChatContextBuilderService {
  async build(
    message: string,
    options: ContextOptions
  ): Promise<EnhancedContext>;

  injectEpisodicLessons(message: string, options: EpisodicOptions): Promise<string>;
  injectLongTermMemory(message: string, options: MemoryOptions): Promise<string>;
  injectConversationHistory(message: string, options: HistoryOptions): Promise<string>;
}
```

### 3. ChatResponseProcessor (NEW)

**File**: `voltagent/services/chat-response-processor.service.ts`
**Lines**: ~200

**Responsibilities**:
- HITL action extraction from result.steps
- Response sanitization
- PII rehydration
- Memory persistence (user + assistant messages)
- Pending action creation

**Interface**:
```typescript
interface ProcessedResponse {
  text: string;
  pendingActions: PendingAction[];
  requiresApproval: boolean;
}

class ChatResponseProcessorService {
  async process(
    result: AgentResult,
    options: ResponseOptions
  ): Promise<ProcessedResponse>;

  extractPendingActions(steps: Step[], options: HitlOptions): Promise<PendingAction[]>;
  sanitizeResponse(text: string): string;
  rehydratePii(text: string, mappings: PiiMapping[]): string;
  persistMessages(userMsg: string, assistantMsg: string, options: PersistOptions): Promise<void>;
}
```

### 4. VoltAgentService (REFACTORED)

**File**: `voltagent/voltagent.service.ts`
**Lines**: ~450

**Remains**:
- Agent lifecycle management (getOrCreateAgent, evictLRU)
- Conversation management (list, get, update, delete)
- Job queuing (queueBackgroundJob, queueBulkJobs)
- Approval workflow (submitActionForApproval, resumeApproval)
- Metrics collection

**Simplified `chat()` method**:
```typescript
async chat(message: string, options: ChatOptions): Promise<ChatResult> {
  // 1. Process request (~10 lines)
  const processed = await this.requestProcessor.process(message, options);

  // 2. Build context (~10 lines)
  const context = await this.contextBuilder.build(
    processed.processedMessage,
    { tenantId: options.tenantId, userId: options.userId, sessionId }
  );

  // 3. Execute agent (~10 lines)
  const agent = this.getOrCreateAgent(/*...*/);
  const result = await agent.generateText(context.enhancedMessage, {/*...*/});

  // 4. Process response (~10 lines)
  const response = await this.responseProcessor.process(result, {
    tenantId: options.tenantId,
    sessionId,
    piiMappings: processed.piiMappings
  });

  return {
    text: response.text,
    pendingActions: response.pendingActions,
    requiresApproval: response.requiresApproval,
    conversationId: sessionId,
  };
}
```

## File Structure After Refactoring

```
voltagent/
├── voltagent.service.ts           (~450 lines - orchestration)
├── services/
│   ├── chat-request-processor.service.ts   (~200 lines)
│   ├── chat-context-builder.service.ts     (~250 lines)
│   ├── chat-response-processor.service.ts  (~200 lines)
│   ├── hitl.service.ts                     (existing)
│   ├── model-router.service.ts             (existing)
│   ├── episodic-memory.service.ts          (existing)
│   └── ...
```

## Migration Steps

1. **Create ChatRequestProcessor** - Extract PII, rate limit, routing logic
2. **Create ChatContextBuilder** - Extract context injection logic
3. **Create ChatResponseProcessor** - Extract HITL extraction, sanitization
4. **Update VoltAgentService** - Inject new services, simplify chat/streamChat
5. **Update VoltAgent Module** - Register new providers
6. **Test** - Run bruteforce tests to verify HITL still works

## Benefits

| Before | After |
|--------|-------|
| 2302 lines in 1 file | ~1100 lines across 4 files |
| ~800 duplicate lines | 0 duplicate lines |
| Hard to test | Each service testable in isolation |
| Hard to modify | Single responsibility per service |
| 1 massive class | 4 focused classes |

## Timeline

1. **Phase 1**: Create ChatRequestProcessor (no behavior change)
2. **Phase 2**: Create ChatContextBuilder (no behavior change)
3. **Phase 3**: Create ChatResponseProcessor (no behavior change)
4. **Phase 4**: Refactor VoltAgentService to use new services
5. **Phase 5**: Verify with bruteforce tests
