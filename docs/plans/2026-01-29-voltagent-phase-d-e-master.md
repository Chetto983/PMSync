# VoltAgent Phase D/E + Subscription Fixes - Master Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete VoltAgent intelligence improvements (Phase D/E) and fix all subscription/quota gaps found in audit

**Architecture:** Fix critical security gaps first, then implement query understanding layer and result validation for smarter RAG

**Tech Stack:** NestJS, TypeScript, TanStack Query, MUI, Prisma, pgvector

**Audit Documents:**
- [AI_FEATURES_AUDIT_2026-01-29.md](backend/docs/AI_FEATURES_AUDIT_2026-01-29.md)
- [TRIAGE_BILLING_AUDIT_2026-01-29.md](backend/docs/TRIAGE_BILLING_AUDIT_2026-01-29.md)

---

## Executive Summary

| Category | Issues Found | Priority |
|----------|--------------|----------|
| **Security: Provider Limits** | FREE users can add unlimited email accounts | P0 CRITICAL |
| **Security: QuotaGuard Missing** | MemoryController bypasses all quota checks | P0 HIGH |
| **Security: RAG Ungated** | Knowledge/Memory endpoints use embeddings without quota | P0 HIGH |
| **UX: Feature Toggles** | Only triage shows "Pro" chip, others fail silently | P1 MEDIUM |
| **Intelligence: RAG** | Agent slow to retrieve, no query understanding | P1 MEDIUM |

---

## Part 1: P0 Critical Fixes (MUST DO FIRST)

### Task 1: Add QuotaGuard to MemoryController

**Files:**
- Modify: `backend/src/modules/ai/voltagent/controllers/memory.controller.ts`

**Step 1: Read current file**
```bash
Read memory.controller.ts to understand current guards
```

**Step 2: Add QuotaGuard import and decorator**
```typescript
// ADD to imports:
import { QuotaGuard } from '../../../subscription/guards/quota.guard';
import { RequiresQuota } from '../../../subscription/decorators/requires-quota.decorator';

// CHANGE from:
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('voltagent/memory')

// TO:
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('voltagent/memory')
```

**Step 3: Add @RequiresQuota to embedding endpoints**
```typescript
@Get('search')
@RequiresQuota('ai')  // ADD THIS
async searchMemories(...) { ... }

@Post()
@RequiresQuota('ai')  // ADD THIS
async storeMemory(...) { ... }
```

**Step 4: Run type-check**
```bash
cd backend && npm run type-check
```
Expected: No errors

**Step 5: Commit**
```bash
git add backend/src/modules/ai/voltagent/controllers/memory.controller.ts
git commit -m "fix(security): add QuotaGuard to MemoryController

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Add @RequiresQuota to KnowledgeController

**Files:**
- Modify: `backend/src/modules/ai/voltagent/controllers/knowledge.controller.ts`

**Step 1: Read current file**

**Step 2: Add decorators to embedding endpoints**
```typescript
@Post('search')
@RequiresQuota('ai')  // ADD THIS
async unifiedKnowledgeSearch(...) { ... }

@Post('remember')
@RequiresQuota('ai')  // ADD THIS
async rememberKnowledge(...) { ... }
```

**Step 3: Run type-check**
```bash
cd backend && npm run type-check
```

**Step 4: Commit**
```bash
git add backend/src/modules/ai/voltagent/controllers/knowledge.controller.ts
git commit -m "fix(security): add @RequiresQuota to knowledge endpoints

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Add maxProviders to PLAN_LIMITS

**Files:**
- Modify: `backend/src/modules/subscription/services/subscription.service.ts`

**Step 1: Read current PLAN_LIMITS**

