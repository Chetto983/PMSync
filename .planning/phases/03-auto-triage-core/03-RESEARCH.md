# Phase 03: Auto-Triage Core - Research

**Researched:** 2026-02-08
**Domain:** AI email prioritization, scoring, VIP management, and behavioral learning
**Confidence:** HIGH

## Summary

Phase 03 research reveals that the codebase already has ~80% of the infrastructure needed. The gap is not technical foundation but rather **activation and wiring** of existing components. The `EmailTriageService`, `AttentionScoreService`, `TriageBackfillSchedulerService`, and `AgentLearningProfile` model all exist and function. The `Email` model already has `aiPriority` (1-5), `aiSentiment`, `aiLabels`, `isAutoTriaged`, and `autoTriagedAt` fields with a `@@index([tenantId, aiPriority])`. The `Contact` model has `isVip` with a `@@index([tenantId, isVip])`, and the `ContactsService` has `toggleVip()` and VIP listing already built. Phase 08's email listing tools already expose triage fields and support triage filter parameters.

What is missing is: (1) TRIAGE-01: The requirement says 0-100 scale, but existing `aiPriority` is 1-5 integer. The roadmap's `priority_score` (0-100) and `importance_level` enum do not exist in the schema. A decision is needed: add a new field or reinterpret. (2) TRIAGE-02: VIP lists exist at the `Contact.isVip` level but there is no AI-suggested VIP feature, no VIP impact on priority scoring beyond `AttentionScoreService`'s in-memory cache, and no user-facing VIP management UI in the triage context. (3) TRIAGE-03: `AgentLearningProfile` and `AgentActionFeedback` exist for HITL actions but there is zero learning from implicit signals (email opens, reply speed, archive patterns) feeding back into triage scoring weights.

**Primary recommendation:** Do NOT add new schema fields. The existing `aiPriority` (1-5 scale) is already wired end-to-end (schema -> tools -> frontend badges -> dashboard widget). Adding a redundant `priority_score` (0-100) would create two competing systems. Instead, treat the 1-5 scale as the canonical priority and build the 0-100 "attention score" as an internal computation that maps to 1-5 for storage. The `AttentionScoreService` already computes a 0.0-1.0 score that maps to 1-5.

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Prisma | 7.x | ORM, Email/Contact models | Already in use |
| BullMQ | 5.x | Background job processing | Already in use (triage-backfill queue) |
| Mistral SDK | Latest | LLM for unified email analysis | Already in use |
| NestJS | 10.x | Backend framework | Already in use |
| TanStack Query | 5.x | Frontend data fetching | Already in use |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | 5.x | Redis connection for BullMQ + caching | Already used by queue.config.ts |
| zod | 3.x | Schema validation for tool parameters | Already used by VoltAgent tools |
| chrono-node | 2.x | NLP date extraction | Already used by Phase 04 |

### No New Dependencies Needed

The entire Phase 03 can be built with existing dependencies. No new npm packages required.

**Installation:** None needed.

## Architecture Patterns

### Recommended Project Structure

New files (max ~3-4 new files, rest is modifications):

```
backend/src/modules/ai/
├── services/
│   ├── email-triage.service.ts          # EXISTS - needs VIP boost integration
│   ├── triage-backfill-scheduler.service.ts  # EXISTS - needs learning weight updates
│   ├── triage-learning.service.ts       # NEW - implicit signal tracking
│   └── email-insights.service.ts        # EXISTS - unified LLM analysis
├── voltagent/
│   ├── services/
│   │   ├── attention-score.service.ts   # EXISTS - needs VIP list integration
│   │   └── learning.service.ts          # EXISTS - HITL learning (extend for triage)
│   └── tools/
│       └── email-rlm.tools.ts           # EXISTS - already has triage filters
└── controllers/
    └── ai.controller.ts                 # EXISTS - has triage endpoints
```

Frontend modifications (no new components, modify existing):

