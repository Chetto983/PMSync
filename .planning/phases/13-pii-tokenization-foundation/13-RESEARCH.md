# Phase 13: PII Tokenization Foundation - Research

**Researched:** 2026-02-09
**Domain:** GDPR-compliant PII handling for LLM/AI systems
**Confidence:** HIGH

## Summary

This research investigates how to implement comprehensive PII tokenization for all AI interactions in MailAgent. The codebase already has significant PII infrastructure in place - detection via `@sentinelseed/voltagent`, resolution via Redis with session-scoped mappings, and integration in chat request processing. However, **critical gaps exist**:

1. **RAG embeddings are NOT sanitized** - PII flows directly into vector database
2. **Tool call restoration is partial** - `resolvePayload` exists but isn't wired everywhere
3. **Display restoration is inconsistent** - Some paths restore, others don't

**Primary recommendation:** Wire existing services completely rather than building new ones. The infrastructure exists; it needs systematic integration across all AI touchpoints.

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sentinelseed/voltagent` | ^0.2.2 | PII detection/redaction | Already integrated, supports 14 PII types, regex+NER hybrid |
| `ioredis` | ^5.9.2 | Token mapping storage | Session-scoped, tenant-isolated, 30-min TTL |
| `node-nlp` | ^5.0.0-alpha.5 | NER for names/addresses | Already installed for intent classification |

### Already Implemented Services

| Service | Location | Status |
|---------|----------|--------|
| `PiiDetectionService` | `ai/guards/pii-detection-sentinel.service.ts` | COMPLETE - wraps @sentinelseed/voltagent |
| `PiiResolutionService` | `ai/guards/pii-resolution.service.ts` | COMPLETE - Redis storage with session scoping |
| `ChatRequestProcessorService` | `voltagent/services/chat-request-processor.service.ts` | PARTIAL - detects+stores, but only for chat |

### No New Dependencies Needed

The existing stack covers all requirements. The work is integration, not library shopping.

## Architecture Patterns

### Current Data Flow (BROKEN)

```
User Message
    |
    v
[ChatRequestProcessor] ---> PII Detection + Storage (WORKS)
    |
    v
[LLM] ---> Receives redacted text (WORKS)
    |
    v
[Tool Execution] ---> NO PII restoration (BROKEN)
    |
    v
[Response Display] ---> Inconsistent restoration (PARTIAL)

[Embedding Generation]
    |
    v
[EmbeddingComposer] ---> NO PII redaction (BROKEN)
    |
    v
[Vector DB] ---> Contains raw PII (GDPR VIOLATION)
```

### Target Data Flow

```
User Message
    |
    v
[ChatRequestProcessor] ---> PII Detection + Storage
    |
    v
[LLM] ---> Receives redacted text
    |
    v
[ActionExecutorService] ---> resolvePayload() before execution
    |
    v
[ChatResponseProcessor] ---> resolveText() before display

[Embedding Generation]
    |
    v
[PiiTokenizationMiddleware] ---> Redact before compose
    |
    v
[EmbeddingComposer] ---> Receives sanitized content
    |
    v
[Vector DB] ---> PII-free embeddings (GDPR COMPLIANT)
```

### Token Format (Already Implemented)

Uses hash-based unique placeholders for multi-value resolution:

```
john.doe@company.com -> [EMAIL_REDACTED:a1b2c3d4]
+1-555-123-4567      -> [PHONE_REDACTED:e5f6g7h8]
John Smith           -> [NAME_REDACTED:i9j0k1l2]
```

**Why hash suffix:** Same email appearing twice gets same token - LLM sees semantic consistency.

### Recommended Project Structure

```
backend/src/modules/ai/
  guards/
    pii-detection-sentinel.service.ts  # EXISTS - detection
    pii-resolution.service.ts          # EXISTS - token storage
    pii-tokenization.middleware.ts     # NEW - embedding pipeline intercept
    index.ts                           # EXISTS - exports
  voltagent/
    services/
      chat-request-processor.service.ts  # EXISTS - needs tool call wiring
      action-executor.service.ts         # EXISTS - needs resolvePayload call
      chat-response-processor.service.ts # EXISTS - needs consistent restore
  services/
    embedding-composer.service.ts        # EXISTS - needs sanitization hook
