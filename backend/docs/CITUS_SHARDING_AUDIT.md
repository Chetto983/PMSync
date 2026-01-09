# Citus Sharding Audit - MailAgent

## Current Status: ✅ PHASE 2 COMPLETE (2026-01-09)

| Component | Status | Version |
|-----------|--------|---------|
| PostgreSQL | ✅ | 15 |
| Citus Extension | ✅ | 13.2.0 |
| pgvector Extension | ✅ | 0.5.1 |
| Composite PKs | ✅ | Applied (5 tables) |
| tenantId Columns | ✅ | Added to 8 child tables |
| **Raw SQL Audit** | ✅ | **All 18 files verified** |
| **JSONB → Direct Fields** | ✅ | **3 files fixed** |
| Stress Tests | ✅ | 15/15 passing |
| RAG Isolation | ✅ | 6/6 passing |

### Docker Image
```
mailagent-postgres:citus-pgvector (built from database/Dockerfile.postgres)
```

### Phase 2 Fixes (2026-01-09)

**JSONB → Direct Field Migration:**
- `knowledge-base.service.ts` (lines 760, 782): Changed `emb.metadata ->> 'emailId'` to `emb."emailId"`
- `embedding-backfill-scheduler.service.ts` (2 occurrences): Same fix

**Raw SQL tenantId Fixes:**
- `base-email-sync.service.ts` (line 835): Added `AND "tenantId" = ${tenantId}` to UPDATE
- `ai-memory.service.ts` (line 435): Added `AND "tenantId" = ${tenantId}` to UPDATE
- `base-contacts-sync.service.ts` (line 389): Added `WHERE "tenantId" = ${provider.tenantId}` to UPDATE
- `sync.worker.ts` (lines 371-387): Added tenantId to folder count UPDATE + subqueries

**Auth Cache:** Already implemented with tenant-isolated Redis keys (`${tenantId}:${sessionId}`)

### Next Step
Run `distribute-citus-tables.sql` when ready to shard (after adding worker nodes).

---

## Overview

**Goal:** Shard tables by `tenantId` for horizontal scaling using Citus PostgreSQL extension.

**Why `tenantId`?**
- Multi-tenant SaaS: each tenant's data is logically isolated
- Queries ALWAYS filter by `tenantId` (guaranteed by application layer)
- Co-location: All data for a tenant lives on the same shard = fast joins

## Citus Requirements

### 1. Primary Keys MUST Include Distribution Column

```sql
-- ❌ WRONG (current)
CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  ...
);

-- ✅ CORRECT (Citus-ready)
CREATE TABLE emails (
  id TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  ...,
  PRIMARY KEY (id, tenantId)  -- Composite PK
);
```

### 2. Unique Constraints MUST Include Distribution Column

```sql
-- ❌ WRONG (current)
@@unique([providerId, externalId])

-- ✅ CORRECT (Citus-ready)
@@unique([tenantId, providerId, externalId])
```

### 3. Foreign Keys MUST Reference Composite Keys

```sql
-- ❌ WRONG (current)
FOREIGN KEY (emailId) REFERENCES emails(id)

-- ✅ CORRECT (Citus-ready)
FOREIGN KEY (tenantId, emailId) REFERENCES emails(tenantId, id)
```

---

## Current Schema Audit

### ❌ Tables with Single-Column Primary Key (BLOCKERS)

| Table | Current PK | Required PK | Impact |
|-------|------------|-------------|--------|
| `emails` | `id` | `(id, tenantId)` | **HIGH** |
| `embeddings` | `id` | `(id, tenantId)` | **HIGH** |
| `unified_contacts` | `id` | `(id, tenantId)` | **HIGH** |
| `folders` | `id` | `(id, tenantId)` | Medium |
| `calendar_events` | `id` | `(id, tenantId)` | Medium |
| `provider_configs` | `id` | `(id, tenantId)` | Medium |
| `email_attachments` | `id` | `(id, tenantId)` | Low |
| `email_labels` | `id` | `(id, tenantId)` | Low |
| `user_labels` | `id` | `(id, tenantId)` | Low |

### ❌ Unique Constraints Missing `tenantId` (BLOCKERS)

