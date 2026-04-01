-- Repair KB article search vector state for databases where the trigger exists
-- but the underlying column was never created successfully.

ALTER TABLE kb_articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_kb_articles_search_vector
  ON kb_articles USING GIN (search_vector);

CREATE OR REPLACE FUNCTION kb_article_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.body, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_article_search_vector ON kb_articles;

CREATE TRIGGER trg_kb_article_search_vector
  BEFORE INSERT OR UPDATE OF title, body, tags
  ON kb_articles
  FOR EACH ROW
  EXECUTE FUNCTION kb_article_search_vector_update();

UPDATE kb_articles
SET search_vector =
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(body, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(array_to_string(tags, ' '), '')), 'C')
WHERE search_vector IS NULL;
