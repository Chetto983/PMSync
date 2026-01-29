# VoltAgent Phase D/E + Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete VoltAgent simplification by fixing triage/billing bugs, implementing intelligence improvements, and running verification.

**Architecture:** Backend subscription check guards triage execution; frontend disables toggle for non-Pro users; UnifiedRetriever gets query understanding layer for smarter RAG.

**Tech Stack:** NestJS, React/MUI, Prisma, TanStack Query, pgvector

---

## Task 1: Fix Auto-Triage Feature Gating (Backend)

**Files:**
- Modify: `backend/src/modules/ai/services/email-triage.service.ts:146-157`
- Modify: `backend/src/modules/subscription/services/subscription.service.ts` (add export)

**Step 1: Write the failing test**

Create test file: `backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { EmailTriageService } from '../email-triage.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SubscriptionService } from '../../../subscription/services/subscription.service';
import { SubscriptionPlan } from '@prisma/client';

describe('EmailTriageService.isAutoTriageEnabled', () => {
  let service: EmailTriageService;
  let prisma: jest.Mocked<PrismaService>;
  let subscriptionService: jest.Mocked<SubscriptionService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailTriageService,
        {
          provide: PrismaService,
          useValue: {
            userPreferences: { findUnique: jest.fn() },
          },
        },
        {
          provide: SubscriptionService,
          useValue: {
            getOrCreateSubscription: jest.fn(),
            hasFeature: jest.fn(),
          },
        },
        // ... other mocked dependencies
      ],
    }).compile();

    service = module.get(EmailTriageService);
    prisma = module.get(PrismaService);
    subscriptionService = module.get(SubscriptionService);
  });

  it('should return false for FREE plan even if preference enabled', async () => {
    prisma.userPreferences.findUnique.mockResolvedValue({ aiAutoTriageEnabled: true });
    subscriptionService.getOrCreateSubscription.mockResolvedValue({ plan: SubscriptionPlan.FREE });
    subscriptionService.hasFeature.mockReturnValue(false);

    const result = await service.isAutoTriageEnabled('user-1', 'tenant-1');

    expect(result).toBe(false);
    expect(subscriptionService.hasFeature).toHaveBeenCalledWith(SubscriptionPlan.FREE, 'auto_triage');
  });

  it('should return true for PROFESSIONAL plan with preference enabled', async () => {
    prisma.userPreferences.findUnique.mockResolvedValue({ aiAutoTriageEnabled: true });
    subscriptionService.getOrCreateSubscription.mockResolvedValue({ plan: SubscriptionPlan.PROFESSIONAL });
    subscriptionService.hasFeature.mockReturnValue(true);

    const result = await service.isAutoTriageEnabled('user-1', 'tenant-1');

    expect(result).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --testPathPattern=email-triage.service.spec.ts`