| Table | Current Constraint | Required | Notes |
|-------|-------------------|----------|-------|
| `emails` | `(providerId, externalId)` | `(tenantId, providerId, externalId)` | Provider already scoped to tenant, but Citus needs explicit |
| `folders` | `(providerId, path)` | `(tenantId, providerId, path)` | Same |
| `calendar_events` | `(providerId, externalId)` | `(tenantId, providerId, externalId)` | Same |
| `provider_contacts` | `(providerId, externalId)` | `(tenantId, providerId, externalId)` | Same |
| `webhook_subscriptions` | `(providerId, resourcePath)` | `(tenantId, providerId, resourcePath)` | Same |
| `calendar_sync_state` | `(providerId, calendarId)` | `(tenantId, providerId, calendarId)` | Same |

### ✅ Already Citus-Ready Constraints

| Table | Constraint | Status |
|-------|------------|--------|
| `emails` | `(tenantId, messageId, folder)` | ✅ OK |
| `user_labels` | `(tenantId, slug)` | ✅ OK |
| `document_libraries` | `(tenantId, name)` | ✅ OK |
| `writing_style_profiles` | `(tenantId, userId)` | ✅ OK |
| `agent_learning_profiles` | `(tenantId, userId, agentName, actionType)` | ✅ OK |
| `calendar_preferences` | `(tenantId, providerId, calendarId)` | ✅ OK |
| `email_cross_provider_links` | `(tenantId, contentHash)` | ✅ OK |

---

## Migration Strategy

### Phase 1: Schema Preparation (BEFORE Citus)

**1.1 Add composite primary keys:**

```sql
-- Step 1: Drop existing PKs and FKs
-- Step 2: Add composite PKs
ALTER TABLE emails DROP CONSTRAINT emails_pkey;
ALTER TABLE emails ADD PRIMARY KEY (id, "tenantId");

ALTER TABLE embeddings DROP CONSTRAINT embeddings_pkey;
ALTER TABLE embeddings ADD PRIMARY KEY (id, "tenantId");

ALTER TABLE unified_contacts DROP CONSTRAINT unified_contacts_pkey;
ALTER TABLE unified_contacts ADD PRIMARY KEY (id, "tenantId");
```

**1.2 Update unique constraints:**

```sql
-- Add tenantId to provider-scoped unique constraints
ALTER TABLE emails
  DROP CONSTRAINT IF EXISTS "emails_providerId_externalId_key",
  ADD CONSTRAINT "emails_tenantId_providerId_externalId_key"
  UNIQUE ("tenantId", "providerId", "externalId");

ALTER TABLE folders
  DROP CONSTRAINT IF EXISTS "folders_providerId_path_key",
  ADD CONSTRAINT "folders_tenantId_providerId_path_key"
  UNIQUE ("tenantId", "providerId", path);

-- Repeat for calendar_events, provider_contacts, webhook_subscriptions, calendar_sync_state
```

**1.3 Update foreign key references:**

```sql
-- Update all FK references to use composite keys
-- Example for email_attachments:
ALTER TABLE email_attachments
  DROP CONSTRAINT IF EXISTS "email_attachments_emailId_fkey",
  ADD COLUMN "tenantId" TEXT NOT NULL,
  ADD CONSTRAINT "email_attachments_email_fkey"
  FOREIGN KEY ("tenantId", "emailId")
  REFERENCES emails("tenantId", id)
  ON DELETE CASCADE;
```

### Phase 2: Install Citus

```sql
-- On PostgreSQL with Citus extension
CREATE EXTENSION IF NOT EXISTS citus;

-- Verify
SELECT * FROM citus_version();
```

### Phase 3: Distribute Tables

```sql
-- Distribute by tenantId (must be done in order - references first)
SELECT create_distributed_table('tenants', 'id');  -- Reference table OR local

-- Main data tables
SELECT create_distributed_table('emails', 'tenantId');
SELECT create_distributed_table('embeddings', 'tenantId');
SELECT create_distributed_table('unified_contacts', 'tenantId');
SELECT create_distributed_table('folders', 'tenantId');
SELECT create_distributed_table('calendar_events', 'tenantId');
SELECT create_distributed_table('provider_configs', 'tenantId');

-- Child tables (co-located automatically via FK)
SELECT create_distributed_table('email_attachments', 'tenantId');
SELECT create_distributed_table('email_labels', 'tenantId');
SELECT create_distributed_table('email_analyses', 'tenantId');
```