**Step 2: Add maxProviders field**
```typescript
export const PLAN_LIMITS: Record<SubscriptionPlan, {
  monthlyEmailLimit: number;
  monthlyAICallLimit: number;
  maxUsers: number;
  maxProviders: number;  // ADD THIS TYPE
  features: string[];
}> = {
  FREE: {
    monthlyEmailLimit: 100,
    monthlyAICallLimit: 50,
    maxUsers: 1,
    maxProviders: 1,  // ADD
    features: ['basic_email'],
  },
  STARTER: {
    monthlyEmailLimit: 1000,
    monthlyAICallLimit: 500,
    maxUsers: 1,
    maxProviders: 2,  // ADD
    features: ['basic_email', 'smart_replies', 'summaries'],
  },
  PROFESSIONAL: {
    monthlyEmailLimit: 10000,
    monthlyAICallLimit: 5000,
    maxUsers: 5,
    maxProviders: 5,  // ADD
    features: ['basic_email', 'smart_replies', 'summaries', 'auto_triage', 'briefings', 'rag'],
  },
  ENTERPRISE: {
    monthlyEmailLimit: -1,
    monthlyAICallLimit: -1,
    maxUsers: -1,
    maxProviders: -1,  // ADD (unlimited)
    features: ['all'],
  },
};
```

**Step 3: Run type-check**

**Step 4: Commit**
```bash
git add backend/src/modules/subscription/services/subscription.service.ts
git commit -m "feat(subscription): add maxProviders to PLAN_LIMITS

FREE=1, STARTER=2, PROFESSIONAL=5, ENTERPRISE=unlimited

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Add Provider Limit Check to ProviderConfigService

**Files:**
- Modify: `backend/src/modules/providers/services/provider-config.service.ts`

**Step 1: Read current connectGoogleProvider method**

**Step 2: Add SubscriptionService import and injection**
```typescript
import { SubscriptionService, PLAN_LIMITS } from '../../subscription/services/subscription.service';
import { ForbiddenException } from '@nestjs/common';

constructor(
  // ... existing deps
  private readonly subscriptionService: SubscriptionService,  // ADD
) {}
```

**Step 3: Create helper method for limit check**
```typescript
/**
 * Check if tenant can add more providers based on subscription plan
 * @throws ForbiddenException if limit exceeded
 */
private async checkProviderLimit(tenantId: string): Promise<void> {
  const currentCount = await this.prisma.providerConfig.count({
    where: { tenantId, isDeleted: false },
  });

  const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
  const planLimits = PLAN_LIMITS[subscription.plan];

  if (planLimits.maxProviders !== -1 && currentCount >= planLimits.maxProviders) {
    throw new ForbiddenException(
      `Maximum ${planLimits.maxProviders} email account(s) allowed on ${subscription.plan} plan. ` +
      `Please upgrade to add more accounts.`
    );
  }
}
```

**Step 4: Add limit check to connect methods**
```typescript
async connectGoogleProvider(...) {
  await this.checkProviderLimit(tenantId);  // ADD AT START
  // ... existing logic
}

async connectMicrosoftProvider(...) {
  await this.checkProviderLimit(tenantId);  // ADD AT START
  // ... existing logic
}

async connectGenericProvider(...) {
  await this.checkProviderLimit(tenantId);  // ADD AT START
  // ... existing logic
}
```

**Step 5: Update providers.module.ts imports**
```typescript
// Add SubscriptionModule to imports if not already present
imports: [
  // ... existing
  SubscriptionModule,
],
```

**Step 6: Run type-check**

**Step 7: Commit**
```bash
git add backend/src/modules/providers/services/provider-config.service.ts backend/src/modules/providers/providers.module.ts
git commit -m "fix(security): enforce provider limits based on subscription plan

- FREE: 1 provider, STARTER: 2, PROFESSIONAL: 5, ENTERPRISE: unlimited
- Returns 403 with upgrade message when limit exceeded

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Part 2: P1 Frontend Feature Gating

### Task 5: Add Provider Limit Check to Frontend

**Files:**
- Modify: `frontend/hooks/queries/use-subscription-features.ts`
- Modify: `frontend/components/settings/ProviderSettings.tsx` (or wherever provider add button is)

**Step 1: Extend SubscriptionFeatures interface**
```typescript
export interface SubscriptionFeatures {
  basic_email: boolean;
  smart_replies: boolean;
  summaries: boolean;
  auto_triage: boolean;
  briefings: boolean;
  rag: boolean;
}

export interface SubscriptionLimits {
  maxProviders: number;
  currentProviders: number;
  canAddProvider: boolean;
}
```

**Step 2: Create useSubscriptionLimits hook**
```typescript
async function fetchLimits(): Promise<SubscriptionLimits> {
  const response = await apiClient.get<{ limits: SubscriptionLimits }>('/api/v1/subscription/limits');
  return response.data.limits;
}

export function subscriptionLimitsOptions() {
  return queryOptions({
    queryKey: ['subscription', 'limits'],
    queryFn: fetchLimits,
    staleTime: 60 * 1000, // 1 min (more frequent for limits)
  });
}

export function useSubscriptionLimits() {
  return useQuery(subscriptionLimitsOptions());
}
```

