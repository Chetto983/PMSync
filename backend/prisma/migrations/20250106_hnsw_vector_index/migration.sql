-- HNSW Vector Index Migration
-- Purpose: Optimize vector similarity search for RAG queries at scale (1000+ users)
--
-- HNSW (Hierarchical Navigable Small World) provides:
-- - O(log n) search complexity vs O(n) for brute force
-- - 10-50x faster at 100k+ vectors
-- - Minimal accuracy loss (~95-99% recall)
--
-- Requirements:
-- - pgvector extension (already enabled)
-- - Explicit vector dimensions for HNSW index creation

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- Set explicit dimensions on vector column (required for HNSW)
-- Mistral-embed uses 1024 dimensions
-- NOTE: This is safe - existing NULL values remain NULL, existing vectors are validated
ALTER TABLE "embeddings"
  ALTER COLUMN vector TYPE vector(1024);

-- Create HNSW index for cosine similarity search
-- Parameters tuned for production workloads:
-- - m=16: connections per node (higher = better recall, more memory)
-- - ef_construction=64: construction quality (higher = better index, slower build)
-- NOTE: In production with large data, run CONCURRENTLY outside Prisma transaction
CREATE INDEX IF NOT EXISTS "embeddings_vector_hnsw_idx"
  ON "embeddings"
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Comment explaining the index
COMMENT ON INDEX "embeddings_vector_hnsw_idx" IS
  'HNSW index for O(log n) vector similarity search. m=16, ef_construction=64. Use probes=10-40 for accuracy/speed tradeoff.';

-- Performance tuning note:
-- At query time, set ef_search for accuracy vs speed tradeoff:
-- SET hnsw.ef_search = 40;  -- Higher = more accurate, slower (default: 40)
-- SET hnsw.ef_search = 100; -- For maximum recall (production RAG)

-- Trigram index on embedding content for hybrid search (keyword fallback)
-- Enables ILIKE '%keyword%' searches with GIN index acceleration
-- NOTE: In production with large data, run CONCURRENTLY outside Prisma transaction
CREATE INDEX IF NOT EXISTS "embeddings_content_gin_idx"
  ON "embeddings"
  USING gin (content gin_trgm_ops);

COMMENT ON INDEX "embeddings_content_gin_idx" IS
  'GIN trigram index for hybrid search - combines with vector similarity for better recall.';
