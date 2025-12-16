# P1.7 CRM Intelligence Design Document

**Date:** December 15, 2025
**Author:** AI Assistant
**Status:** ✅ IMPLEMENTED (December 16, 2025)
**Phase:** P1.7 (follows P1.6 Unified Knowledge Agent)

---

## Implementation Summary

**Completed:** December 16, 2025

### Test Results (All 8 Passed)

| Test | Status | Duration |
|------|--------|----------|
| Schema P1.7 Fields Exist | ✅ PASSED | 2ms |
| ContactInteraction P1.7 Fields | ✅ PASSED | 40ms |
| emailId Unique Constraint | ✅ PASSED | 54ms |
| Tenant Isolation | ✅ PASSED | 81ms |
| Relationship Score Calculation | ✅ PASSED | 11ms |
| Stale Contact Query | ✅ PASSED | 19ms |
| Cascade Delete | ✅ PASSED | 18ms |
| Index Performance | ✅ PASSED | 5ms |

### Files Implemented

| File | Lines | Purpose |
|------|-------|---------|
| `services/relationship-intelligence.service.ts` | ~500 | Core CRM service |
| `jobs/crm-backfill.processor.ts` | ~350 | Historical email backfill |
| `jobs/reconnect-reminder.processor.ts` | ~310 | Daily scheduled reminders |
| `jobs/index.ts` | ~10 | Job exports |
| `scripts/test-crm-intelligence.ts` | ~500 | Comprehensive test suite |

### Key Implementation Decisions

1. **Prisma + Recursive CTEs** instead of Apache AGE (production compatibility)
2. **BullMQ** for backfill and reminder jobs (existing infrastructure)
3. **Redis** for reminder storage (7-day TTL)
4. **Tenant isolation** validated with 5,448 real contacts

---

## Executive Summary

This document defines the implementation of **Relationship Intelligence** for MailAgent - a CRM-like feature that automatically tracks contact interactions, calculates relationship health, and proactively alerts users about stale contacts.

### Key Differentiator

Unlike traditional CRMs that require manual data entry, MailAgent automatically captures every email interaction and provides intelligent relationship insights without user effort.

---

## Market Research Summary