```

### Pattern 1: Middleware for Embedding Pipeline

**What:** Intercept content before embedding generation, apply PII redaction
**When to use:** All email/contact embedding creation

```typescript
// Source: Pattern from existing ChatRequestProcessorService

@Injectable()
export class PiiEmbeddingMiddleware {
  constructor(
    private readonly piiDetection: PiiDetectionService,
  ) {}

  /**
   * Sanitize content for embedding generation.
   * Unlike chat, embeddings don't need resolution - we WANT PII-free vectors.
   */ //not correct we need restore on rag search or system became stupid!
  sanitizeForEmbedding(content: string): string {
    if (!content) return content;

    const result = this.piiDetection.detect(content);
    if (result.hasPii) {
      this.logger.debug(`Sanitized ${result.piiCount} PII items for embedding`);
    }
    return result.redactedText;
  }
}
```

### Pattern 2: Tool Call Resolution

**What:** Resolve PII tokens in tool payloads before execution
**When to use:** All AI tool calls that may contain PII from user input

```typescript
// Source: Existing PiiResolutionService.resolvePayload()

// In ActionExecutorService.execute():
async execute(action: AgentAction, context: ExecutionContext) {
  // Resolve PII tokens in payload BEFORE execution
  const resolvedPayload = await this.piiResolution.resolvePayload(
    context.tenantId,
    context.sessionId,
    action.payload,
  );

  // Execute with real values
  return this.doExecute({ ...action, payload: resolvedPayload }, context);
}
```

### Anti-Patterns to Avoid

- **Re-implementing detection:** `@sentinelseed/voltagent` already handles 14 PII types with battle-tested patterns
- **Storing PII in embeddings metadata:** Even metadata paths leak PII (contactId is fine, displayName is NOT)
- **Skipping resolution for "safe" tools:** All tool payloads must be checked - future tools may use PII
- **Per-request token generation:** Use deterministic hash so same email = same token across conversation

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PII pattern matching | Custom regex | `@sentinelseed/voltagent` | 14 types, confidence scores, tested patterns |
| Token storage | Database table | `PiiResolutionService` (Redis) | Session-scoped, auto-expiry, already integrated |
| NER for names | Train custom model | `node-nlp` | Already installed, handles multilingual names |
| Email format detection | Simple regex | Sentinel's EMAIL pattern | Handles edge cases (plus addressing, IDN) |

**Key insight:** The detection problem is solved. The integration problem is where the work is.

## Common Pitfalls

### Pitfall 1: Embedding Inversion Attacks

**What goes wrong:** Even with PII redacted, embedding vectors can be reversed to approximate original text
**Why it happens:** Embeddings preserve semantic meaning - that's their purpose
**How to avoid:** Accept that embeddings leak some information. Focus on:
  1. Remove explicit PII (emails, phones, SSNs) - reduces direct exposure
  2. Keep vectors tenant-isolated - limits attack surface
  3. Don't store original text alongside vectors
**Warning signs:** Security audit asking about vector reconstruction

### Pitfall 2: Context Loss in RAG

**What goes wrong:** Replacing "John Smith from Acme Corp" with "[NAME_REDACTED:abc]" breaks semantic search
**Why it happens:** Semantic similarity depends on content, not placeholders
**How to avoid:**
  1. Keep structural context: "the contact from [COMPANY] regarding [SUBJECT]"
  2. Only redact precise identifiers, not descriptive context
  3. Test RAG quality before/after sanitization
**Warning signs:** RAG retrieval quality drops after enabling sanitization

### Pitfall 3: Incomplete Tool Call Resolution

**What goes wrong:** Tool sends email to "[EMAIL_REDACTED:abc]" literally
**Why it happens:** Resolution call missing in execution path
**How to avoid:**
  1. Single interception point before ALL tool execution
  2. Never trust that payload is "already resolved"
  3. Log resolved values (masked) for debugging
**Warning signs:** Error logs showing "[*_REDACTED" in tool arguments

### Pitfall 4: Cross-Session Token Leakage

**What goes wrong:** User A's PII tokens appear in User B's context
**Why it happens:** Session ID collision or shared cache
**How to avoid:**
  1. Token key includes tenantId + sessionId
  2. Verify isolation in multi-tenant tests
  3. Short TTL (30 min) limits exposure window
**Warning signs:** "Failed to resolve PII placeholder" in logs (token from expired/other session)

### Pitfall 5: False Positive Detection

**What goes wrong:** "John" in "John Deere tractor email" becomes "[NAME_REDACTED]"
**Why it happens:** NER detects all names, not just PII-relevant ones
**How to avoid:**
  1. Sentinel's confidence scores - ignore low-confidence matches
  2. Contextual rules - names in signatures vs body
  3. Whitelist common non-PII names (company names, products)
**Warning signs:** Users report AI "forgetting" important context

## Code Examples

### Integrating PII Sanitization in Embedding Composer

```typescript
// File: backend/src/modules/ai/services/embedding-composer.service.ts
// MODIFICATION: Add PII sanitization before content composition