**Step 3: Add backend endpoint for limits**
File: `backend/src/modules/subscription/controllers/subscription.controller.ts`
```typescript
@Get('limits')
@ApiOperation({ summary: 'Get subscription limits and current usage' })
async getLimits(@Request() req: any) {
  const { tenantId } = req.user;
  const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
  const planLimits = PLAN_LIMITS[subscription.plan];

  const currentProviders = await this.prisma.providerConfig.count({
    where: { tenantId, isDeleted: false },
  });

  return {
    limits: {
      maxProviders: planLimits.maxProviders,
      currentProviders,
      canAddProvider: planLimits.maxProviders === -1 || currentProviders < planLimits.maxProviders,
    },
  };
}
```

**Step 4: Update frontend to show limit**
```typescript
// In provider add button area
const { data: limits } = useSubscriptionLimits();

{!limits?.canAddProvider && (
  <Alert severity="info">
    {t.settings.providers.limitReached}
    <Button onClick={handleUpgrade}>{t.settings.providers.upgrade}</Button>
  </Alert>
)}

<Button
  disabled={!limits?.canAddProvider}
  onClick={handleAddProvider}
>
  {t.settings.providers.addAccount}
</Button>
```

**Step 5: Add translations**
```typescript
// en.ts
providers: {
  limitReached: 'You\'ve reached the maximum email accounts for your plan.',
  upgrade: 'Upgrade Plan',
  addAccount: 'Add Email Account',
}

// it.ts
providers: {
  limitReached: 'Hai raggiunto il numero massimo di account email per il tuo piano.',
  upgrade: 'Aggiorna Piano',
  addAccount: 'Aggiungi Account Email',
}
```

**Step 6: Commit**

---

### Task 6: Add Feature Gates for Smart Replies & Summaries

**Files:**
- Modify: `frontend/components/settings/AiSettings.tsx`
- Modify: `frontend/components/dashboard/Settings.tsx`
- Modify: `frontend/locales/en.ts`, `frontend/locales/it.ts`

**Step 1: Update AiSettings props**
```typescript
interface AiSettingsProps {
  // ... existing
  canUseSmartReplies: boolean;  // ADD
  canUseSummaries: boolean;     // ADD
  // ...
}
```

**Step 2: Update Settings.tsx to pass new props**
```typescript
const canUseSmartReplies = subscriptionFeatures?.smart_replies ?? false;
const canUseSummaries = subscriptionFeatures?.summaries ?? false;

<AiSettings
  // ... existing
  canUseSmartReplies={canUseSmartReplies}
  canUseSummaries={canUseSummaries}
/>
```

**Step 3: Update AiSettings toggles**
```typescript
<SettingRow title={copy.smartRepliesTitle}>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Switch
      checked={smartRepliesEnabled}
      onChange={(e) => setSmartRepliesEnabled(e.target.checked)}
      disabled={!canUseSmartReplies}
    />
    {!canUseSmartReplies && (
      <Chip label="Starter+" size="small" color="primary" variant="outlined" />
    )}
  </Box>
</SettingRow>

<SettingRow title={copy.summarizationTitle}>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Switch
      checked={summarizationEnabled}
      onChange={(e) => setSummarizationEnabled(e.target.checked)}
      disabled={!canUseSummaries}
    />
    {!canUseSummaries && (
      <Chip label="Starter+" size="small" color="primary" variant="outlined" />
    )}
  </Box>
</SettingRow>
```

**Step 4: Add translations**
```typescript
// en.ts
smartRepliesRequiresStarter: 'Requires Starter plan or higher',
summarizationRequiresStarter: 'Requires Starter plan or higher',

// it.ts
smartRepliesRequiresStarter: 'Richiede piano Starter o superiore',
summarizationRequiresStarter: 'Richiede piano Starter o superiore',
```

**Step 5: Run type-check and lint**

**Step 6: Commit**

---

## Part 3: Phase D - Query Understanding Layer

### Task 7: Create QueryAnalyzer Service