Based on [CRM.org statistics](https://crm.org/crmland/crm-statistics), [4Degrees](https://www.4degrees.ai/), and [Introhive](https://www.introhive.com/blog/relationship-intelligence-automation/):

| Feature | Market Need | Our Priority |
|---------|-------------|--------------|
| Auto-captured interactions | 74% users cite better data access as top benefit | P1 |
| Stale contact alerts | "60+ days" rule common in CRMs | P1 |
| Last contacted tracking | Core CRM feature | P1 |
| Relationship health score | 27% retention increase with reconnect reminders | P2 |
| Contact enrichment | Nice-to-have | P3 |

---

## Architecture Decision: Prisma + Recursive CTEs

### Why NOT Apache AGE?

| Platform | pgvector | Apache AGE | Status |
|----------|----------|------------|--------|
| Railway | Supported | Not available | Managed PostgreSQL |
| Hetzner Managed | Supported | Not listed | Limited extensions |
| Self-hosted | Supported | Requires setup | Ops overhead |

**Decision:** Use PostgreSQL recursive CTEs for graph-like queries. This approach:
- Works on **any** managed PostgreSQL (Railway, Hetzner, Supabase, Neon)
- Supports 2-3 hop relationship traversals (sufficient for CRM)
- Future-proof: SQL/PGQ (SQL:2023) provides native graph syntax

### References
- [PostgreSQL as Graph Database](https://www.dylanpaulus.com/posts/postgres-is-a-graph-database/)
- [Recursive CTEs for Hierarchical Data](https://medium.com/@rizqimulkisrc/postgresql-as-a-graph-database-recursive-queries-for-hierarchical-data-706dda4e788e)

---

## Data Model

### New: ContactInteraction Table

Tracks every email interaction with a contact for relationship intelligence.

```prisma
// schema.prisma additions for P1.7

model ContactInteraction {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  contactId String
  emailId   String   @unique // One interaction per email

  // Interaction metadata
  direction    InteractionDirection // SENT | RECEIVED
  interactedAt DateTime             // Email sentAt/receivedAt

  // Cached contact info (for query performance)
  contactEmail String  // The specific email address used
  contactName  String? // Display name at time of interaction

  // Timestamps
  createdAt DateTime @default(now())

  // Relations
  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  email   Email   @relation(fields: [emailId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId, contactId])
  @@index([tenantId, userId, interactedAt])
  @@index([contactId, interactedAt])
  @@map("contact_interactions")
}

enum InteractionDirection {
  SENT
  RECEIVED
}
```

### Enhanced: Contact Table (new fields)

```prisma
model Contact {
  // ... existing fields ...

  // P1.7 Relationship Intelligence (cached metrics)
  lastInteractedAt    DateTime? // Last email sent/received
  totalInteractions   Int       @default(0)
  sentCount           Int       @default(0)
  receivedCount       Int       @default(0)
  relationshipScore   Float?    // 0-100 health score
  reconnectRemindedAt DateTime? // Last reminder sent

  // New relation
  interactions ContactInteraction[]
}
```

### Enhanced: Email Table (new relation)

```prisma
model Email {
  // ... existing fields ...

  // P1.7 relation
  contactInteraction ContactInteraction?
}
```

---

## Core Service: RelationshipIntelligenceService

### Location
`backend/src/modules/ai/voltagent/services/relationship-intelligence.service.ts`

### Public API

```typescript
@Injectable()
export class RelationshipIntelligenceService {

  // ============ Contact Queries ============

  /**
   * Get stale contacts (no interaction in N days)
   * Core CRM feature - "Who haven't I contacted recently?"
   */
  async getStaleContacts(
    tenantId: string,
    userId: string,
    options: {
      staleDays?: number;      // Default: 30
      limit?: number;          // Default: 20
      includeNeverContacted?: boolean;
    }
  ): Promise<StaleContact[]>

  /**
   * Get contact profile with relationship data
   * "Show me everything about John Smith"
   */
  async getContactProfile(
    tenantId: string,
    userId: string,
    contactId: string
  ): Promise<ContactProfile>

  /**
   * Search contacts by email address
   * Used during email processing
   */
  async findContactByEmail(
    tenantId: string,
    email: string
  ): Promise<Contact | null>

  // ============ Interaction Tracking ============

  /**
   * Record email interaction with contact
   * Called during email sync
   */
  async recordInteraction(
    tenantId: string,
    userId: string,
    emailId: string,
    direction: 'SENT' | 'RECEIVED'
  ): Promise<void>

  /**
   * Bulk record interactions (for backfill)
   */
  async backfillInteractions(
    tenantId: string,
    userId: string,
    batchSize?: number
  ): Promise<{ processed: number; linked: number }>

  // ============ Relationship Metrics ============

  /**
   * Calculate relationship health score
   * Based on: recency, frequency, reciprocity
   */
  calculateRelationshipScore(stats: ContactStats): number

  /**
   * Get relationship summary for AI context
   * Used by UnifiedRetriever
   */
  async getRelationshipContext(
    tenantId: string,
    userId: string,
    contactEmail: string
  ): Promise<string>

  // ============ Reconnect Reminders ============

  /**
   * Get contacts due for reconnection reminder
   * Used by BullMQ scheduled job
   */
  async getContactsNeedingReconnect(
    tenantId: string,
    userId: string,
    options: {
      staleDays?: number;
      reminderCooldownDays?: number;
      limit?: number;
    }
  ): Promise<ReconnectCandidate[]>

  /**
   * Mark contact as reminded
   */
  async markReconnectReminded(
    tenantId: string,
    contactId: string
  ): Promise<void>
}
```

### Types

```typescript
export interface StaleContact {
  id: string;
  displayName: string | null;
  email: string;
  company: string | null;
  lastInteractedAt: Date | null;
  daysSinceContact: number;
  totalInteractions: number;
  relationshipScore: number | null;
}

export interface ContactProfile {
  contact: Contact;
  stats: ContactStats;
  recentEmails: EmailSummary[];
  relationshipScore: number;
  relationshipTrend: 'improving' | 'stable' | 'declining';
}

export interface ContactStats {
  totalInteractions: number;
  sentCount: number;
  receivedCount: number;
  lastInteractedAt: Date | null;
  firstInteractedAt: Date | null;
  avgResponseTimeHours: number | null;
  interactionsLast30Days: number;
  interactionsLast90Days: number;
}

export interface ReconnectCandidate {
  contact: Contact;
  daysSinceContact: number;
  suggestedAction: string; // AI-generated suggestion
  priority: 'high' | 'medium' | 'low';
}
```

---

## Relationship Score Algorithm

The relationship health score (0-100) is calculated from multiple factors:

```typescript
/**
 * Calculate relationship health score
 *
 * Factors:
 * - Recency: When was last interaction? (40% weight)
 * - Frequency: How often do we interact? (30% weight)
 * - Reciprocity: Is communication two-way? (20% weight)
 * - Trend: Is relationship improving? (10% weight)
 */
calculateRelationshipScore(stats: ContactStats): number {
  let score = 0;

  // 1. RECENCY (40 points max)
  // Full score if < 7 days, decreases linearly, 0 if > 90 days
  const daysSince = stats.lastInteractedAt
    ? daysBetween(stats.lastInteractedAt, new Date())
    : 999;
  const recencyScore = Math.max(0, 40 - (daysSince / 90) * 40);
  score += recencyScore;

  // 2. FREQUENCY (30 points max)
  // Based on interactions per month over last 90 days
  const interactionsPerMonth = (stats.interactionsLast90Days / 3);
  // 10+ per month = full score, scales down
  const frequencyScore = Math.min(30, interactionsPerMonth * 3);
  score += frequencyScore;

  // 3. RECIPROCITY (20 points max)
  // Ideal ratio is 50/50 sent/received
  const total = stats.sentCount + stats.receivedCount;
  if (total > 0) {
    const sentRatio = stats.sentCount / total;
    // Perfect balance = 0.5, penalize one-sided
    const balance = 1 - Math.abs(0.5 - sentRatio) * 2;
    score += balance * 20;
  }

  // 4. TREND (10 points max)
  // Compare last 30 days to previous 60 days
  const recent = stats.interactionsLast30Days;
  const older = stats.interactionsLast90Days - recent;
  const olderNormalized = older / 2; // Normalize to 30-day equivalent

  if (olderNormalized > 0) {
    const trendRatio = recent / olderNormalized;
    if (trendRatio >= 1) {
      score += Math.min(10, (trendRatio - 1) * 5 + 5); // Improving
    } else {
      score += trendRatio * 5; // Declining
    }
  } else if (recent > 0) {
    score += 10; // New relationship, give benefit
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}
```

### Score Interpretation

| Score | Label | Color | Action |
|-------|-------|-------|--------|
| 80-100 | Strong | Green | Maintain |
| 60-79 | Good | Blue | Monitor |
| 40-59 | Moderate | Yellow | Consider reaching out |
| 20-39 | Weak | Orange | Schedule reconnect |
| 0-19 | Dormant | Red | Urgent reconnect or archive |

---

## SQL Queries (Recursive CTEs)

### Query 1: Stale Contacts

```sql
-- Get contacts with no interaction in last N days
WITH contact_stats AS (
  SELECT
    c.id,
    c."displayName",
    c.company,
    c.emails,
    MAX(ci."interactedAt") as last_interaction,
    COUNT(ci.id) as total_interactions,
    EXTRACT(DAY FROM NOW() - MAX(ci."interactedAt")) as days_since
  FROM unified_contacts c
  LEFT JOIN contact_interactions ci ON ci."contactId" = c.id
  WHERE c."tenantId" = $1
    AND c."isDeleted" = false
  GROUP BY c.id
)
SELECT *
FROM contact_stats
WHERE days_since > $2  -- staleDays parameter
   OR last_interaction IS NULL
ORDER BY
  CASE WHEN last_interaction IS NULL THEN 1 ELSE 0 END,
  days_since DESC
LIMIT $3;
```

### Query 2: Contact Relationship Path (2-hop)

```sql
-- "Who introduced me to Sarah?" (find common contacts)
WITH RECURSIVE contact_path AS (
  -- Base: Direct interactions with target contact
  SELECT
    ci."contactId",
    ci."emailId",
    c."displayName",
    1 as hop,
    ARRAY[ci."contactId"] as path
  FROM contact_interactions ci
  JOIN unified_contacts c ON c.id = ci."contactId"
  WHERE ci."tenantId" = $1
    AND ci."userId" = $2
    AND ci."contactEmail" = $3  -- Target email

  UNION ALL

  -- Recursive: Find contacts in same email threads
  SELECT
    ci2."contactId",
    ci2."emailId",
    c2."displayName",
    cp.hop + 1,
    cp.path || ci2."contactId"
  FROM contact_path cp
  JOIN emails e ON e.id = cp."emailId"
  JOIN contact_interactions ci2 ON ci2."emailId" IN (
    SELECT id FROM emails WHERE "threadId" = e."threadId"
  )
  JOIN unified_contacts c2 ON c2.id = ci2."contactId"
  WHERE cp.hop < 2  -- Max 2 hops
    AND ci2."contactId" != ALL(cp.path)  -- Avoid cycles
)
SELECT DISTINCT ON ("contactId")
  "contactId",
  "displayName",
  hop,
  path
FROM contact_path
WHERE hop > 0
ORDER BY "contactId", hop;
```

### Query 3: Company Relationship Overview

```sql
-- "What's my relationship with Acme Corp?"
SELECT
  c.company,
  COUNT(DISTINCT c.id) as contact_count,
  COUNT(ci.id) as total_emails,
  MAX(ci."interactedAt") as last_interaction,
  SUM(CASE WHEN ci.direction = 'SENT' THEN 1 ELSE 0 END) as sent_count,
  SUM(CASE WHEN ci.direction = 'RECEIVED' THEN 1 ELSE 0 END) as received_count,
  AVG(c."relationshipScore") as avg_relationship_score
FROM unified_contacts c
LEFT JOIN contact_interactions ci ON ci."contactId" = c.id
WHERE c."tenantId" = $1
  AND LOWER(c.company) LIKE LOWER($2)  -- Company name search
  AND c."isDeleted" = false
GROUP BY c.company;
```

---

## API Endpoints

### Location
Add to `backend/src/modules/ai/voltagent/voltagent.controller.ts`

```typescript
// ===========================================================================
// RELATIONSHIP INTELLIGENCE ENDPOINTS (P1.7 - CRM Intelligence)
// ===========================================================================

/**
 * Get stale contacts needing reconnection
 */
@Get('relationships/stale')
@ApiOperation({
  summary: 'Get stale contacts',
  description: 'Returns contacts with no interaction in the specified number of days.',
})
async getStaleContacts(
  @Req() req: AuthenticatedRequest,
  @Query('days') days?: number,
  @Query('limit') limit?: number,
): Promise<{
  success: boolean;
  contacts: StaleContact[];
  total: number;
}>

/**
 * Get contact profile with relationship data
 */
@Get('relationships/contact/:contactId')
@ApiOperation({
  summary: 'Get contact relationship profile',
  description: 'Returns full relationship data for a contact including score, history, and trend.',
})
async getContactProfile(
  @Req() req: AuthenticatedRequest,
  @Param('contactId') contactId: string,
): Promise<{
  success: boolean;
  profile: ContactProfile;
}>

/**
 * Search contacts by email
 */
@Get('relationships/search')
@ApiOperation({
  summary: 'Search contact by email',
  description: 'Find a contact by their email address.',
})
async searchContactByEmail(
  @Req() req: AuthenticatedRequest,
  @Query('email') email: string,
): Promise<{
  success: boolean;
  contact: Contact | null;
}>

/**
 * Get company relationship overview
 */
@Get('relationships/company')
@ApiOperation({
  summary: 'Get company relationship overview',
  description: 'Returns aggregated relationship data for all contacts at a company.',
})
async getCompanyRelationship(
  @Req() req: AuthenticatedRequest,
  @Query('company') company: string,
): Promise<{
  success: boolean;
  overview: CompanyOverview;
}>

/**
 * Trigger interaction backfill job
 */
@Post('relationships/backfill')
@ApiOperation({
  summary: 'Backfill contact interactions',
  description: 'Process existing emails to populate contact interaction history.',
})
async triggerBackfill(
  @Req() req: AuthenticatedRequest,
): Promise<{
  success: boolean;
  jobId: string;
}>

/**
 * Get relationship statistics
 */
@Get('relationships/stats')
@ApiOperation({
  summary: 'Get relationship statistics',
  description: 'Returns overview statistics for relationship intelligence.',
})
async getRelationshipStats(
  @Req() req: AuthenticatedRequest,
): Promise<{
  success: boolean;
  stats: {
    totalContacts: number;
    contactsWithInteractions: number;
    staleContactCount: number;
    avgRelationshipScore: number;
    topCompanies: Array<{ company: string; contactCount: number }>;
  };
}>
```

---

## BullMQ Jobs

### Job 1: Interaction Recording (Real-time)

Triggered during email sync to record interactions.

```typescript
// Queue: 'contact-interactions'
// Job name: 'record-interaction'

interface RecordInteractionJob {
  tenantId: string;
  userId: string;
  emailId: string;
  direction: 'SENT' | 'RECEIVED';
}
```

### Job 2: Reconnect Reminder (Scheduled)

Daily job to check for stale contacts and create reminders.

```typescript
// Queue: 'relationship-intelligence'
// Job name: 'reconnect-check'
// Schedule: Daily at 9:00 AM user's timezone

interface ReconnectCheckJob {
  tenantId: string;
  userId: string;
}

// Creates AiTask items for stale contacts
// Emits WebSocket events for real-time notification
```

### Job 3: Interaction Backfill (One-time)

Process historical emails to populate interactions.

```typescript
// Queue: 'relationship-intelligence'
// Job name: 'backfill-interactions'

interface BackfillJob {
  tenantId: string;
  userId: string;
  batchSize: number;
  cursor?: string;
}
```

---

## Integration with Existing Systems

### 1. Email Sync Integration

Modify `GoogleSyncService` and `MicrosoftSyncService` to emit interaction events:

```typescript
// After storing new email
await this.relationshipQueue.add('record-interaction', {
  tenantId,
  userId,
  emailId: email.id,
  direction: email.folder === 'SENT' ? 'SENT' : 'RECEIVED',
});
```

### 2. UnifiedRetriever Integration

Enhance P1.6 retriever to include relationship context:

```typescript
// In UnifiedRetriever.retrieve()
if (this.isContactQuery(query)) {
  const relationshipContext = await this.relationshipService
    .getRelationshipContext(tenantId, userId, extractedEmail);

  contextParts.push(`\n## Relationship Context\n${relationshipContext}`);
}
```

### 3. Daily Briefing Integration

Include stale contacts in daily briefing:

```typescript
// In DailyBriefingService
const staleContacts = await this.relationshipService.getStaleContacts(
  tenantId, userId, { staleDays: 30, limit: 5 }
);

if (staleContacts.length > 0) {
  sections.push({
    title: 'Reconnect Suggestions',
    content: formatStaleContacts(staleContacts),
  });
}
```

---

## Environment Variables

```env
# ===== RELATIONSHIP INTELLIGENCE (P1.7 - CRM) =====
# Enable/disable relationship tracking
RELATIONSHIP_INTELLIGENCE_ENABLED=true
# Days without contact before considered "stale"
RELATIONSHIP_STALE_DAYS=30
# Days between reconnect reminders for same contact
RELATIONSHIP_REMINDER_COOLDOWN_DAYS=14
# Enable automatic reconnect reminders
RELATIONSHIP_REMINDERS_ENABLED=true
# Maximum contacts to process in backfill batch
RELATIONSHIP_BACKFILL_BATCH_SIZE=100
```

---

## Implementation Plan

### Task 1: Database Migration (1 hour)
- Add `ContactInteraction` model to schema.prisma
- Add new fields to `Contact` model
- Run `npx prisma migrate dev`

### Task 2: RelationshipIntelligenceService (2 hours)
- Create service with core methods
- Implement relationship score algorithm
- Add raw SQL queries for complex operations

### Task 3: Email Sync Integration (1 hour)
- Modify sync services to emit interaction events
- Create BullMQ queue and processor

### Task 4: API Endpoints (1 hour)
- Add endpoints to VoltAgentController
- Create frontend API client methods

### Task 5: Backfill Job (1 hour)
- Create backfill processor
- Add progress tracking via WebSocket

### Task 6: Reconnect Reminders (1 hour)
- Create scheduled job
- Integrate with AiTask and notifications

### Task 7: Testing (1 hour)
- Create test script
- Verify with real data

**Total Estimated Time: 8 hours**

---

## Testing Strategy

### Test Script Location
`backend/scripts/test-relationship-intelligence.ts`

### Test Cases

1. **Interaction Recording**
   - Record interaction for existing contact
   - Record interaction for unknown email (no match)
   - Verify duplicate prevention

2. **Stale Contacts Query**
   - Get contacts > 30 days stale
   - Get contacts never contacted
   - Verify ordering by staleness

3. **Relationship Score**
   - Calculate score for active relationship
   - Calculate score for dormant relationship
   - Verify score updates after interaction

4. **Backfill**
   - Backfill tenant with 100+ emails
   - Verify contact linking accuracy
   - Check performance metrics

---

## Future Enhancements (P2+)

### P2: Advanced Features
- Contact enrichment via external APIs (Clearbit, Hunter.io)
- Meeting tracking (calendar integration)
- Sentiment analysis per contact

### P3: Graph Upgrade Path
When/if Apache AGE becomes available on managed PostgreSQL:
- Migrate ContactInteraction to graph edges
- Enable multi-hop queries (3+ hops)
- Add "path to introduction" feature

---

---

## Schema Optimization Audit

### Existing ContactInteraction Model

Good news! The schema already has a `ContactInteraction` model (lines 1321-1351). However, it needs enhancement for P1.7:

**Current Model:**
```prisma
model ContactInteraction {
  id          String   @id @default(cuid())
  tenantId    String
  contactId   String   // Reference to unified_contacts.id

  type        ContactInteractionType  // EMAIL_SENT, EMAIL_RECEIVED, MEETING, CALL, NOTE
  date        DateTime
  summary     String?
  sentiment   String?

  sourceType  String?
  sourceId    String?

  @@index([tenantId, contactId])
  @@index([tenantId, contactId, date])
}
```

**Missing for P1.7:**
- `userId` field (required for multi-user tenants)
- `emailId` with unique constraint (prevent duplicate interactions)
- Cached contact email (for faster queries)

### Required Schema Changes

```prisma
// MODIFIED: ContactInteraction (add userId, emailId)
model ContactInteraction {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String   // ADD: Required for multi-user tenants
  contactId   String

  type        ContactInteractionType
  date        DateTime
  summary     String?
  sentiment   String?

  sourceType  String?
  sourceId    String?
  emailId     String?  @unique // ADD: Prevent duplicate interactions per email

  // ADD: Cached contact info for query performance
  contactEmail String?
  contactName  String?

  createdAt   DateTime @default(now())

  // ADD: New indexes for P1.7 queries
  @@index([tenantId, userId, contactId])
  @@index([tenantId, userId, date])
  @@index([contactId, date])
  @@index([emailId])
  @@map("contact_interactions")
}

// ADD: New fields to Contact model
model Contact {
  // ... existing fields ...

  // P1.7 Relationship Intelligence (cached metrics)
  lastInteractedAt    DateTime?
  totalInteractions   Int       @default(0)
  sentCount           Int       @default(0)
  receivedCount       Int       @default(0)
  relationshipScore   Float?
  reconnectRemindedAt DateTime?

  // New relation
  interactions ContactInteraction[]
}
```

### Index Optimization Analysis

#### Email Table - Current Indexes
```prisma
@@index([tenantId, folder, receivedAt])           // Good: Folder listing
@@index([tenantId, isRead])                       // Good: Unread filter
@@index([tenantId, threadId])                     // Good: Thread queries
@@index([sentAt])                                 // OK: Sent sorting
@@index([crossProviderLinkId])                    // Good: Cross-provider
@@index([tenantId, hasCalendarInvite])           // Good: Calendar invites
@@index([tenantId, providerId, folder, receivedAt]) // Good: Provider listing
@@index([tenantId, isStarred, receivedAt])       // Good: Starred listing
@@index([tenantId, providerId, isDeleted])       // Good: Deletion queries
```

**Recommended Addition for P1.7:**
```prisma
@@index([tenantId, "from", receivedAt])  // Contact lookup by sender
@@index([tenantId, sentAt])              // Sent email queries (replace sentAt-only index)
```

#### Contact Table - Current Indexes
```prisma
@@index([tenantId, displayName])
@@index([tenantId, lastName, firstName])
@@index([tenantId, company])
@@index([tenantId, displayName, firstName, lastName, company])
```

**Recommended Addition for P1.7:**
```prisma
@@index([tenantId, lastInteractedAt])           // Stale contacts query
@@index([tenantId, relationshipScore])          // Score-based sorting
@@index([tenantId, isDeleted, lastInteractedAt]) // Active stale contacts
```

### Query Performance Estimates

| Query | Current | With New Indexes |
|-------|---------|------------------|
| Stale contacts (30+ days) | Full scan | Index scan ~10ms |
| Contact by email | JSON scan | Denormalized ~5ms |
| Relationship score sort | Full scan | Index scan ~10ms |
| Company overview | Partial index | Optimized ~15ms |

### GIN Index Recommendation

For Contact.emails JSON field (array of email addresses):

```sql
-- Create GIN index for fast email lookups in JSON array
CREATE INDEX idx_contacts_emails_gin ON unified_contacts
USING GIN ((emails::jsonb) jsonb_path_ops);
```

This enables queries like:
```sql
SELECT * FROM unified_contacts
WHERE emails::jsonb @> '["john@acme.com"]'::jsonb;
```

### Migration Strategy

1. **Phase 1:** Add new fields to Contact (non-breaking)
2. **Phase 2:** Add userId, emailId to ContactInteraction
3. **Phase 3:** Create new indexes
4. **Phase 4:** Backfill cached metrics

---

## Sources & References

- [CRM Statistics 2025](https://crm.org/crmland/crm-statistics) - Market data
- [4Degrees Relationship Intelligence](https://www.4degrees.ai/blog/what-is-relationship-intelligence) - Feature inspiration
- [Introhive Guide](https://www.introhive.com/blog/relationship-intelligence-automation/) - CRM automation patterns
- [PostgreSQL as Graph DB](https://www.dylanpaulus.com/posts/postgres-is-a-graph-database/) - Recursive CTE approach
- [Railway PostgreSQL Extensions](https://station.railway.com/feedback/install-postgres-extensions-c815caee) - Production constraints
- [Hetzner PostgreSQL Docs](https://docs.hetzner.com/konsoleh/account-management/databases/postgresql/) - Extension support

---

## Approval

This design document has been reviewed and approved for implementation.

**Implementation Complete:** December 16, 2025

All tasks completed:

- ✅ Task 1: Database Migration
- ✅ Task 2: RelationshipIntelligenceService
- ✅ Task 3: Email Sync Integration (BullMQ jobs)
- ✅ Task 4: API Endpoints (10 endpoints added to VoltAgentController)
- ✅ Task 5: Backfill Job (CrmBackfillProcessor)
- ✅ Task 6: Reconnect Reminders (ReconnectReminderProcessor)
- ✅ Task 7: Testing (8/8 tests passing)