```
frontend/
├── components/
│   ├── email/list/ThreadListItem.tsx    # EXISTS - already renders aiPriority badges
│   └── dashboard/widgets/AiTriageWidget.tsx  # EXISTS - dashboard triage widget
├── hooks/queries/
│   └── use-dashboard.ts                 # EXISTS - has useTriagedEmails hook
└── pages/dashboard/
    └── email.tsx                         # EXISTS - passes aiPriority to ThreadListItem
```

### Pattern 1: Implicit Signal Tracking (TRIAGE-03)

**What:** Track user behavior signals that indicate email importance without explicit feedback
**When to use:** Every time a user opens, replies, archives, or flags an email

**Signals to track:**
```
| Signal | Weight | Interpretation |
|--------|--------|----------------|
| Reply within 1h | +0.3 | High importance sender/topic |
| Reply within 24h | +0.15 | Medium importance |
| Open without reply | +0.05 | Some interest |
| Archive without reading | -0.2 | Low importance sender |
| Flag/Star | +0.25 | Explicit importance signal |
| Delete without reading | -0.3 | Spam/unwanted sender |
| Forward to others | +0.2 | Important enough to share |
```

**Implementation pattern:**
```typescript
// Inject into existing email CRUD operations (email-crud.service.ts)
// NOT a new queue - piggyback on existing action hooks

interface TriageSignal {
  tenantId: string;
  userId: string;
  emailId: string;
  senderEmail: string;
  signalType: 'open' | 'reply' | 'archive' | 'delete' | 'flag' | 'forward';
  responseTimeMs?: number; // Time between receive and action
  timestamp: Date;
}

// Accumulate per-sender stats, update AttentionScoreService weights
// Store in existing Contact.metadata or a lightweight sender_scores table
```

### Pattern 2: VIP Integration with AttentionScoreService

**What:** Feed the existing `Contact.isVip` flag and AI-suggested VIPs into the attention score
**When to use:** During every attention score calculation

```typescript
// AttentionScoreService.scoreSenderImportance() already does this partially:
// - Checks VIP cache (top 20 contacts by relationshipScore >= 50)
// - Returns 1.0 for VIP, 0.5-0.9 for known contacts, 0.3 for unknown

// Enhancement needed:
// - Also check Contact.isVip flag (user-defined VIP)
// - AI-suggested VIPs: contacts with high implicit signal scores
// - Expose VIP suggestions via API endpoint
```

### Pattern 3: Nightly Score Recalculation (Roadmap Requirement)

**What:** Background BullMQ job that recalculates priorities using updated learning weights
**When to use:** Scheduled nightly (or configurable interval)

```typescript
// Extend existing TriageBackfillSchedulerService
// Currently: finds untriaged emails and triggers triage
// Enhancement: also recalculate priorities for triaged emails
// when learning weights have changed significantly

// New job type in existing queue:
interface RecalculationJobData {
  type: 'recalculation';
  tenantId: string;
  reason: 'learning_update' | 'vip_change' | 'scheduled';
}
```

### Anti-Patterns to Avoid

