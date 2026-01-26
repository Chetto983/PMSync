# VoltAgent 2.x Simplification Plan

> **🔄 DEFERRED & ARCHIVED**: This document has been consolidated into [AI_ROADMAP_MASTER.md](./AI_ROADMAP_MASTER.md)
> Sentinel migration is marked as OPTIONAL (Phase 5). Deferred to Q2 2026.

**Created**: 2026-01-23
**Based on**: VoltAgent 2.1.6 docs + @sentinelseed/voltagent + Mistral Guardrailing

---

## Executive Summary

Current MailAgent has **~900 lines of custom code** that can be replaced by VoltAgent native features and @sentinelseed/voltagent package.

| Custom Code | Lines | Replacement | Action |
|-------------|-------|-------------|--------|
| PiiDetectionService | 186 | @sentinelseed/voltagent `detectPII()` | REPLACE |
| PromptGuardService | 370 | Sentinel OWASP + THSP + Mistral `safe_prompt` | REPLACE |
| Custom `requiresApproval` return | ~50 | VoltAgent `needsApproval: true` | MIGRATE |
| ModelRouterService | 554 | VoltAgent dynamic `model` function | ALREADY REMOVED |
| **Total Savings** | **~600+** | | |

---

## 1. Install @sentinelseed/voltagent

```bash
npm install @sentinelseed/voltagent
```

**Features:**
- THSP Protocol (Truth, Harm, Scope, Purpose validation)
- OWASP Protection (injection attacks, XSS, prompt injection)
- PII Detection & Redaction (emails, phones, SSNs, credit cards, API keys)
- Streaming redaction for real-time responses

---

## 2. Replace PiiDetectionService

**Current** (`pii-detection.service.ts` - 186 lines):
```typescript
@Injectable()
export class PiiDetectionService {
  private readonly PII_PATTERNS: Record<PiiType, RegExp> = {
    EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    PHONE: /(?:\+?1[-.\s]?)?...,
    // 6 custom regex patterns
  };

  detect(text: string): PiiDetectionResult { ... }
  redact(text: string): string { ... }
}
```

**Replacement** (Sentinel):
```typescript
import { detectPII, redactPII, createPrivacyGuardrails } from '@sentinelseed/voltagent';

// Direct detection
const piiResult = detectPII(text);

// Or with guardrails
const guardrails = createPrivacyGuardrails({
  types: ['email', 'phone', 'ssn', 'credit_card', 'api_key'],
  redactionFormat: 'hash', // or 'mask', 'type_label'
});

// Use in chat flow
const { output, detections } = await guardrails.processInput(text);
```

**Keep**: `PiiResolutionService` (354 lines) - Redis storage for rehydration is unique and valuable.

---

## 3. Replace PromptGuardService

**Current** (`prompt-guard.service.ts` - 370 lines):
```typescript
@Injectable()
export class PromptGuardService {
  private readonly DIRECT_INJECTION_PATTERNS = [...]; // 20+ patterns
  private readonly INDIRECT_INJECTION_PATTERNS = [...];
  private readonly HIGH_RISK_KEYWORDS = [...];

  validateInput(input: string): PromptValidationResult { ... }
  validateOutput(output: string): PromptValidationResult { ... }
  getDefensiveSystemPrompt(): string { ... }
}
```

**Replacement** (Sentinel + Mistral):

```typescript
import { createSentinelGuardrails, createChatGuardrails } from '@sentinelseed/voltagent';

// Sentinel for OWASP + THSP
const guardrails = createSentinelGuardrails({
  preset: 'standard', // or 'strict' for production
  owasp: {
    injection: true,
    xss: true,
    promptInjection: true,
  },
  thsp: {
    truth: true,
    harm: true,
    scope: true,
    purpose: true,
  },
});

// Mistral for automatic safety prompt
const response = await client.chat.complete({
  model: 'mistral-large-latest',
  messages: [...],
  safe_prompt: true, // Adds defensive system prompt automatically
});
```

**Mistral Moderation API** (for content filtering):
```typescript
const moderation = await client.classifiers.moderate({
  model: 'mistral-moderation-latest',
  inputs: [userMessage],
});

// Check categories: sexual, hate, violence, dangerous, selfHarm, health, financial, law, pii
if (moderation.results[0].categories.pii) {
  // Handle PII detected
}
```

---

## 4. Migrate to VoltAgent Native HITL

**Current** (custom `requiresApproval` return):
```typescript
// manage-email.tool.ts
execute: async (args) => {
  return {
    requiresApproval: true,
    actionType: 'email_send',
    severity: 'HIGH',
    payload: args,
    summary: `Send email to ${args.to}`,
  };
}
```

**VoltAgent Native** (`needsApproval: true`):
```typescript
import { createTool } from '@voltagent/core';

const manageEmailTool = createTool({
  name: 'manage_email',
  description: 'Send, delete, or modify emails',
  parameters: z.object({
    action: z.enum(['send', 'delete', 'archive']),
    // ...
  }),
  needsApproval: true, // VoltAgent handles suspension automatically
  // OR dynamic:
  needsApproval: async ({ action }) => ['send', 'delete'].includes(action),
  execute: async (args, options) => {
    // VoltAgent auto-suspends before this runs
    // options.userId, options.operationId available
    return { success: true };
  },
});
```