Expected: FAIL (isAutoTriageEnabled doesn't accept tenantId)

**Step 3: Update isAutoTriageEnabled to check subscription**

Edit `backend/src/modules/ai/services/email-triage.service.ts`:

```typescript
// Add import at top
import { SubscriptionService } from '../../subscription/services/subscription.service';

// Add to constructor
constructor(
  // ... existing deps
  private readonly subscriptionService: SubscriptionService,
) {}

/**
 * Check if auto-triage is enabled for a user
 * SECURITY: Now checks both preference AND subscription plan
 */
async isAutoTriageEnabled(userId: string, tenantId: string): Promise<boolean> {
  try {
    // 1. Check user preference
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { aiAutoTriageEnabled: true },
    });
    if (!prefs?.aiAutoTriageEnabled) {
      return false;
    }

    // 2. Check subscription has auto_triage feature (PROFESSIONAL+)
    const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
    const hasFeature = this.subscriptionService.hasFeature(subscription.plan, 'auto_triage');

    if (!hasFeature) {
      this.logger.debug(`Auto-triage blocked for tenant ${tenantId}: plan ${subscription.plan} lacks feature`);
    }

    return hasFeature;
  } catch (error) {
    this.logger.warn(`Failed to check auto-triage: ${error}`);
    return false;
  }
}
```

**Step 4: Update all callers to pass tenantId**

Search for `isAutoTriageEnabled` calls and update:
- `email-triage.service.ts:410` - already has `options.tenantId`
- `email-triage.service.ts:693` - already has `options.tenantId`
- `sync.worker.ts:230` - needs update

Edit `backend/src/modules/email-sync/workers/sync.worker.ts:230`:

```typescript
// Before
const isEnabled = await this.emailTriageService.isAutoTriageEnabled(userId);

// After
const isEnabled = await this.emailTriageService.isAutoTriageEnabled(userId, job.data.tenantId);
```

**Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- --testPathPattern=email-triage.service.spec.ts`
Expected: PASS

**Step 6: Type check**

Run: `cd backend && npm run type-check`
Expected: No errors

**Step 7: Commit**

```bash
git add backend/src/modules/ai/services/email-triage.service.ts backend/src/modules/email-sync/workers/sync.worker.ts
git commit -m "fix(triage): add subscription check to isAutoTriageEnabled

BREAKING: isAutoTriageEnabled now requires tenantId parameter
- Checks subscription plan has auto_triage feature (PROFESSIONAL+)
- FREE/STARTER users cannot run auto-triage even if preference enabled
- Fixes security gap where feature ran without authorization"
```

---

## Task 2: Fix Auto-Triage Feature Gating (Frontend)

**Files:**
- Create: `frontend/hooks/queries/use-subscription-features.ts`
- Modify: `frontend/hooks/queries/index.ts`
- Modify: `frontend/components/dashboard/Settings.tsx`
- Modify: `frontend/components/settings/AiSettings.tsx`

**Step 1: Create subscription features hook**

Create `frontend/hooks/queries/use-subscription-features.ts`:

```typescript
import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface SubscriptionFeatures {
  basic_email: boolean;
  smart_replies: boolean;
  summaries: boolean;
  auto_triage: boolean;
  briefings: boolean;
  rag: boolean;
}

async function fetchFeatures(): Promise<SubscriptionFeatures> {
  const response = await apiClient.get<{ features: SubscriptionFeatures }>('/api/v1/subscription/features');
  return response.data.features;
}

export function subscriptionFeaturesOptions() {
  return queryOptions({
    queryKey: ['subscription', 'features'],
    queryFn: fetchFeatures,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 30 * 60 * 1000,   // 30 min
  });
}

export function useSubscriptionFeatures() {
  return useQuery(subscriptionFeaturesOptions());
}
```

**Step 2: Export from index**

Edit `frontend/hooks/queries/index.ts`, add:

```typescript
export * from './use-subscription-features';
```

**Step 3: Update Settings.tsx to fetch features**

Edit `frontend/components/dashboard/Settings.tsx`:

```typescript
// Add import
import { useSubscriptionFeatures } from '@/hooks/queries';

// Inside Settings component, after other hooks:
const { data: subscriptionFeatures } = useSubscriptionFeatures();
const canUseTriage = subscriptionFeatures?.auto_triage ?? false;

// Pass to AiSettings (around line 615)
<AiSettings
  // ... existing props
  canUseTriage={canUseTriage}
  triageEnabled={triageEnabled}
  setTriageEnabled={setTriageEnabled}
  // ...
/>
```

**Step 4: Update AiSettings props and UI**

Edit `frontend/components/settings/AiSettings.tsx`:

```typescript
// Update interface (around line 22)
export interface AiSettingsProps {
  // ... existing props
  canUseTriage: boolean;  // NEW
  triageEnabled: boolean;
  setTriageEnabled: (v: boolean) => void;
  // ...
}

// Update function parameters
export function AiSettings({
  // ... existing
  canUseTriage,
  triageEnabled,
  setTriageEnabled,
  // ...
}: AiSettingsProps) {

// Update the triage toggle (around line 167-174)
<SettingRow
  icon={<ListFilter size={18} />}
  title={copy.triageTitle || 'Auto-Triage'}
  description={
    canUseTriage
      ? (copy.triageDescription || 'Automatically prioritize and label incoming emails')
      : 'Requires Professional plan'
  }
  noBorder
>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Switch
      checked={triageEnabled}
      onChange={(e) => setTriageEnabled(e.target.checked)}
      disabled={!canUseTriage}
    />
    {!canUseTriage && (
      <Chip label="Pro" size="small" color="primary" variant="outlined" />
    )}
  </Box>
</SettingRow>
```

**Step 5: Add Chip import**

Ensure `Chip` is imported from MUI at top of `AiSettings.tsx`:

```typescript
import {
  Box,
  Typography,
  Switch,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  Slider,
  Chip,  // ADD THIS
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
```

**Step 6: Type check frontend**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 7: Commit**

```bash
git add frontend/hooks/queries/use-subscription-features.ts frontend/hooks/queries/index.ts frontend/components/dashboard/Settings.tsx frontend/components/settings/AiSettings.tsx
git commit -m "feat(settings): add feature gating for Auto-Triage toggle

- Add useSubscriptionFeatures hook to fetch plan features
- Disable triage toggle for FREE/STARTER plans
- Show 'Pro' chip when feature unavailable
- Improves UX by preventing toggle of unavailable features"
```

---

## Task 3: Fix Duplicate Enterprise Subscriptions

**Files:**
- Create: `backend/prisma/migrations/20260129_fix_duplicate_subscriptions/migration.sql`

**Step 1: Create migration to add unique constraint**

Create migration file:

```sql
-- Fix duplicate subscriptions by keeping most recent per tenant
-- Then add unique constraint to prevent future duplicates

-- Step 1: Delete duplicates (keep most recent)
DELETE FROM "subscriptions"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" DESC) as rn
    FROM "subscriptions"
  ) t
  WHERE rn > 1
);

-- Step 2: Add unique constraint on tenantId
ALTER TABLE "subscriptions"
ADD CONSTRAINT "subscriptions_tenantId_unique" UNIQUE ("tenantId");
```

**Step 2: Run migration**

Run: `cd backend && npx prisma migrate deploy`
Expected: Migration applied successfully

**Step 3: Update Prisma schema**

Edit `backend/prisma/schema.prisma`, find Subscription model and add:

```prisma
model Subscription {
  id                    String             @id @default(uuid())
  tenantId              String             @unique  // ADD @unique HERE
  // ... rest of model
}
```

**Step 4: Regenerate Prisma client**

Run: `cd backend && npx prisma generate`
Expected: Prisma client regenerated

**Step 5: Commit**

```bash
git add backend/prisma/migrations/20260129_fix_duplicate_subscriptions/ backend/prisma/schema.prisma
git commit -m "fix(subscription): add unique constraint on tenantId

- Delete existing duplicate subscriptions (keep most recent)
- Add unique constraint to prevent future duplicates
- Update Prisma schema with @unique on tenantId"
```

---

## Task 4: Phase D - Query Understanding Layer

**Files:**
- Create: `backend/src/modules/ai/voltagent/rag/query-analyzer.ts`
- Modify: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`

**Step 1: Create QueryAnalyzer class**

Create `backend/src/modules/ai/voltagent/rag/query-analyzer.ts`:

```typescript
/**
 * Query Analyzer - Intent and entity extraction for smarter RAG
 *
 * Parses user queries to extract:
 * - Intent (search, read, compose, etc.)
 * - Entities (people, dates, topics)
 * - Time constraints
 * - Query expansion suggestions
 */
import { Logger } from '@nestjs/common';

export interface QueryAnalysis {
  intent: 'search' | 'read' | 'compose' | 'calendar' | 'unknown';
  entities: {
    people: string[];
    dates: string[];
    topics: string[];
  };
  timeConstraint?: {
    start?: Date;
    end?: Date;
    relative?: string; // "last week", "yesterday"
  };
  expandedQueries: string[];
  confidence: number;
}

export class QueryAnalyzer {
  private readonly logger = new Logger(QueryAnalyzer.name);

  /**
   * Analyze query and extract structured information
   */
  analyze(query: string, locale: string = 'en'): QueryAnalysis {
    const normalizedQuery = query.toLowerCase().trim();

    return {
      intent: this.detectIntent(normalizedQuery, locale),
      entities: this.extractEntities(normalizedQuery),
      timeConstraint: this.extractTimeConstraint(normalizedQuery, locale),
      expandedQueries: this.generateExpansions(normalizedQuery),
      confidence: this.calculateConfidence(normalizedQuery),
    };
  }

  private detectIntent(query: string, locale: string): QueryAnalysis['intent'] {
    const patterns = {
      en: {
        search: /\b(find|search|look\s*for|where|which)\b/,
        read: /\b(read|show|display|open|get)\b/,
        compose: /\b(write|compose|draft|send|reply)\b/,
        calendar: /\b(schedule|meeting|calendar|event|appointment)\b/,
      },
      it: {
        search: /\b(trova|cerca|dove|quale)\b/,
        read: /\b(leggi|mostra|apri|visualizza)\b/,
        compose: /\b(scrivi|componi|bozza|invia|rispondi)\b/,
        calendar: /\b(pianifica|riunione|calendario|evento|appuntamento)\b/,
      },
    };

    const p = patterns[locale as keyof typeof patterns] || patterns.en;

    if (p.search.test(query)) return 'search';
    if (p.read.test(query)) return 'read';
    if (p.compose.test(query)) return 'compose';
    if (p.calendar.test(query)) return 'calendar';

    return 'unknown';
  }

  private extractEntities(query: string): QueryAnalysis['entities'] {
    const people: string[] = [];
    const dates: string[] = [];
    const topics: string[] = [];

    // Extract quoted names or "from X" patterns
    const fromMatch = query.match(/from\s+([a-z]+(?:\s+[a-z]+)?)/i);
    if (fromMatch) people.push(fromMatch[1]);

    const toMatch = query.match(/to\s+([a-z]+(?:\s+[a-z]+)?)/i);
    if (toMatch) people.push(toMatch[1]);

    // Extract date patterns
    const datePatterns = /\b(today|yesterday|last\s+week|this\s+month|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi;
    let match;
    while ((match = datePatterns.exec(query)) !== null) {
      dates.push(match[1]);
    }

    // Extract likely topics (nouns after "about")
    const aboutMatch = query.match(/about\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,3})/i);
    if (aboutMatch) topics.push(aboutMatch[1]);

    return { people, dates, topics };
  }

  private extractTimeConstraint(query: string, _locale: string): QueryAnalysis['timeConstraint'] | undefined {
    const now = new Date();

    if (/\btoday\b/i.test(query)) {
      const start = new Date(now.setHours(0, 0, 0, 0));
      return { start, relative: 'today' };
    }

    if (/\byesterday\b/i.test(query)) {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end, relative: 'yesterday' };
    }

    if (/\blast\s+week\b/i.test(query)) {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, relative: 'last week' };
    }

    if (/\bthis\s+month\b/i.test(query)) {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, relative: 'this month' };
    }

    return undefined;
  }

  private generateExpansions(query: string): string[] {
    const expansions: string[] = [];

    // Add synonym expansions
    if (/\bemail\b/i.test(query)) {
      expansions.push(query.replace(/\bemail\b/i, 'message'));
    }

    if (/\bmeeting\b/i.test(query)) {
      expansions.push(query.replace(/\bmeeting\b/i, 'call'));
      expansions.push(query.replace(/\bmeeting\b/i, 'appointment'));
    }

    return expansions.slice(0, 3); // Limit to 3 expansions
  }

  private calculateConfidence(query: string): number {
    let confidence = 0.5; // Base

    // Longer queries tend to be more specific
    if (query.split(/\s+/).length > 3) confidence += 0.1;
    if (query.split(/\s+/).length > 6) confidence += 0.1;

    // Quoted terms increase confidence
    if (/"[^"]+"/.test(query)) confidence += 0.15;

    // Named entities increase confidence
    if (/from\s+[a-z]/i.test(query)) confidence += 0.1;
    if (/about\s+/i.test(query)) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }
}
```

**Step 2: Integrate QueryAnalyzer into UnifiedRetriever**

Edit `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`:

```typescript
// Add import at top
import { QueryAnalyzer, type QueryAnalysis } from './query-analyzer';

// Add to class properties
private readonly queryAnalyzer = new QueryAnalyzer();

// Add method to retrieve with understanding
async retrieveWithUnderstanding(
  query: string,
  messages: BaseMessage[],
): Promise<{ results: SourceResult[]; analysis: QueryAnalysis }> {
  // 1. Analyze query
  const analysis = this.queryAnalyzer.analyze(query, this.locale);
  this.nestLogger.debug(`Query analysis: intent=${analysis.intent}, confidence=${analysis.confidence}`);

  // 2. Build enhanced query with entities
  let enhancedQuery = query;
  if (analysis.entities.people.length > 0) {
    enhancedQuery += ` from:${analysis.entities.people.join(' ')}`;
  }

  // 3. Retrieve with original query
  const results = await this.retrieve(enhancedQuery, messages);

  // 4. If low confidence and few results, try expanded queries
  if (analysis.confidence < 0.6 && results.length < 3 && analysis.expandedQueries.length > 0) {
    this.nestLogger.debug(`Low confidence (${analysis.confidence}), trying expanded queries`);
    for (const expandedQuery of analysis.expandedQueries) {
      const expandedResults = await this.retrieve(expandedQuery, messages);
      // Merge results (dedupe by id)
      const existingIds = new Set(results.flatMap(r => r.items.map(i => i.id)));
      for (const result of expandedResults) {
        const newItems = result.items.filter(i => !existingIds.has(i.id));
        if (newItems.length > 0) {
          const existing = results.find(r => r.source === result.source);
          if (existing) {
            existing.items.push(...newItems);
          } else {
            results.push({ ...result, items: newItems });
          }
        }
      }
    }
  }

  return { results, analysis };
}
```

**Step 3: Type check**

Run: `cd backend && npm run type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/modules/ai/voltagent/rag/query-analyzer.ts backend/src/modules/ai/voltagent/rag/unified-retriever.ts
git commit -m "feat(rag): add query understanding layer

- QueryAnalyzer extracts intent, entities, time constraints
- UnifiedRetriever.retrieveWithUnderstanding for smarter search
- Query expansion for low-confidence results
- Bilingual support (EN/IT)"
```

---

## Task 5: Phase D - Result Validation

**Files:**
- Modify: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`

**Step 1: Add result validation method**

Edit `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`:

```typescript
interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}