- **Adding priority_score (0-100) to Email model:** Would create two competing priority systems. The existing 1-5 scale is already wired through 6 layers (schema, tools, API, hooks, components, translations). Adding 0-100 means maintaining two fields that must stay in sync.
- **Making triage synchronous during email sync:** The roadmap says "batch during sync" but the existing architecture correctly separates sync from triage. EmailTriageService runs asynchronously via BullMQ. Keep it that way.
- **Building a custom ML pipeline:** The existing LLM-based analysis (EmailInsightsService.analyzeEmailUnified) plus weighted heuristics (AttentionScoreService) is the right approach for this scale. A custom ML model requires training data infrastructure, evaluation pipelines, and model versioning that add months of complexity for marginal improvement over LLM+heuristics.
- **Storing learning signals in Email.metadata JSON:** Use indexed columns or a dedicated lightweight table. JSONB path queries are O(n) full scans (documented in CLAUDE.md as anti-pattern).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Priority scoring engine | Custom ML model | Existing AttentionScoreService + LLM | Already computes 0.0-1.0 score with 5 weighted factors. Map to 1-5 scale. |
| Email analysis | Custom NLP pipeline | Existing EmailInsightsService.analyzeEmailUnified() | Single LLM call returns priority, sentiment, labels, urgency, intent. Already persists to EmailAnalysis table. |
| Background job scheduling | Custom cron/scheduler | Existing TriageBackfillSchedulerService (BullMQ) | Already has queue, worker, repeatable jobs, manual trigger API. |
| VIP contact management | Custom VIP table | Existing Contact.isVip field + ContactsService.toggleVip() | Already has toggle API, index, frontend integration. |
| Feedback loop | Custom event system | Existing AgentLearningProfile + AgentActionFeedback | Already has EMA learning, per-agent profiles, 30/90 day retention. |
| Triage API endpoints | New controller | Existing AiController (POST /ai/triage, GET /ai/triage/backfill/status) | Already has manual trigger, backfill status, backfill trigger endpoints. |

**Key insight:** The delta between "exists" and "TRIAGE-01/02/03 satisfied" is primarily: (a) ensuring the triage pipeline actually runs on new emails, (b) integrating VIP lists into scoring, and (c) tracking implicit signals to close the learning loop. The infrastructure is built; the wiring is missing.

## Common Pitfalls

### Pitfall 1: Dual Priority Systems

**What goes wrong:** Adding `priority_score` (0-100) alongside existing `aiPriority` (1-5) creates two competing fields that must stay in sync. Tools, frontend, and dashboard reference `aiPriority`. Any new field would need to be propagated through all 6 layers.
**Why it happens:** The roadmap says "0-100 scale" but was written before examining the existing schema.
**How to avoid:** Use `AttentionScoreService.score` (0.0-1.0, equivalent to 0-100) as the internal computation. Map to `aiPriority` (1-5) for storage and display. The `aiPriorityReason` field already stores the reasoning.
**Warning signs:** Two different priority values on the same email, frontend showing one but tools filtering by another.

### Pitfall 2: Triage Storm During Sync

**What goes wrong:** If triage triggers synchronously during email sync, a Gmail push notification with 50 new emails triggers 50 LLM calls simultaneously, overwhelming the Mistral API and blocking the sync pipeline.
**Why it happens:** Eagerness to populate triage data immediately.
**How to avoid:** The existing architecture is correct: triage runs asynchronously via TriageBackfillSchedulerService (BullMQ). The sync pipeline should only set `isAutoTriaged = false` on new emails. The backfill scheduler picks them up on its next run (configurable, default 1 hour).
**Warning signs:** Sync latency spikes, Mistral 429 errors, emails taking minutes to appear.

### Pitfall 3: Ignoring Existing HITL Learning Infrastructure

**What goes wrong:** Building a separate learning system for triage when AgentLearningProfile already provides per-user, per-action-type learning with EMA and confidence adjustment.
**Why it happens:** The learning system is in `voltagent/observability/learning.ts` and `voltagent/services/learning.service.ts`, not obviously connected to triage.
**How to avoid:** Extend the existing LearningService to also track "triage_priority" as an action type. When a user manually changes an email's priority, record it as feedback. The existing EMA decay and confidence boost math apply directly.
**Warning signs:** Two parallel learning systems with different data stores and different update frequencies.

### Pitfall 4: VIP Cache Invalidation

**What goes wrong:** AttentionScoreService has a 5-minute VIP cache. If a user adds a VIP contact, emails from that contact may not get VIP treatment for up to 5 minutes.
**Why it happens:** In-memory cache without event-driven invalidation.
**How to avoid:** Call `AttentionScoreService.clearVipCache(tenantId)` from `ContactsService.toggleVip()`. This connection does not exist yet.
**Warning signs:** User adds VIP, but next email from that contact gets low priority.

