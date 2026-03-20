-- Fix: hybrid_email_search and hybrid_contact_search return NUMERIC for rrf_score
-- but function signature declares DOUBLE PRECISION. PostgreSQL 18 is strict about this.
-- Solution: cast the arithmetic expression to DOUBLE PRECISION.

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
  rrf_score DOUBLE PRECISION
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
      (COALESCE(1.0 / (k + v.rank), 0) + COALESCE(1.0 / (k + f.rank), 0))::DOUBLE PRECISION AS score
    FROM vector_results v
    FULL OUTER JOIN fts_results f ON v.eid = f.eid
  )
  SELECT
    c.eid AS email_id,
    e.subject,
    e."from",
    e.snippet,
    e."receivedAt" AS received_at,
    c.score AS rrf_score
  FROM combined c
  JOIN emails e ON e.id = c.eid AND e."tenantId" = p_tenant_id
  ORDER BY c.score DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION hybrid_contact_search(
  p_tenant_id TEXT,
  p_query TEXT,
  p_embedding vector,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  contact_id TEXT,
  display_name TEXT,
  company TEXT,
  job_title TEXT,
  rrf_score DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  k CONSTANT INT := 60; -- RRF constant
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      emb."contactId" AS cid,
      ROW_NUMBER() OVER (ORDER BY emb.vector <=> p_embedding) AS rank
    FROM embeddings emb
    WHERE emb."tenantId" = p_tenant_id
      AND emb."contactId" IS NOT NULL
      AND emb.vector IS NOT NULL
    ORDER BY emb.vector <=> p_embedding
    LIMIT p_limit * 3
  ),
  fts_results AS (
    SELECT
      c.id AS cid,
      ROW_NUMBER() OVER (ORDER BY ts_rank(
        to_tsvector('simple', COALESCE(c."displayName", '') || ' ' || COALESCE(c.company, '') || ' ' || COALESCE(c."jobTitle", '')),
        plainto_tsquery('simple', p_query)
      ) DESC) AS rank
    FROM unified_contacts c
    WHERE c."tenantId" = p_tenant_id
      AND to_tsvector('simple', COALESCE(c."displayName", '') || ' ' || COALESCE(c.company, '') || ' ' || COALESCE(c."jobTitle", ''))
          @@ plainto_tsquery('simple', p_query)
    LIMIT p_limit * 3
  ),
  combined AS (
    SELECT
      COALESCE(v.cid, f.cid) AS cid,
      (COALESCE(1.0 / (k + v.rank), 0) + COALESCE(1.0 / (k + f.rank), 0))::DOUBLE PRECISION AS score
    FROM vector_results v
    FULL OUTER JOIN fts_results f ON v.cid = f.cid
  )
  SELECT
    c.cid AS contact_id,
    ct."displayName" AS display_name,
    ct.company,
    ct."jobTitle" AS job_title,
    c.score AS rrf_score
  FROM combined c
  JOIN unified_contacts ct ON ct.id = c.cid AND ct."tenantId" = p_tenant_id
  ORDER BY c.score DESC
  LIMIT p_limit;
END;
$$;
