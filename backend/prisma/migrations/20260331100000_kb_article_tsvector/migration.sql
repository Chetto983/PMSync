-- Add tsvector column for full-text search on KB articles
-- Uses 'simple' configuration for language-agnostic tokenization (MVP).

-- 1. Add the search_vector column (not managed by Prisma)
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_kb_articles_search_vector
  ON kb_articles USING GIN (search_vector);

-- 3. Create trigger function to auto-update search_vector on insert/update
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

-- 4. Create trigger on insert/update
DROP TRIGGER IF EXISTS trg_kb_article_search_vector ON kb_articles;
CREATE TRIGGER trg_kb_article_search_vector
  BEFORE INSERT OR UPDATE OF title, body, tags
  ON kb_articles
  FOR EACH ROW
  EXECUTE FUNCTION kb_article_search_vector_update();
