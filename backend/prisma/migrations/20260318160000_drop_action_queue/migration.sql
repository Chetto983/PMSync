-- Phase 77: Drop ActionQueue infrastructure (replaced by AI SDK native HITL)
-- Drop table first (references the enums), then drop the enums

-- Drop the action_queue table and all its indexes
DROP TABLE IF EXISTS "action_queue" CASCADE;

-- Drop the ActionType enum
DROP TYPE IF EXISTS "ActionType" CASCADE;

-- Drop the ActionStatus enum
DROP TYPE IF EXISTS "ActionStatus" CASCADE;