### Pitfall 5: Learning Signal Volume

**What goes wrong:** Tracking every email open/archive as a learning signal generates massive write volume. For a user with 100 emails/day, that is 100+ signal writes per day.
**Why it happens:** Naive implementation that writes a DB row for every action.
**How to avoid:** Batch signals in memory (5-minute window), then flush aggregated sender-level stats. Don't store individual signals - store running averages per sender.
**Warning signs:** Database write pressure, sender_scores table growing unbounded.

## Code Examples

### Existing Triage Pipeline (Already Working)

```typescript
// Source: backend/src/modules/ai/services/email-triage.service.ts
// This already works end-to-end:

// 1. Pre-filter with AttentionScore (saves 30-50% LLM calls)
if (this.attentionScore) {
  const preFilterResult = await this.preFilterWithAttentionScore(emailId, tenantId, locale);
  if (preFilterResult) return preFilterResult; // Skip LLM for low-priority
}

// 2. Full LLM analysis for important emails
const analysis = await this.emailInsights.analyzeEmailUnified(tenantId, emailId, locale, {
  includeSmartReplies: false,
});

// Returns: priority (1-5), labels, sentiment, urgency, keyTopics, etc.
// Automatically persists to Email.aiPriority, Email.aiLabels, etc.
```

### Existing VIP Toggle (Already Working)

```typescript
// Source: backend/src/modules/contacts/services/contacts.service.ts
async toggleVip(tenantId: string, contactId: string) {
  const contact = await this.prisma.contact.findUnique({...});
  const updated = await this.prisma.contact.update({
    where: { id_tenantId: { id: contactId, tenantId } },
    data: { isVip: !contact.isVip },
  });
  // MISSING: clearVipCache() call to AttentionScoreService
}
```

### Existing Backfill Scheduler (Already Working)

```typescript
// Source: backend/src/modules/ai/services/triage-backfill-scheduler.service.ts
// BullMQ repeatable job, configurable interval, manual trigger API
// Finds untriaged emails, processes via EmailTriageService
// MISSING: recalculation mode for updating stale priorities
```

### Existing Frontend Badge (Already Working)

```typescript
// Source: frontend/components/email/list/ThreadListItem.tsx
// Only shows badge for priority <= 3 (critical/high/medium)
{thread.aiPriority && thread.aiPriority <= 3 && (
  <Chip
    icon={<Zap size={12} />}
    label={thread.aiPriority}
    color={AI_PRIORITY_CONFIG[thread.aiPriority]?.color || 'default'}
  />
)}
```

### Implicit Signal Tracking (NEW - Pattern)