**Files:**
- Create: `backend/src/modules/ai/voltagent/rag/query-analyzer.service.ts`

**Step 1: Create the service**
```typescript
import { Injectable, Logger } from '@nestjs/common';

export interface AnalyzedQuery {
  originalQuery: string;
  intent: 'search_email' | 'search_contact' | 'search_calendar' | 'general' | 'unknown';
  entities: {
    people: string[];
    dates: string[];
    topics: string[];
    folders: string[];
  };
  timeframe?: {
    start?: Date;
    end?: Date;
    relative?: string; // "last_week", "today", "this_month"
  };
  expandedQueries: string[];
  confidence: number;
}

@Injectable()
export class QueryAnalyzerService {
  private readonly logger = new Logger(QueryAnalyzerService.name);

  /**
   * Analyze user query to extract intent, entities, and generate expanded queries
   */
  async analyzeQuery(query: string): Promise<AnalyzedQuery> {
    const normalized = query.toLowerCase().trim();

    // Detect intent
    const intent = this.detectIntent(normalized);

    // Extract entities
    const entities = this.extractEntities(normalized);

    // Detect timeframe
    const timeframe = this.detectTimeframe(normalized);

    // Generate expanded queries for better recall
    const expandedQueries = this.generateExpandedQueries(query, intent, entities);

    // Calculate confidence based on entity extraction success
    const confidence = this.calculateConfidence(intent, entities);

    return {
      originalQuery: query,
      intent,
      entities,
      timeframe,
      expandedQueries,
      confidence,
    };
  }

  private detectIntent(query: string): AnalyzedQuery['intent'] {
    // Email patterns
    if (/email|mail|message|inbox|sent|thread|from|to|subject/i.test(query)) {
      return 'search_email';
    }
    // Contact patterns
    if (/contact|person|who|colleague|client|customer|sender/i.test(query)) {
      return 'search_contact';
    }
    // Calendar patterns
    if (/meeting|event|calendar|schedule|appointment|when/i.test(query)) {
      return 'search_calendar';
    }
    // General knowledge
    if (/what|how|why|explain|tell me/i.test(query)) {
      return 'general';
    }
    return 'unknown';
  }

  private extractEntities(query: string): AnalyzedQuery['entities'] {
    return {
      people: this.extractPeople(query),
      dates: this.extractDates(query),
      topics: this.extractTopics(query),
      folders: this.extractFolders(query),
    };
  }

  private extractPeople(query: string): string[] {
    const people: string[] = [];
    // Match "from John", "to Mary", "with Bob"
    const fromMatch = query.match(/(?:from|to|with|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi);
    if (fromMatch) {
      fromMatch.forEach(m => {
        const name = m.replace(/^(from|to|with|by)\s+/i, '');
        people.push(name);
      });
    }
    return [...new Set(people)];
  }

  private extractDates(query: string): string[] {
    const dates: string[] = [];
    // Match explicit dates
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
      /\d{4}-\d{2}-\d{2}/g,
      /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi,
    ];
    datePatterns.forEach(pattern => {
      const matches = query.match(pattern);
      if (matches) dates.push(...matches);
    });
    return dates;
  }

  private extractTopics(query: string): string[] {
    // Extract quoted phrases or key nouns
    const quoted = query.match(/"([^"]+)"/g);
    if (quoted) {
      return quoted.map(q => q.replace(/"/g, ''));
    }
    // Extract important nouns (simplified - could use NLP)
    const words = query.split(/\s+/).filter(w =>
      w.length > 4 &&
      !/^(about|email|find|search|show|where|what|when|from|with)$/i.test(w)
    );
    return words.slice(0, 3);
  }

  private extractFolders(query: string): string[] {
    const folders: string[] = [];
    const folderPatterns = [
      /(?:in|from)\s+(inbox|sent|drafts|trash|spam|archive)/gi,
      /(?:folder|label)\s+["']?([^"'\s]+)["']?/gi,
    ];
    folderPatterns.forEach(pattern => {
      const matches = query.matchAll(pattern);
      for (const match of matches) {
        folders.push(match[1]);
      }
    });
    return folders;
  }

  private detectTimeframe(query: string): AnalyzedQuery['timeframe'] | undefined {
    const now = new Date();

    if (/today/i.test(query)) {
      return { relative: 'today', start: new Date(now.setHours(0,0,0,0)) };
    }
    if (/yesterday/i.test(query)) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { relative: 'yesterday', start: yesterday };
    }
    if (/last\s+week/i.test(query)) {
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return { relative: 'last_week', start: lastWeek };
    }
    if (/this\s+month/i.test(query)) {
      return { relative: 'this_month', start: new Date(now.getFullYear(), now.getMonth(), 1) };
    }
    if (/last\s+month/i.test(query)) {
      return { relative: 'last_month', start: new Date(now.getFullYear(), now.getMonth() - 1, 1) };
    }

    return undefined;
  }

  private generateExpandedQueries(
    query: string,
    intent: AnalyzedQuery['intent'],
    entities: AnalyzedQuery['entities']
  ): string[] {
    const expanded: string[] = [query]; // Always include original

    // Add entity-focused queries
    if (entities.people.length > 0) {
      entities.people.forEach(person => {
        expanded.push(`email from ${person}`);
        expanded.push(`conversation with ${person}`);
      });
    }

    if (entities.topics.length > 0) {
      entities.topics.forEach(topic => {
        expanded.push(`${topic} discussion`);
        expanded.push(`about ${topic}`);
      });
    }

    return [...new Set(expanded)].slice(0, 5); // Max 5 queries
  }

  private calculateConfidence(
    intent: AnalyzedQuery['intent'],
    entities: AnalyzedQuery['entities']
  ): number {
    let score = 0.3; // Base confidence

    if (intent !== 'unknown') score += 0.2;
    if (entities.people.length > 0) score += 0.2;
    if (entities.topics.length > 0) score += 0.15;
    if (entities.dates.length > 0) score += 0.1;
    if (entities.folders.length > 0) score += 0.05;

    return Math.min(score, 1.0);
  }
}
```