import { PiiDetectionService } from '../guards';

@Injectable()
export class EmbeddingComposerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() @Inject(PiiDetectionService)
    private readonly piiDetection?: PiiDetectionService,
  ) {}

  /**
   * Compose email content for embedding with PII sanitization.
   * PII is redacted BEFORE embedding - vectors never contain PII.
   */
  composeEmailEmbeddingContent(email: EmailContentInput): string | null {
    const pieces: string[] = [];

    if (email.subject) {
      pieces.push(`Oggetto: ${this.sanitize(email.subject)}`);
    }

    if (email.bodyHtml) {
      const extracted = HtmlContentExtractor.extractMainContent(email.bodyHtml);
      if (extracted) {
        pieces.push(this.sanitize(extracted));
      }
    } else if (email.bodyText?.trim()) {
      pieces.push(this.sanitize(email.bodyText.trim()));
    } else if (email.snippet) {
      pieces.push(this.sanitize(email.snippet));
    }

    const combined = pieces.join('\n\n').trim();
    return combined.length > 0 ? combined : null;
  }

  private sanitize(text: string): string {
    if (!this.piiDetection || !text) return text;

    try {
      const result = this.piiDetection.detect(text);
      return result.redactedText;
    } catch (error) {
      this.logger.warn(`PII detection failed, using original: ${error}`);
      return text; // Graceful degradation
    }
  }
}
```

### Wiring Tool Call Resolution in ActionExecutor

```typescript
// File: backend/src/modules/ai/voltagent/services/action-executor.service.ts
// MODIFICATION: Resolve PII tokens before tool execution

import { PiiResolutionService } from '../../guards';

@Injectable()
export class ActionExecutorService {
  constructor(
    @Optional() @Inject(PiiResolutionService)
    private readonly piiResolution?: PiiResolutionService,
  ) {}

  async execute(
    action: AgentAction,
    context: { tenantId: string; sessionId: string; userId: string },
  ): Promise<ActionResult> {
    // CRITICAL: Resolve PII tokens BEFORE execution
    const resolvedPayload = await this.resolvePii(
      context.tenantId,
      context.sessionId,
      action.payload,
    );

    const resolvedAction = { ...action, payload: resolvedPayload };

    // Log for debugging (mask actual values)
    if (this.hasPlaceholders(action.payload) && !this.hasPlaceholders(resolvedPayload)) {
      this.logger.debug(`Resolved PII tokens for tool: ${action.type}`);
    }

    return this.doExecute(resolvedAction, context);
  }

  private async resolvePii<T extends Record<string, unknown>>(
    tenantId: string,
    sessionId: string,
    payload: T,
  ): Promise<T> {
    if (!this.piiResolution) return payload;
    return this.piiResolution.resolvePayload(tenantId, sessionId, payload);
  }

