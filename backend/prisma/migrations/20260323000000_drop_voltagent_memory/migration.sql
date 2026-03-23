-- Drop legacy VoltAgent memory tables (VoltAgent fully removed from codebase)
-- These tables have zero code references and contain only orphaned data.

DROP TABLE IF EXISTS "voltagent_memory_steps" CASCADE;
DROP TABLE IF EXISTS "voltagent_memory_messages" CASCADE;
DROP TABLE IF EXISTS "voltagent_memory_workflow_states" CASCADE;
DROP TABLE IF EXISTS "voltagent_memory_conversations" CASCADE;
DROP TABLE IF EXISTS "voltagent_memory_users" CASCADE;