**Step 2: Add to VoltAgent module**
```typescript
// voltagent.module.ts
import { QueryAnalyzerService } from './rag/query-analyzer.service';

providers: [
  // ... existing
  QueryAnalyzerService,
],
exports: [
  // ... existing
  QueryAnalyzerService,
],
```

**Step 3: Run type-check**

**Step 4: Commit**
```bash
git add backend/src/modules/ai/voltagent/rag/query-analyzer.service.ts backend/src/modules/ai/voltagent/voltagent.module.ts
git commit -m "feat(rag): add QueryAnalyzerService for intent detection

- Detects intent: email, contact, calendar, general
- Extracts entities: people, dates, topics, folders
- Generates expanded queries for better recall
- Calculates confidence score

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Integrate QueryAnalyzer into UnifiedRetriever

**Files:**
- Modify: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`

**Step 1: Inject QueryAnalyzerService**
```typescript
constructor(
  // ... existing
  private readonly queryAnalyzer: QueryAnalyzerService,
) {}
```

**Step 2: Update search method to use analyzer**
```typescript
async search(query: string, options: SearchOptions): Promise<SourceResult> {
  // Analyze query first
  const analyzed = await this.queryAnalyzer.analyzeQuery(query);
  this.logger.debug(`Query analyzed: intent=${analyzed.intent}, confidence=${analyzed.confidence}`);

  // Use analyzed data to improve search
  const results = await this.hybridSearch(query, {
    ...options,
    intent: analyzed.intent,
    timeframe: analyzed.timeframe,
    expandedQueries: analyzed.confidence < 0.5 ? analyzed.expandedQueries : undefined,
  });

  return results;
}
```

**Step 3: Commit**

---

## Part 4: Phase D - Result Validation

### Task 9: Add Result Validation to UnifiedRetriever

**Files:**
- Modify: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`

**Step 1: Create validation method**
```typescript
interface ValidationResult {
  isValid: boolean;
  needsExpansion: boolean;
  needsClarification: boolean;
  suggestion?: string;
}