### Phase 4: Co-location Verification

```sql
-- Verify tables are co-located by tenantId
SELECT
  logicalrelid::regclass AS table_name,
  partmethod,
  partkey
FROM pg_dist_partition
WHERE partkey LIKE '%tenantId%';
```

---

## Prisma Considerations

### Current Prisma Limitations

Prisma doesn't natively support composite primary keys in all operations. Workarounds:

**Option A: Use `@@id` with composite key**
```prisma
model Email {
  id        String
  tenantId  String
  // ... other fields

  @@id([id, tenantId])  // Composite PK
}
```

**Option B: Raw SQL for complex queries**
```typescript
// For updates that need to specify tenant
await prisma.$executeRaw`
  UPDATE emails SET ... WHERE id = ${id} AND "tenantId" = ${tenantId}
`;
```

### Prisma 7.2+ Features (Already Using)

- `@@unique` with multiple columns ✅
- Raw SQL queries for vector operations ✅
- Transaction support ✅

---

## Application Changes Required

### 1. All Queries MUST Include `tenantId`

Already enforced by our codebase pattern:
```typescript
// ✅ Current pattern (Citus-ready)
await prisma.email.findMany({
  where: { tenantId, ... }
});
```

### 2. Joins Must Be Co-located

```sql
-- ✅ GOOD: Join on same tenant
SELECT e.*, a.*
FROM emails e
JOIN email_attachments a ON e.id = a."emailId" AND e."tenantId" = a."tenantId"
WHERE e."tenantId" = 'xxx';

-- ❌ BAD: Cross-tenant join (will fail or be slow)
SELECT e.*, a.*
FROM emails e
JOIN email_attachments a ON e.id = a."emailId"
-- Missing tenantId join condition
```

### 3. Raw SQL Updates

Current raw SQL already includes `tenantId`:
```typescript
// embeddings.service.ts - already Citus-ready
await prisma.$queryRaw`
  SELECT * FROM embeddings
  WHERE "tenantId" = ${tenantId} AND ...
`;
```

---

## Rollout Plan

| Phase | Duration | Risk | Reversibility |
|-------|----------|------|---------------|
| 1. Schema prep (dev) | 1 week | Low | Full |
| 2. Schema prep (prod) | 1 day | Medium | Complex |
| 3. Citus install | 1 hour | Low | Remove extension |
| 4. Distribute tables | 2-4 hours | **HIGH** | Requires backup restore |
| 5. Verify & test | 1 week | Low | - |

### Rollback Plan

**Before Phase 4:**
- Standard Prisma migration rollback

**After Phase 4:**
- Restore from backup (distributed tables can't be "undistributed" easily)
- Always take full backup before `create_distributed_table()`

---

## Monitoring & Observability

### Key Metrics Post-Citus

```sql
-- Shard distribution health
SELECT
  nodename,
  COUNT(*) as shard_count,
  pg_size_pretty(SUM(shard_size)) as total_size
FROM citus_shards
GROUP BY nodename;

-- Query routing (should all be tenant-specific)
SELECT
  query,
  calls,
  mean_time
FROM pg_stat_statements
WHERE query LIKE '%tenantId%'
ORDER BY calls DESC
LIMIT 20;
```

### Alert Conditions

1. Cross-shard queries > 1% of total
2. Shard imbalance > 20%
3. Replication lag > 1 second

---

## Estimated Effort

| Task | Effort | Skill |
|------|--------|-------|
| Schema audit & fix | 16h | Backend |
| Prisma migration | 8h | Backend |
| Application audit | 4h | Backend |
| Citus setup (staging) | 4h | DevOps |
| Testing | 8h | QA |
| Production rollout | 4h | DevOps |
| **Total** | **44h** | - |

---

## Decision Matrix

| Factor | Proceed Now | Defer to 100K tenants |
|--------|-------------|----------------------|
| Current scale | 1 tenant (dev) | Not needed |
| Complexity | High | - |
| Risk | Medium | None |
| ROI | Low (now) | High (later) |

**Recommendation:** Prepare schema NOW (add `tenantId` to constraints), but defer Citus distribution until:
- 10+ tenants active
- >1M emails in system
- Query latency degradation observed
