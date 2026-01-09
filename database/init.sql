-- Enable Citus extension for horizontal sharding
-- Must be first to use shared_preload_libraries
CREATE EXTENSION IF NOT EXISTS citus;

-- Enable pgvector extension for embeddings/RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- Note: Data insertion and indexes are handled by:
-- 1. Prisma migrations (database/migrations/)
-- 2. Prisma seed (backend/prisma/seed.ts)
-- This init.sql file only enables required PostgreSQL extensions
