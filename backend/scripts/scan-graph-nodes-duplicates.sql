-- Phase 150 Open Q9: pre-migration duplicate scan for graph_nodes.
-- Purpose: determine whether the Phase 150 Prisma migration can safely add
-- @@unique([tenantId, nodeType, externalId]) to the GraphNode model.
--
-- USAGE: run as read-only SELECT against BOTH local dev and production.
--   Local: cd backend && psql $DATABASE_URL -f scripts/scan-graph-nodes-duplicates.sql
--   Prod:  Railway Postgres console, paste contents, run.
--
-- DECISION RULE:
--   - Zero rows returned  -> safe. Plan 02 adds @@unique([tenantId, nodeType, externalId]).
--   - Non-zero rows      -> Plan 02 falls back to Landmine §1 Option (b):
--                            find-then-create in $transaction with SELECT FOR UPDATE.
--
-- This script is read-only. No backup required per CLAUDE.md "Backup Before Touch".

SELECT
  "tenantId",
  "nodeType",
  "externalId",
  COUNT(*) AS duplicate_count
FROM "graph_nodes"
GROUP BY "tenantId", "nodeType", "externalId"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, "tenantId", "nodeType", "externalId"
LIMIT 100;