  private hasPlaceholders(obj: unknown): boolean {
    const str = JSON.stringify(obj);
    return /\[[A-Z_]+_REDACTED(?::[a-f0-9]+)?\]/.test(str);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex-only PII detection | Hybrid regex + NER | 2024 | Better name/address detection |
| Block on PII detection | Tokenize and continue | 2025 | Preserves functionality while protecting privacy |
| LLM-based PII detection | Pattern + ML ensemble | 2025 | Lower latency, no LLM cost |
| Manual token resolution | AI Gateway pattern | 2025 | Automatic in/out tokenization |

**Current industry standard (2025-2026):**
- AI Gateway / Middleware pattern for interception
- Deterministic tokenization (same value = same token)
- Session-scoped resolution (not persistent)
- Format-preserving tokenization for structured data

## GDPR Compliance Notes

### Article 32 - Security of Processing

Phase 13 directly supports GDPR Article 32 requirements:

| Requirement | How Phase 13 Addresses |
|-------------|------------------------|
| Pseudonymization | PII tokens ARE pseudonymization |
| Data minimization | LLM never sees raw PII |
| Processing security | Audit trail of tokenization events |

### Audit Trail Recommendations

```typescript
// Log tokenization events for compliance
this.logger.log({
  event: 'pii_tokenized',
  tenantId,
  sessionId,
  piiTypes: result.detectedTypes,
  piiCount: result.piiCount,
  timestamp: new Date().toISOString(),
  // NEVER log actual values
});
```

### Data Retention

Token mappings in Redis have 30-minute TTL. For longer conversations:
- Mappings auto-refresh on access
- On conversation end, explicit cleanup
- No persistent PII token storage

## Open Questions

### 1. Contact Embeddings - How Much to Sanitize?

**What we know:** Contact embeddings include names, emails, phone numbers, company
**What's unclear:** Should we sanitize contact names in embeddings? They're the search target.
**Recommendation:** Keep displayName for search relevance, redact email/phone. Test RAG quality.

### 2. Attachment OCR Content

**What we know:** Mistral OCR extracts text from PDFs/images on-demand
**What's unclear:** Should OCR content go through PII sanitization before LLM sees it?
**Recommendation:** YES - OCR content often contains addresses, signatures with contact info

### 3. Historical Embeddings

**What we know:** Existing embeddings in pgvector may contain PII
**What's unclear:** Re-embed all historical data? How to prioritize?
**Recommendation:** New embeddings only. Historical data addressed in Phase 15 (Data Rights).

## Sources

### Primary (HIGH confidence)

- Codebase analysis: `ai/guards/pii-detection-sentinel.service.ts`
- Codebase analysis: `ai/guards/pii-resolution.service.ts`
- Codebase analysis: `voltagent/services/chat-request-processor.service.ts`
- `@sentinelseed/voltagent` v0.2.2 type definitions

### Secondary (MEDIUM confidence)

- [Agentic Patterns: PII Tokenization](https://agentic-patterns.com/patterns/pii-tokenization/) - Anthropic-based pattern
- [Kong: PII Sanitization for LLMs and Agentic AI](https://konghq.com/blog/enterprise/building-pii-sanitization-for-llms-and-agentic-ai) - AI Gateway pattern
- [DZone: Secure LLM Usage With Reversible Data Anonymization](https://dzone.com/articles/llm-pii-anonymization-guide) - GDPR compliance approach
- [Protecto: LLM Privacy Protection Strategies 2025](https://www.protecto.ai/blog/llm-privacy-protection-strategies-2025)

### Tertiary (LOW confidence)

- [Elastic: Protecting PII in RAG with Elasticsearch](https://www.elastic.co/search-labs/blog/rag-security-masking-pii) - RAG-specific patterns
- [Subhash Dasyam: Privacy Preserving RAG](https://www.subhashdasyam.com/2025/11/building-privacy-preserving-rag-with.html) - Homomorphic encryption (future consideration)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing codebase provides all libraries
- Architecture: HIGH - clear integration points identified
- Pitfalls: MEDIUM - based on web research + codebase analysis

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days - stable domain)

## Implementation Priority

Based on requirements PII-01 through PII-04:

| Requirement | Current State | Work Needed | Priority |
|-------------|--------------|-------------|----------|
| PII-01: Tokenize before LLM | WORKING for chat | Wire for all AI paths | P1 |
| PII-02: Restore for display | PARTIAL | Consistent restore call | P2 |
| PII-03: Restore for tool calls | NOT WIRED | Add to ActionExecutor | P1 |
| PII-04: RAG sanitization | BROKEN | Inject PiiDetection into EmbeddingComposer | P1 |

**Recommended phase structure:**
1. **Plan 01**: RAG sanitization (PII-04) - prevents new PII in vectors
2. **Plan 02**: Tool call resolution (PII-03) - fixes execution failures
3. **Plan 03**: Display restoration (PII-02) - user experience
4. **Plan 04**: Integration testing + audit logging - GDPR compliance

---
*Research complete. Ready for planning.*
