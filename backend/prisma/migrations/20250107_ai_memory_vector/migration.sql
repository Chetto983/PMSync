-- AI Memory Semantic Vector Search
-- Adds vector column and HNSW index for fast similarity search
-- Migration: 20250107_ai_memory_vector

-- pgvector extension should already exist from 20250106_hnsw_vector_index
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column for semantic embeddings (mistral-embed: 1024 dimensions)
ALTER TABLE "ai_memories" ADD COLUMN IF NOT EXISTS "vector" vector(1024);

-- Create HNSW index for fast cosine similarity search
-- Parameters tuned for memory workload (smaller dataset than emails):
-- m=16: connections per node (good balance of recall vs memory)
-- ef_construction=64: build quality (higher = better index, slower build)
CREATE INDEX IF NOT EXISTS "ai_memories_vector_hnsw_idx"
  ON "ai_memories"
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Add partial index for non-null vectors (optimization)
CREATE INDEX IF NOT EXISTS "ai_memories_vector_notnull_idx"
  ON "ai_memories" (id)
  WHERE vector IS NOT NULL;

-- GIN trigram index for hybrid text search fallback
CREATE INDEX IF NOT EXISTS "ai_memories_content_gin_idx"
  ON "ai_memories"
  USING gin (content gin_trgm_ops);
