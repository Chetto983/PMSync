-- Citus Table Distribution Script for MailAgent
-- Run AFTER composite PKs are in place (migration 20250109_citus_composite_pks)
--
-- IMPORTANT: This script distributes tables across Citus cluster nodes
-- For single-node dev: creates local shards (still validates schema)
-- For production: enables horizontal scaling across worker nodes

-- ============================================================================
-- STEP 1: Verify Citus extension is loaded
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citus') THEN
    RAISE EXCEPTION 'Citus extension not installed. Run: CREATE EXTENSION citus;';
  END IF;
  RAISE NOTICE '✅ Citus extension verified: %', (SELECT citus_version());
END $$;

-- ============================================================================
-- STEP 2: Reference Tables (small, replicated to ALL nodes)
-- These tables are copied to every node for efficient JOINs
-- ============================================================================

-- Tenants table - small, referenced by everything
SELECT create_reference_table('tenants');

-- Users table - small, frequently JOINed
SELECT create_reference_table('users');

-- Labels - shared across emails
SELECT create_reference_table('user_labels');

-- ============================================================================
-- STEP 3: Distributed Tables (sharded by tenantId)
-- These are the large tables that benefit from horizontal sharding
-- ============================================================================

-- Primary data tables
SELECT create_distributed_table('emails', 'tenantId');
SELECT create_distributed_table('unified_contacts', 'tenantId');
SELECT create_distributed_table('folders', 'tenantId');
SELECT create_distributed_table('calendar_events', 'tenantId');
SELECT create_distributed_table('embeddings', 'tenantId');

-- Provider configs (per-tenant)
SELECT create_distributed_table('provider_configs', 'tenantId');

-- Child tables (co-located with parents via same distribution key)
SELECT create_distributed_table('email_attachments', 'tenantId', colocate_with => 'emails');
SELECT create_distributed_table('email_labels', 'tenantId', colocate_with => 'emails');
SELECT create_distributed_table('email_analyses', 'tenantId', colocate_with => 'emails');
SELECT create_distributed_table('email_follow_ups', 'tenantId', colocate_with => 'emails');
SELECT create_distributed_table('action_queue', 'tenantId', colocate_with => 'emails');

-- Contact-related tables
SELECT create_distributed_table('provider_contacts', 'tenantId', colocate_with => 'unified_contacts');
SELECT create_distributed_table('deals', 'tenantId', colocate_with => 'unified_contacts');
SELECT create_distributed_table('contact_interactions', 'tenantId', colocate_with => 'unified_contacts');

-- Calendar attachments
SELECT create_distributed_table('calendar_event_attachments', 'tenantId', colocate_with => 'calendar_events');

-- AI/Memory tables
SELECT create_distributed_table('ai_memories', 'tenantId');
SELECT create_distributed_table('agent_learning_profiles', 'tenantId');
SELECT create_distributed_table('agent_action_feedback', 'tenantId');

-- User preferences (co-located with users for JOINs)
SELECT create_distributed_table('user_preferences', 'tenantId');
SELECT create_distributed_table('dashboard_preferences', 'tenantId');
SELECT create_distributed_table('mfa_secrets', 'tenantId');
SELECT create_distributed_table('mfa_backup_codes', 'tenantId');

-- ============================================================================
-- STEP 4: Verify Distribution
-- ============================================================================
DO $$
DECLARE
  dist_count INTEGER;
  ref_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dist_count
  FROM pg_dist_partition
  WHERE partmethod = 'h';  -- hash distributed

  SELECT COUNT(*) INTO ref_count
  FROM pg_dist_partition
  WHERE partmethod = 'n';  -- reference (replicated)

  RAISE NOTICE '✅ Distribution complete: % distributed tables, % reference tables', dist_count, ref_count;
END $$;

-- Show distribution summary
SELECT
  logicalrelid::regclass AS table_name,
  CASE partmethod
    WHEN 'h' THEN 'distributed'
    WHEN 'n' THEN 'reference'
    ELSE partmethod::text
  END AS type,
  partkey AS distribution_column
FROM pg_dist_partition
ORDER BY type, table_name;