/**
 * Validate search results for quality
 */
validateResults(
  query: string,
  results: SourceResult[],
  analysis: QueryAnalysis,
): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let confidence = 0.5;

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);

  // Check if we got results
  if (totalItems === 0) {
    issues.push('No results found');
    suggestions.push('Try broader search terms');
    if (analysis.timeConstraint) {
      suggestions.push('Remove date filter to search all time');
    }
    return { isValid: false, confidence: 0, issues, suggestions };
  }

  // Check result scores
  const allScores = results.flatMap(r => r.items.map(i => i.score));
  const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const maxScore = Math.max(...allScores);

  if (maxScore < 0.3) {
    issues.push('Low relevance scores');
    suggestions.push('Results may not match your query well');
    confidence = 0.3;
  } else if (avgScore > 0.6) {
    confidence = 0.8;
  } else {
    confidence = 0.5 + (avgScore * 0.3);
  }

  // Check if named entities were found
  if (analysis.entities.people.length > 0) {
    const peopleInResults = results.some(r =>
      r.items.some(i =>
        analysis.entities.people.some(p =>
          i.content.toLowerCase().includes(p.toLowerCase())
        )
      )
    );
    if (!peopleInResults) {
      issues.push(`Person "${analysis.entities.people[0]}" not found in results`);
      suggestions.push('Check spelling or try alternative name');
      confidence *= 0.8;
    }
  }

  return {
    isValid: issues.length === 0 || (issues.length === 1 && maxScore > 0.5),
    confidence,
    issues,
    suggestions,
  };
}
```

**Step 2: Update retrieveWithUnderstanding to use validation**

```typescript
async retrieveWithUnderstanding(
  query: string,
  messages: BaseMessage[],
): Promise<{
  results: SourceResult[];
  analysis: QueryAnalysis;
  validation: ValidationResult;
}> {
  // ... existing code for analysis and retrieval ...

  // 5. Validate results
  const validation = this.validateResults(query, results, analysis);
  this.nestLogger.debug(`Validation: valid=${validation.isValid}, confidence=${validation.confidence}`);

  return { results, analysis, validation };
}
```

**Step 3: Type check**

Run: `cd backend && npm run type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/modules/ai/voltagent/rag/unified-retriever.ts
git commit -m "feat(rag): add result validation with confidence scoring