```typescript
// New: backend/src/modules/ai/services/triage-learning.service.ts
// Lightweight service that aggregates user behavior per sender

interface SenderScore {
  senderEmail: string;
  replyRate: number;       // % of emails replied to
  avgReplyTimeMs: number;  // Average time to reply
  archiveWithoutReadRate: number;
  flagRate: number;
  totalEmails: number;
  lastUpdated: Date;
}

// Store in Contact.metadata or dedicated JSON field
// Update on flush (every 5 minutes or on module destroy)
// Feed into AttentionScoreService.scoreSenderImportance()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rule-based spam filters | LLM-powered unified analysis | 2024-2025 | Single LLM call replaces multiple classifiers |
| Separate priority/sentiment/label models | Unified prompt returning all insights | 2025 | EmailInsightsService.analyzeEmailUnified() |
| User-explicit training | Implicit signal learning | 2024-2025 | Learn from opens, replies, archives without asking |
| Static VIP lists | AI-suggested VIPs from behavior | 2025 | Combine user-defined + AI-detected high-importance senders |

**Deprecated/outdated:**
- Building custom ML models for email priority (LLM+heuristics is simpler and competitive)
- Separate API calls for priority, sentiment, labels (consolidated into single unified analysis call)

## Existing Infrastructure Inventory

This section maps exactly what exists vs what needs to be built for each requirement.

### TRIAGE-01: Priority Scoring

| Component | Status | File | Notes |
|-----------|--------|------|-------|
| Email.aiPriority field (1-5) | EXISTS | schema.prisma:371 | With @@index |
| Email.aiPriorityReason | EXISTS | schema.prisma:372 | Stores reasoning |
| Email.isAutoTriaged flag | EXISTS | schema.prisma:375 | Tracks processed state |
| Email.autoTriagedAt timestamp | EXISTS | schema.prisma:376 | When triaged |
| AttentionScoreService (0.0-1.0 weighted scoring) | EXISTS | attention-score.service.ts | 5 factors, maps to 1-5 |
| EmailTriageService (orchestrator) | EXISTS | email-triage.service.ts | Pre-filter + LLM path |
| EmailInsightsService.analyzeEmailUnified() | EXISTS | email-insights.service.ts | Single LLM call |
| TriageBackfillSchedulerService (BullMQ) | EXISTS | triage-backfill-scheduler.service.ts | Hourly repeatable job |
| AiController triage endpoints | EXISTS | ai.controller.ts | POST /ai/triage, GET /status |
| UserPreferences.aiAutoTriageEnabled | EXISTS | schema.prisma:109 | User opt-in |
| Subscription feature gate (PROFESSIONAL+) | EXISTS | email-triage.service.ts:159-184 | Plan check |
| Frontend ThreadListItem badge | EXISTS | ThreadListItem.tsx:268-284 | Priority <= 3 shown |
| Frontend AiTriageWidget | EXISTS | AiTriageWidget.tsx | Dashboard widget |
| Frontend useTriagedEmails hook | EXISTS | use-dashboard.ts:755+ | TanStack Query |
| Tool filters (priority, sentiment, label) | EXISTS | email-rlm.tools.ts:86-89 | VoltAgent tool params |
| **MISSING: Triage actually running on new emails** | GAP | - | Backfill scheduler exists but pipeline may not be active |
| **MISSING: VIP boost in AttentionScoreService** | GAP | - | Uses relationshipScore but not Contact.isVip |

### TRIAGE-02: VIP Lists

| Component | Status | File | Notes |
|-----------|--------|------|-------|
| Contact.isVip field | EXISTS | schema.prisma:738 | Boolean with @@index |
| ContactsService.toggleVip() | EXISTS | contacts.service.ts:567 | Toggle API |
| ContactsController PATCH /:id/vip | EXISTS | contacts.controller.ts:210 | REST endpoint |
| VIP cache in AttentionScoreService | EXISTS | attention-score.service.ts:429 | Top 20 by relationshipScore |
| Frontend VIP badge on contacts | EXISTS | ContactListItem.tsx | Shows VIP indicator |
| **MISSING: AI-suggested VIP contacts** | GAP | - | Need endpoint suggesting VIPs from behavior |
| **MISSING: VIP cache invalidation on toggle** | GAP | - | clearVipCache not called from toggleVip |
| **MISSING: Contact.isVip feeding into attention score** | GAP | - | Only relationshipScore checked, not isVip flag |

### TRIAGE-03: Learning from User Actions

| Component | Status | File | Notes |
|-----------|--------|------|-------|
| AgentLearningProfile model | EXISTS | schema.prisma:1210 | EMA-based profiles |
| AgentActionFeedback model | EXISTS | schema.prisma:1238 | 30-day retention |
| LearningService | EXISTS | learning.service.ts | Persists HITL feedback |
| Learning observability hooks | EXISTS | observability/learning.ts | EMA math, boost/penalty |
| ContactInteraction model | EXISTS | schema.prisma:1076 | Tracks email/meeting interactions |
| Contact.receivedCount/sentCount | EXISTS | schema.prisma:743-746 | Per-contact email counts |
| Contact.relationshipScore | EXISTS | schema.prisma:744 | Computed score |
| **MISSING: Implicit signal tracking** | GAP | - | No tracking of open/reply/archive patterns |
| **MISSING: Learning feedback loop to triage** | GAP | - | No mechanism updates triage weights from signals |
| **MISSING: Nightly weight recalculation** | GAP | - | Backfill exists but no recalculation mode |

## Open Questions

1. **Priority Scale Decision**
   - What we know: Roadmap says 0-100, schema has 1-5, frontend renders 1-5
   - What's unclear: Whether to add a new 0-100 field or keep 1-5
   - Recommendation: Keep 1-5 as canonical. The 0.0-1.0 attention score IS the 0-100 score internally. Adding a new field creates maintenance burden for zero user-visible benefit. The 1-5 scale maps cleanly to importance levels (1=Critical, 2=High, 3=Medium, 4=Low, 5=Minimal).

2. **importance_level Enum**
   - What we know: Roadmap mentions "New importance_level enum: HIGH, MEDIUM, LOW"
   - What's unclear: Whether this is needed given aiPriority 1-5 already maps to importance
   - Recommendation: Skip the enum. The 1-5 integer maps directly: 1-2=HIGH, 3=MEDIUM, 4-5=LOW. Adding an enum creates another field to sync. The frontend already does this mapping via AI_PRIORITY_CONFIG.

3. **Learning Signal Storage**
   - What we know: Need to track open/reply/archive patterns per sender
   - What's unclear: Whether to use Contact.metadata JSON, a new table, or Redis
   - Recommendation: Add a lightweight `sender_triage_scores` approach using the existing Contact model. Store aggregated sender behavior scores (reply rate, response time, archive rate) in a small dedicated Prisma model or as computed fields on Contact. Avoid Contact.metadata JSON (JSONB anti-pattern per CLAUDE.md).

4. **Triage Activation Trigger**
   - What we know: TriageBackfillSchedulerService runs on a timer. EmailTriageService can be triggered manually.
   - What's unclear: Should triage trigger on every sync, or only on backfill schedule?
   - Recommendation: Keep the current async backfill pattern. Add a lightweight "new emails arrived" event that bumps the next backfill run sooner (e.g., within 5 minutes instead of waiting for the hourly schedule). This gives near-real-time triage without coupling to sync.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/prisma/schema.prisma` - Email model with triage fields (lines 329-407)
