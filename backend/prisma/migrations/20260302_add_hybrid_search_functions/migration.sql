-- Migration: Hybrid search SQL functions with RRF (Reciprocal Rank Fusion)
-- Purpose: Combine pgvector semantic search + tsvector keyword search
-- Formula: rrf_score = fts_weight/(K + fts_rank) + semantic_weight/(K + semantic_rank)
-- Default K=50, equal weights
-- Phase 25 Plan 03: Hybrid Search & RAG
--
-- NOTE: Manual SQL migration. Apply manually: psql -f migration.sql
-- Requires: 20260302_add_tsvector_fts migration applied first

-- =============================================================
-- 1. hybrid_email_search: RRF fusion of vector + FTS for emails
-- =============================================================
CREATE OR REPLACE FUNCTION hybrid_email_search(
  p_tenant_id TEXT,
  p_query TEXT,
  p_embedding vector(1024),
  p_match_count INT DEFAULT 10,
  p_fts_weight FLOAT DEFAULT 1.0,
  p_semantic_weight FLOAT DEFAULT 1.0,
  p_rrf_k INT DEFAULT 50
)
RETURNS TABLE (
  email_id TEXT,
  subject TEXT,
  "from" TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  rrf_score FLOAT
)
LANGUAGE sql STABLE AS $$
  WITH fts_results AS (
    SELECT e.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(e.fts, websearch_to_tsquery('simple', p_query)) DESC
           ) AS rank_ix
    FROM emails e
    WHERE e."tenantId" = p_tenant_id
      AND e.fts @@ websearch_to_tsquery('simple', p_query)
    ORDER BY rank_ix
    LIMIT LEAST(p_match_count * 2, 40)
  ),
  semantic_results AS (
    SELECT emb."emailId" AS id,
           ROW_NUMBER() OVER (
             ORDER BY emb.vector <-> p_embedding
           ) AS rank_ix
    FROM embeddings emb
    WHERE emb."tenantId" = p_tenant_id
      AND emb."emailId" IS NOT NULL
    ORDER BY emb.vector <-> p_embedding
    LIMIT LEAST(p_match_count * 2, 40)
  )
  SELECT
    e.id AS email_id,
    e.subject,
    e."from",
    e.snippet,
    e."receivedAt" AS received_at,
    (COALESCE(1.0 / (p_rrf_k + fts.rank_ix), 0.0) * p_fts_weight +
     COALESCE(1.0 / (p_rrf_k + sem.rank_ix), 0.0) * p_semantic_weight) AS rrf_score
  FROM fts_results fts
  FULL OUTER JOIN semantic_results sem ON fts.id = sem.id
  JOIN emails e ON COALESCE(fts.id, sem.id) = e.id AND e."tenantId" = p_tenant_id
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;

-- =============================================================
-- 2. hybrid_contact_search: RRF fusion of vector + FTS for contacts
-- =============================================================
CREATE OR REPLACE FUNCTION hybrid_contact_search(
  p_tenant_id TEXT,
  p_query TEXT,
  p_embedding vector(1024),
  p_match_count INT DEFAULT 10,
  p_rrf_k INT DEFAULT 50
)
RETURNS TABLE (
  contact_id TEXT,
  display_name TEXT,
  company TEXT,
  job_title TEXT,
  rrf_score FLOAT
)
LANGUAGE sql STABLE AS $$
  WITH fts_results AS (
    SELECT c.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('simple', p_query)) DESC
           ) AS rank_ix
    FROM unified_contacts c
    WHERE c."tenantId" = p_tenant_id
      AND c.fts @@ websearch_to_tsquery('simple', p_query)
    ORDER BY rank_ix
    LIMIT LEAST(p_match_count * 2, 40)
  ),
  semantic_results AS (
    SELECT emb."contactId" AS id,
           ROW_NUMBER() OVER (
             ORDER BY emb.vector <-> p_embedding
           ) AS rank_ix
    FROM embeddings emb
    WHERE emb."tenantId" = p_tenant_id
      AND emb."contactId" IS NOT NULL
    ORDER BY emb.vector <-> p_embedding
    LIMIT LEAST(p_match_count * 2, 40)
  )
  SELECT
    c.id AS contact_id,
    c."displayName" AS display_name,
    c.company,
    c."jobTitle" AS job_title,
    (COALESCE(1.0 / (p_rrf_k + fts.rank_ix), 0.0) +
     COALESCE(1.0 / (p_rrf_k + sem.rank_ix), 0.0)) AS rrf_score
  FROM fts_results fts
  FULL OUTER JOIN semantic_results sem ON fts.id = sem.id
  JOIN unified_contacts c ON COALESCE(fts.id, sem.id) = c.id AND c."tenantId" = p_tenant_id
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;