private validateResults(
  query: string,
  results: SearchResult[],
  analyzed: AnalyzedQuery
): ValidationResult {
  // No results - needs expansion
  if (results.length === 0) {
    return {
      isValid: false,
      needsExpansion: true,
      needsClarification: false,
      suggestion: 'No results found. Try broader search terms.',
    };
  }

  // Low confidence top result - may need clarification
  const topScore = results[0]?.score || 0;
  if (topScore < 0.3) {
    return {
      isValid: false,
      needsExpansion: true,
      needsClarification: true,
      suggestion: `Results may not be relevant. Top match score: ${(topScore * 100).toFixed(0)}%`,
    };
  }

  // Good results
  return {
    isValid: true,
    needsExpansion: false,
    needsClarification: false,
  };
}
```

**Step 2: Integrate validation into search flow**
```typescript
async search(query: string, options: SearchOptions): Promise<SourceResult> {
  const analyzed = await this.queryAnalyzer.analyzeQuery(query);

  // Initial search
  let results = await this.hybridSearch(query, options);

  // Validate results
  const validation = this.validateResults(query, results, analyzed);

  // If needs expansion and we have expanded queries, try them
  if (validation.needsExpansion && analyzed.expandedQueries.length > 1) {
    this.logger.debug('Initial results weak, trying expanded queries');

    for (const expandedQuery of analyzed.expandedQueries.slice(1)) {
      const moreResults = await this.hybridSearch(expandedQuery, options);
      results = this.mergeAndDedupe(results, moreResults);

      // Re-validate
      const newValidation = this.validateResults(query, results, analyzed);
      if (newValidation.isValid) break;
    }
  }

  return {
    sources: results,
    metadata: {
      queryAnalysis: analyzed,
      validation,
    },
  };
}
```

**Step 3: Commit**

---

## Part 5: Phase E - Verification

### Task 10: Run Type Check

```bash
cd backend && npm run type-check
```
Expected: No errors

### Task 11: Run Linting

```bash
cd backend && npm run lint
cd frontend && npm run lint
```
Expected: No errors (or only pre-existing ones)

### Task 12: Run Tests

```bash
cd backend && npm run test -- --grep "voltagent|subscription|provider"
```
Expected: All tests pass

### Task 13: Manual Testing Checklist

- [ ] FREE user cannot add 2nd email provider (403 with upgrade message)
- [ ] FREE user cannot access /voltagent/memory/search (403)
- [ ] FREE user cannot access /voltagent/knowledge/search (403)
- [ ] STARTER user CAN use smart replies
- [ ] PROFESSIONAL user CAN access all features
- [ ] Frontend shows "Pro" chip on disabled triage toggle for FREE users
- [ ] Frontend shows "Starter+" chip on disabled smart replies for FREE users
- [ ] RAG search returns results with query analysis metadata

### Task 14: Final Commit

```bash
git add -A
git commit -m "feat(voltagent): complete Phase D/E with subscription fixes

Phase D (Query Understanding):
- QueryAnalyzerService for intent detection
- Entity extraction (people, dates, topics, folders)
- Query expansion for better recall

Phase D (Result Validation):
- Score-based validation
- Automatic query expansion on weak results
- Clarification suggestions

Subscription Fixes (P0):
- QuotaGuard on MemoryController
- @RequiresQuota on Knowledge endpoints
- Provider limits (FREE=1, STARTER=2, PRO=5, ENT=unlimited)
- Frontend feature gating with plan chips

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Files Summary

| Action | File | Priority |
|--------|------|----------|
| MODIFY | `memory.controller.ts` | P0 |
| MODIFY | `knowledge.controller.ts` | P0 |
| MODIFY | `subscription.service.ts` | P0 |
| MODIFY | `provider-config.service.ts` | P0 |
| MODIFY | `providers.module.ts` | P0 |
| CREATE | `query-analyzer.service.ts` | P1 |
| MODIFY | `unified-retriever.ts` | P1 |
| MODIFY | `voltagent.module.ts` | P1 |
| MODIFY | `AiSettings.tsx` | P1 |
| MODIFY | `Settings.tsx` | P1 |
| MODIFY | `subscription.controller.ts` | P1 |
| MODIFY | `use-subscription-features.ts` | P1 |
| MODIFY | `en.ts`, `it.ts` | P1 |

---

## Verification Commands

```bash
# Type check
cd backend && npm run type-check
cd frontend && npm run type-check

# Lint
cd backend && npm run lint
cd frontend && npm run lint

# Tests
cd backend && npm run test

# Start dev servers to manually test
cd backend && npm run start:dev
cd frontend && npm run dev
```

---

**Plan Created**: 2026-01-29
**Estimated Effort**: 4-6 hours
**Dependencies**: None (can be implemented independently)
