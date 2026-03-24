-- AlterFunction: hybrid_email_search
-- Add thread_id and ai_priority to return columns for heuristic reranking (Graph RAG Step 2).
-- Must DROP first because PostgreSQL cannot change return type of existing function.

DROP FUNCTION IF EXISTS hybrid_email_search(TEXT, TEXT, vector, INT);

CREATE OR REPLACE FUNCTION hybrid_email_search(
  p_tenant_id TEXT,
  p_query TEXT,
  p_embedding vector,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  email_id TEXT,
  subject TEXT,
  "from" TEXT,
  snippet TEXT,
  received_at TIMESTAMP(3),
  rrf_score DOUBLE PRECISION,
  thread_id TEXT,
  ai_priority TEXT
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  k CONSTANT INT := 60; -- RRF constant
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      emb."emailId" AS eid,
      ROW_NUMBER() OVER (ORDER BY emb.vector <=> p_embedding) AS rank
    FROM embeddings emb
    WHERE emb."tenantId" = p_tenant_id
      AND emb."emailId" IS NOT NULL
      AND emb.vector IS NOT NULL
    ORDER BY emb.vector <=> p_embedding
    LIMIT p_limit * 3
  ),
  fts_results AS (
    SELECT
      e.id AS eid,
      ROW_NUMBER() OVER (ORDER BY ts_rank(
        to_tsvector('simple', COALESCE(e.subject, '') || ' ' || COALESCE(e.snippet, '')),
        plainto_tsquery('simple', p_query)
      ) DESC) AS rank
    FROM emails e
    WHERE e."tenantId" = p_tenant_id
      AND to_tsvector('simple', COALESCE(e.subject, '') || ' ' || COALESCE(e.snippet, ''))
          @@ plainto_tsquery('simple', p_query)
    LIMIT p_limit * 3
  ),
  combined AS (
    SELECT
      COALESCE(v.eid, f.eid) AS eid,
      COALESCE(1.0 / (k + v.rank), 0) + COALESCE(1.0 / (k + f.rank), 0) AS score
    FROM vector_results v
    FULL OUTER JOIN fts_results f ON v.eid = f.eid
  )
  SELECT
    c.eid AS email_id,
    e.subject,
    e."from",
    e.snippet,
    e."receivedAt" AS received_at,
    c.score AS rrf_score,
    e."threadId" AS thread_id,
    ea.priority::TEXT AS ai_priority
  FROM combined c
  JOIN emails e ON e.id = c.eid AND e."tenantId" = p_tenant_id
  LEFT JOIN email_analyses ea ON ea."emailId" = c.eid AND ea."tenantId" = p_tenant_id
  ORDER BY c.score DESC
  LIMIT p_limit;
END;
$$;