**Benefits:**
- VoltAgent handles workflow suspension
- No custom `requiresApproval` parsing needed
- Cleaner separation of concerns

---

## 5. Simplify ChatRequestProcessor

**Current** (`chat-request-processor.service.ts` - 228 lines):
```typescript
async preprocessMessage(message: string, tenantId: string) {
  // 1. Validate input with PromptGuardService
  const validation = this.promptGuardService.validateInput(message);

  // 2. PII detection
  const pii = this.piiDetectionService.detect(message);

  // 3. Store PII mappings
  await this.piiResolutionService.storeMapping(...);

  // 4. Return preprocessed
  return { redactedMessage, piiMappings, ... };
}
```

**Simplified** (with Sentinel):
```typescript
import { createSentinelGuardrails } from '@sentinelseed/voltagent';

@Injectable()
export class ChatRequestProcessorService {
  private readonly guardrails = createSentinelGuardrails({
    preset: 'standard',
    pii: { enabled: true, redact: true },
    owasp: { enabled: true },
  });

  async preprocessMessage(message: string, tenantId: string) {
    // Single call replaces PromptGuard + PiiDetection
    const result = await this.guardrails.processInput(message);

    if (!result.safe) {
      throw new AiError(AiErrorCode.INPUT_BLOCKED, result.reason);
    }

    // Store PII mappings for rehydration (keep PiiResolutionService)
    if (result.piiDetections?.length) {
      await this.piiResolutionService.storeMapping(tenantId, sessionId, result.piiDetections);
    }

    return { redactedMessage: result.output, piiDetections: result.piiDetections };
  }
}
```

---

## 6. Use Mistral Guardrailing in Agent

**In MistralProvider** (`mistral.provider.ts`):
```typescript
async generateResponse(messages: Message[], options: GenerateOptions) {
  const response = await this.client.chat.complete({
    model: options.model || 'mistral-large-latest',
    messages,
    safe_prompt: true, // Enable automatic safety prompt
  });

  return response;
}
```

**Optional: Moderation pre-check**:
```typescript
async checkContentSafety(input: string): Promise<boolean> {
  const result = await this.client.classifiers.moderate({
    model: 'mistral-moderation-latest',
    inputs: [input],
  });

  const categories = result.results[0].categories;
  return !(categories.pii || categories.dangerous || categories.hate);
}
```

---

## Files to Modify/Delete

### DELETE (after migration):
| File | Lines | Reason |
|------|-------|--------|
| `pii-detection.service.ts` | 186 | Replaced by Sentinel |
| `prompt-guard.service.ts` | 370 | Replaced by Sentinel + Mistral |
| **Total** | **556** | |

### SIMPLIFY:
| File | Current | Target | Savings |
|------|---------|--------|---------|
| `chat-request-processor.service.ts` | 228 | 80 | 148 |

### KEEP:
| File | Lines | Reason |
|------|-------|--------|
| `pii-resolution.service.ts` | 354 | Unique Redis caching for rehydration |

---

## Migration Steps

### Phase 1: Install & Test Sentinel (Day 1)
```bash
npm install @sentinelseed/voltagent
```
1. Create test file to verify Sentinel works
2. Compare detection results with current PiiDetectionService
3. Verify OWASP detection matches PromptGuardService

### Phase 2: Integrate Sentinel (Day 2)
1. Update `ChatRequestProcessorService` to use Sentinel
2. Keep PiiResolutionService for Redis storage
3. Remove direct usage of PiiDetectionService

### Phase 3: Migrate Tools to needsApproval (Day 2-3)
1. `manage-email.tool.ts` - Add `needsApproval: true`
2. `manage-contact.tool.ts` - Add `needsApproval: true`
3. `manage-calendar.tool.ts` - Add `needsApproval: true`
4. Update HITL extraction logic in `ChatResponseProcessorService`

### Phase 4: Enable Mistral Guardrailing (Day 3)
1. Add `safe_prompt: true` to Mistral provider
2. Optionally add moderation pre-check

### Phase 5: Delete Dead Code (Day 4)
1. Delete `pii-detection.service.ts`
2. Delete `prompt-guard.service.ts`
3. Update imports and module providers
4. Run type-check and tests

---

## Verification

```bash
# Type check
npm run type-check

# Run HITL test
npx ts-node scripts/test-tool-hitl-simple.ts

# Run bruteforce tests
npx ts-node scripts/bruteforce-voltagent-test.ts
```

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Replace PiiDetection | LOW | Test detection parity first |
| Replace PromptGuard | MEDIUM | Test OWASP patterns match |
| needsApproval migration | MEDIUM | Test each tool individually |
| Mistral safe_prompt | LOW | Non-breaking addition |

---

## Summary

**Total savings: ~700+ lines of code**

| Before | After | Savings |
|--------|-------|---------|
| Custom PII: 186 | Sentinel: 5 | 181 |
| Custom Guard: 370 | Sentinel: 10 | 360 |
| Chat Processor: 228 | Simplified: 80 | 148 |
| **Total** | | **~700** |

Plus cleaner architecture with battle-tested libraries instead of custom implementations.