- Codebase analysis: `backend/src/modules/ai/services/email-triage.service.ts` - Full triage pipeline (820 lines)
- Codebase analysis: `backend/src/modules/ai/voltagent/services/attention-score.service.ts` - Weighted scoring (477 lines)
- Codebase analysis: `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` - BullMQ scheduler (335 lines)
- Codebase analysis: `backend/src/modules/ai/voltagent/services/learning.service.ts` - HITL learning (200 lines)
- Codebase analysis: `backend/src/modules/contacts/services/contacts.service.ts` - VIP toggle and listing
- Codebase analysis: `frontend/components/email/list/ThreadListItem.tsx` - Priority badge rendering
- Codebase analysis: `.planning/research/FEATURES.md` - Competitor research (Superhuman, Shortwave)
- Codebase analysis: `.planning/v3.0-MILESTONE-AUDIT.md` - Gap identification

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` - Phase 03 requirements and technical approach
- `.planning/STATE.md` - Accumulated decisions affecting Phase 03

### Tertiary (LOW confidence)
- FEATURES.md cites Superhuman 94% accuracy at 2 weeks - unverifiable internal metric
- FEATURES.md cites 150% faster processing - marketing claim, not independently verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use
- Architecture: HIGH - Verified by reading existing source code, not hypothesized
- Pitfalls: HIGH - Identified from actual code review (VIP cache invalidation gap, dual priority systems)
- Gap analysis: HIGH - Verified by comparing TRIAGE-01/02/03 requirements against actual codebase

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable - no external dependency changes expected)
