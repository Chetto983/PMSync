# Stack Research: v3.0 AI Intelligence

**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

**NO major stack additions required.** Existing stack (VoltAgent 2.2.1, AI SDK 6.0.58, Mistral AI) is production-ready. Primary work: refactor VoltAgent integration, fix chat bugs, implement auto-triage with existing capabilities. Add BullMQ rate limiting for concurrent AI requests.

**Key Finding:** Stack is solid. Bugs are integration/architecture issues, not missing libraries.

---

## Recommendations Summary

### Stack Changes

| Component | Current | v3.0 | Action |
|-----------|---------|------|--------|
| VoltAgent Core | 2.2.1 | 2.2.1 | ✅ Keep - refactor usage |
| AI SDK | 6.0.58 | 6.0.58 | ✅ Keep - already optimal |
| Mistral SDK | 1.13.0 | Latest | ⚠️ Update |
| BullMQ | 5.67.1 | 5.67.1+ | ✅ Keep - add AI queue |
| @nestjs/throttler | 6.5.0 | 6.5.0 | ✅ Keep - configure |

**NEW DEPENDENCIES:** NONE ✅

---

## VoltAgent Analysis

### Current Implementation Gaps

**CRITICAL BUGS:**

1. **Chat Streaming:**
   - ✅ Using AI SDK v6 protocol
   - ⚠️ Frontend uses custom parsing (bug source)
   - ⚠️ No exponential backoff for 429 errors

2. **Agent Pool:**
   - ✅ Redis-backed caching
   - ⚠️ Always recreates agents (could optimize)

3. **Memory:**
   - ✅ PostgreSQL adapter
   - ⚠️ Extraction gating may miss facts

4. **Tools:**
   - ⚠️ No runtime agent spawning

### Official Patterns (Verified)

- Supervisor-coordinator with sub-agents
- PostgreSQL memory adapter
- `toUIMessageStream()` for AI SDK v6
- VoltOps Console for observability

### Runtime Agent Spawning

**Support:** YES (delegate_task pattern)
**Current:** NO - all pre-configured

**v3.0 Recommendation:** Use delegate_task for auto-triage sub-agents

---

## Vercel AI SDK

### Current Setup

- Frontend: `ai@6.0.58`, `@ai-sdk/react@3.0.52`
- Backend: `ai@6.0.49`
- Architecture: NestJS → VoltAgent → AI SDK

**Verdict:** Correct choice. Keep existing integration.

### Comparison

| Feature | Vercel AI SDK | Alternatives |
|---------|---------------|--------------|
| TypeScript-first | ✅ Native | ⚠️ Wrapper/Proxy |
| Streaming UI | ✅ useChat | ❌ Manual |
| Next.js | ✅ First-class | ⚠️ Custom |
| HITL (v6) | ✅ Native | ❌ Manual |
| Scale | 20M+ DL | Varies |

---

## Auto-Triage Stack

### Approach

**Use existing libraries:**
- Mistral for LLM classification
- chrono-node for deadline extraction
- sentiment for tone analysis
- BullMQ for background queue

**NEW SERVICE:** `AutoTriageService`

```typescript
interface EmailPriorityScore {
  emailId: string;
  score: number; // 0-100
  category: 'high' | 'medium' | 'low' | 'spam';
  reasons: string[];
  actionSuggestion?: 'reply' | 'archive' | 'snooze';
  suggestedLabels?: string[];
}
```

**Integration:**
- Score on email arrival
- Auto-label by priority
- Priority Inbox widget
- Smart notifications

**NEW DEPENDENCIES:** NONE ✅

---

## Scalability Patterns

### Current Bottlenecks

1. No request queuing
2. No 429 backoff
3. No concurrent limiting
4. No circuit breaker

### Solutions (All using existing libraries)

**1. Rate Limiter** - Configure @nestjs/throttler
**2. Queue** - Add BullMQ AI request queue
**3. Circuit Breaker** - NEW pattern in MistralService
**4. Retry Logic** - Exponential backoff wrapper

### Targets

| Metric | Current | v3.0 |
|--------|---------|------|
| Concurrent calls | Unlimited | 5 |
| Rate limit handling | None | Backoff |
| Circuit breaker | None | 5 failures |
| Bulk queue | None | BullMQ |

---

## Nested Labels

**Recommendation:** JSONB tree structure (v3.0 MVP)

```sql
ALTER TABLE "Email" ADD COLUMN "labels_tree" JSONB DEFAULT '[]';
```

**Example:**
```json
["Work", "Work/Clients", "Work/Clients/Urgent"]
```

**Pros:**
- Use existing PostgreSQL
- Fast JSONB queries
- No schema risk

Migrate to adjacency list in v3.1 if needed.

---

## Architecture Changes Required

### HIGH PRIORITY (Bug Fixes)

1. Chat: Remove parsing, use SDK metadata
2. VoltAgent: Implement delegate_task spawning
3. Rate Limiting: Add BullMQ + throttler + circuit breaker

### MEDIUM PRIORITY (Features)

4. Auto-Triage: Create service + prompts
5. Nested Labels: Add JSONB column + UI

---

## Sources

### VoltAgent
- [Official Docs](https://voltagent.dev/docs/)
- [GitHub](https://github.com/VoltAgent/voltagent)
- [Blog: Best Practices](https://www.blog.brightcoding.dev/2025/04/30/voltagent-open-source-typescript-ai-agent-framework/)

### AI SDK
- [Introduction](https://ai-sdk.dev/docs/introduction)
- [v6 Release](https://vercel.com/blog/ai-sdk-6)
- [Alternatives](https://stackshare.io/vercel-ai-sdk/alternatives)

### Auto-Triage
- [AI Email Triage 2025](https://hiverhq.com/blog/ai-email-triage)
- [Inbox Agents](https://virtualworkforce.ai/inbox-agents-for-outlook/)

### Rate Limiting
- [API Rate Limits 2025](https://orq.ai/blog/api-rate-limit)
- [LLM Gateway](https://www.truefoundry.com/blog/rate-limiting-in-llm-gateway)
- [OpenAI Limits](https://platform.openai.com/docs/guides/rate-limits)