- Validates result count, relevance scores, entity matches
- Provides suggestions when results are poor
- Returns confidence score for result quality"
```

---

## Task 6: Phase E - Verification

**Files:**
- None (verification only)

**Step 1: Run backend type check**

Run: `cd backend && npm run type-check`
Expected: No errors

**Step 2: Run backend lint**

Run: `cd backend && npm run lint`
Expected: No errors (or only warnings)

**Step 3: Run frontend type check**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors (or only warnings)

**Step 5: Run backend tests**

Run: `cd backend && npm test -- --passWithNoTests`
Expected: Tests pass

**Step 6: Manual smoke test**

1. Start backend: `cd backend && npm run start:dev`
2. Start frontend: `cd frontend && npm run dev`
3. Test triage toggle:
   - Login as FREE user → Triage toggle should be disabled with "Pro" chip
   - Try to enable → Should remain disabled
4. Test chat with RAG query:
   - Ask "Find emails from John about budget"
   - Verify response includes relevant emails

**Step 7: Commit verification**

```bash
git add .
git commit -m "chore: verification complete for VoltAgent Phase D/E

Verified:
- Backend type-check: PASS
- Backend lint: PASS
- Frontend type-check: PASS
- Frontend lint: PASS
- Backend tests: PASS
- Manual smoke test: PASS"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Backend triage subscription check | Pending |
| 2 | Frontend triage feature gating | Pending |
| 3 | Fix duplicate subscriptions | Pending |
| 4 | Query understanding layer | Pending |
| 5 | Result validation | Pending |
| 6 | Verification | Pending |

**Total estimated tasks:** 6
**Commits:** 7 (one per task + verification)
