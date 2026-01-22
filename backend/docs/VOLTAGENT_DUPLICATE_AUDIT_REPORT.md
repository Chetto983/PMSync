# VoltAgent Module - Duplicate & Dead Code Audit Report

**Generated:** 2026-01-22
**Scope:** `d:\MailAgent\backend\src\modules\ai\voltagent\`
**Status:** ANALYSIS ONLY - No edits made

---

## Summary

| Category | Count |
|----------|-------|
| Duplicate Functions | 6 |
| Duplicate Code Patterns | 5 |
| Dead Code | 2 |
| Redundant Wrappers | 2 |
| Unused Imports/Parameters | 3 |

---

## 1. Duplicate Functions

### 1.1 `sanitizeLlmResponse` vs `sanitizeMessageContent`

**Files:**
- `services/chat-context-builder.service.ts` (lines 23-36) - `sanitizeLlmResponse`
- `services/conversation-management.service.ts` (lines 17-40) - `sanitizeMessageContent`

**Issue:** Nearly identical functions that strip internal context markers from LLM responses.

**Comparison:**
```typescript
// chat-context-builder.service.ts (exported)
export function sanitizeLlmResponse(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[Conversation History\][\s\S]*?\[Current Message\]\s*/gi, '')
    .replace(/\[Conversation Summary[^\]]*\]\s*/gi, '')
    .replace(/\[Key Context\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    .replace(/\[Recent Messages\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    .replace(/\[User Memory\][\s\S]*?---\s*/gi, '')
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n## |$)/gi, '')
    .replace(/\[(Conversation History|Current Message|Key Context|Recent Messages|User Memory)\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// conversation-management.service.ts (private)
function sanitizeMessageContent(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[Conversation History\][\s\S]*?\[Current Message\]\s*/gi, '')
    .replace(/\[Conversation Summary[^\]]*\]\s*/gi, '')
    .replace(/\[Key Context\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    .replace(/\[Recent Messages\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    .replace(/\[User Memory\][\s\S]*?---\s*/gi, '')
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n## |\n\n---|\n\n\[|$)/gi, '') // Slightly different regex
    .replace(/\[(Conversation History|Current Message|Key Context|Recent Messages|User Memory)\]/gi, '')
    .replace(/^---\s*$/gm, '') // Additional pattern
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

**Recommended Action:** DELETE `sanitizeMessageContent` from `conversation-management.service.ts` and import `sanitizeLlmResponse` from `chat-context-builder.service.ts`

---

### 1.2 `stripInternalMarkers` in hooks.ts

**File:** `observability/hooks.ts` (lines 107-120)

**Issue:** Third implementation of the same sanitization logic.

```typescript
function stripInternalMarkers(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[Conversation Summary[^\]]*\]/gi, '')
    .replace(/\[(Conversation History|Current Message|Key Context|Recent Messages|User Memory)\]/gi, '')
    .replace(/^##\s*Learned Constraints.*$/gmi, '')
    .replace(/^---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

**Recommended Action:** CONSOLIDATE into a single exported utility function in `chat-context-builder.service.ts` and import where needed.

---

### 1.3 `estimateTokens` Pattern

**Files:**
- `services/model-router.service.ts` (lines 351-361)
- `services/conversation-compaction.service.ts` (lines 242-245)

**Issue:** Similar token estimation logic duplicated.

```typescript
// model-router.service.ts
private estimateTokens(message: string): number {
  const charCount = message.length;
  const wordCount = message.split(/\s+/).length;
  const charBasedEstimate = Math.ceil(charCount / 4);
  const wordBasedEstimate = Math.ceil(wordCount * 1.3);
  return Math.max(charBasedEstimate, wordBasedEstimate);
}

// conversation-compaction.service.ts
private estimateTokens(messages: ConversationMessage[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(totalChars / 4);
}
```

**Recommended Action:** CONSOLIDATE into a shared utility with overloads for single string and array of messages.

---

### 1.4 `extractActionPayload` Duplication

**File:** `voltagent.service.ts` (lines 216-231)

**Issue:** This function exists only in voltagent.service.ts but is used for a common pattern of extracting data from ActionQueue.actionPayload JSON field.

**Recommended Action:** MOVE to `services/hitl.service.ts` as a shared utility since it's related to HITL action processing.

---

### 1.5 `getOrCreateAgent` Duplication

**Files:**
- `voltagent.service.ts` (lines 676-771) - Full implementation
- `services/agent-pool.service.ts` (lines 70-162) - Identical implementation

**Issue:** The exact same agent creation and caching logic exists in both files. `agent-pool.service.ts` was created as a refactored version but `voltagent.service.ts` still has its own copy.

**Comparison:**
- Same `CachedAgent` interface
- Same `AGENT_CACHE_TTL_MS = 5 * 60 * 1000`
- Same `MAX_CACHED_AGENTS = 5`
- Same LRU eviction logic
- Same agent creation switch statement

**Recommended Action:** DELETE the duplicate from `voltagent.service.ts` and inject `AgentPoolService` to use `getOrCreateAgent()`.

---

### 1.6 `evictLeastRecentlyUsedAgent` Duplication

**Files:**
- `voltagent.service.ts` (lines 776-790)
- `services/agent-pool.service.ts` (lines 165-180)

**Issue:** Identical LRU eviction logic.

**Recommended Action:** DELETE from `voltagent.service.ts` when consolidating with `AgentPoolService`.

---

## 2. Duplicate Code Patterns

### 2.1 Locale Instruction Pattern

**Files:**
- `agents/actions.agent.ts` (lines 82-85)
- `agents/intelligence.agent.ts` (lines 88-91)
- `agents/supervisor.agent.ts` (lines 178-181)

**Issue:** Same locale instruction generation pattern repeated in all three agent files.

```typescript
const localeInstruction =
  locale !== 'en'
    ? `\n\n## Response Language\nIMPORTANT: Respond in ${locale === 'it' ? 'Italian (italiano)' : locale}.`
    : '';
```

**Recommended Action:** CONSOLIDATE into a shared utility function in `locales/index.ts`:
```typescript
export function getLocaleInstruction(locale: SupportedLocale): string {
  if (locale === 'en') return '';
  const languageNames: Record<SupportedLocale, string> = {
    en: 'English',
    it: 'Italian (italiano)',
  };
  return `\n\n## Response Language\nIMPORTANT: Respond in ${languageNames[locale]}.`;
}
```

---

### 2.2 Provider Lookup Pattern

**File:** `services/action-executor.service.ts`

**Issue:** Same pattern of finding a provider repeated 8+ times throughout the file.

```typescript
// Repeated pattern (lines 327-334, 788-795, 1467-1476, 1514-1523, 1561-1570, etc.)
let actualProviderId = providerId;
if (!actualProviderId) {
  const provider = await this.prisma.providerConfig.findFirst({
    where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
  });
  if (!provider) {
    throw new AiError('No email provider available', AiErrorCode.PROVIDER_UNAVAILABLE);
  }
  actualProviderId = provider.id;
}
```

**Recommended Action:** EXTRACT into a private method:
```typescript
private async getDefaultProvider(
  tenantId: string,
  type: 'email' | 'calendar' | 'contacts',
): Promise<string> {
  // Implementation
}
```

---

### 2.3 HITL Action Creation Pattern

**Files:**
- `voltagent.service.ts` (lines 1126-1140)
- `services/chat-response-processor.service.ts` (lines 246-259)

**Issue:** Same HITL pending action creation logic duplicated.

**Recommended Action:** USE `ChatResponseProcessorService.extractPendingActions()` exclusively and remove the fallback logic in `voltagent.service.ts`.

---

### 2.4 PII Mapping Resolution

**Files:**
- `voltagent.service.ts` (lines 444-458) - `resolveUserVisibleText`
- `services/chat-response-processor.service.ts` (lines 282-301) - `resolveUserVisibleText`

**Issue:** Same PII resolution logic in two places.

**Recommended Action:** DELETE from `voltagent.service.ts` and use `ChatResponseProcessorService` exclusively.

---

### 2.5 Conversation Ensure Pattern

**File:** `voltagent.service.ts`

**Issue:** `ensureConversationExists` is called in both `chat()` and `streamChat()` with nearly identical logic (lines 947-958 and 1270-1277).

**Recommended Action:** The method exists as `ensureConversationExists()` - ensure consistent usage without duplicating the call pattern.

---

## 3. Redundant Wrappers

### 3.1 `applyPiiMappings` Private Method Wrapper

**File:** `services/chat-response-processor.service.ts` (lines 307-309)

**Issue:** Private method that simply delegates to the exported standalone function.

```typescript
// Exported function (line 28)
export function applyPiiMappings(text: string, mappings: PiiMapping[]): string { ... }

// Redundant private wrapper (line 307)
private applyPiiMappings(text: string, mappings: PiiMapping[]): string {
  return applyPiiMappings(text, mappings);
}
```

**Recommended Action:** DELETE the private method and call the exported function directly.

---

### 3.2 Unused Agent Factory Imports

**File:** `voltagent.service.ts` (lines 35-37)

**Issue:** Agent factories imported but prefixed with underscore (unused):

```typescript
import { createWebSearchAgent as _createWebSearchAgent } from './agents/websearch.agent';
import { createDocumentLibraryAgent as _createDocumentLibraryAgent } from './agents/document-library.agent';
import { createAnalyticsAgent as _createAnalyticsAgent } from './agents/analytics.agent';
```

**Recommended Action:** DELETE unused imports if these agents are created elsewhere (e.g., within SupervisorAgent's delegate_task).

---

## 4. Dead Code

### 4.1 Unused `_piiSessionId` Variable

**File:** `voltagent.service.ts` (line 847)

**Issue:** Variable declared but never used.

```typescript
const _piiSessionId = sessionId;
```

**Recommended Action:** DELETE this unused variable.

---

### 4.2 Unused `_SupervisorAgentOptions` Import

**File:** `voltagent.service.ts` (line 34)

**Issue:** Type imported with underscore prefix (unused).

```typescript
import { createSupervisorAgent, type SupervisorAgentOptions as _SupervisorAgentOptions, UserContext } from './agents/supervisor.agent';
```

**Recommended Action:** REMOVE the unused type import alias.

---

## 5. Unused Parameters

### 5.1 `_followUpService` in Supervisor Agent

**File:** `agents/supervisor.agent.ts` (line 305)

**Issue:** Parameter destructured but prefixed with underscore (unused).

```typescript
// Line 291-306 in createSupervisorAgent
const {
  // ... other params
  followUpService: _followUpService, // Unused
  // ...
} = options;
```

**Recommended Action:** Either USE the service or REMOVE from options interface and destructuring.

---

## 6. Workflow Duplication

### 6.1 Two HITL Workflows

**Files:**
- `workflows/hitl.workflow.ts` (320 lines) - More comprehensive with action type risk assessment
- `workflows/approval.workflow.ts` (165 lines) - Simpler version

**Issue:** Two similar workflows for HITL approval:
- `hitl.workflow.ts` has `LOW_RISK_ACTIONS` and `HIGH_RISK_ACTIONS` sets
- `approval.workflow.ts` only checks severity

**Analysis:** These serve different purposes:
- `hitl.workflow.ts` - Full workflow with risk assessment (created 2025)
- `approval.workflow.ts` - Simple approval workflow used by `voltagent.service.ts`

**Recommended Action:** CONSOLIDATE if possible, or document clearly why both exist. Currently `approval.workflow.ts` is the one being used in production.

---

## 7. Code Organization Issues

### 7.1 VoltAgentService Too Large

**File:** `voltagent.service.ts` (2000 lines)

**Issue:** Despite the refactoring comment "VoltAgentService refactoring (2302 -> <500 lines)", the file is still 2000 lines.

**Services that should be used:**
- `ChatRequestProcessorService` - Input validation, PII, rate limits (already extracted)
- `ChatResponseProcessorService` - Response processing, HITL extraction (already extracted)
- `ChatContextBuilderService` - Context building (already extracted)
- `AgentPoolService` - Agent caching (extracted but not used!)

**Recommended Action:** REFACTOR `voltagent.service.ts` to use `AgentPoolService` and remove duplicate code.

---

## 8. Summary Table

| File | Function/Pattern | Issue | Action |
|------|-----------------|-------|--------|
| `conversation-management.service.ts` | `sanitizeMessageContent` | Duplicate of `sanitizeLlmResponse` | DELETE, import from `chat-context-builder.service.ts` |
| `observability/hooks.ts` | `stripInternalMarkers` | Third implementation | CONSOLIDATE into shared utility |
| `model-router.service.ts` + `conversation-compaction.service.ts` | `estimateTokens` | Similar logic | CONSOLIDATE into shared utility |
| `voltagent.service.ts` | `getOrCreateAgent` | Duplicated in `agent-pool.service.ts` | DELETE, use `AgentPoolService` |
| `voltagent.service.ts` | `evictLeastRecentlyUsedAgent` | Duplicated in `agent-pool.service.ts` | DELETE with above |
| `chat-response-processor.service.ts` | `applyPiiMappings` (private) | Redundant wrapper | DELETE private method |
| `voltagent.service.ts` | `_piiSessionId` | Unused variable | DELETE |
| `voltagent.service.ts` | `_SupervisorAgentOptions` | Unused import | DELETE |
| `voltagent.service.ts` | `_createWebSearchAgent`, etc. | Unused imports | DELETE |
| `supervisor.agent.ts` | `_followUpService` | Unused parameter | USE or DELETE |
| Multiple agent files | Locale instruction pattern | Duplicated 3x | CONSOLIDATE into utility |
| `action-executor.service.ts` | Provider lookup pattern | Repeated 8+ times | EXTRACT to private method |
| `voltagent.service.ts` | `resolveUserVisibleText` | Duplicated in processor | DELETE, use processor service |

---

## Estimated Impact

| Metric | Before | After (Estimated) |
|--------|--------|-------------------|
| `voltagent.service.ts` lines | 2000 | ~1200 |
| Duplicate functions | 6 | 0 |
| Duplicate patterns | 5 | 0 |
| Total lines saved | - | ~400-500 |

---

## Next Steps

1. **Phase 1:** Remove unused imports and variables (low risk)
2. **Phase 2:** Consolidate sanitization functions
3. **Phase 3:** Use `AgentPoolService` in `voltagent.service.ts`
4. **Phase 4:** Consolidate `estimateTokens` and locale utilities
5. **Phase 5:** Extract provider lookup pattern in `action-executor.service.ts`

---

*Report generated by Code Review Agent. No edits were made - this is analysis only.*
