-- Add index on contactId (non-concurrent for transaction)
CREATE INDEX IF NOT EXISTS "embeddings_contactId_idx" ON "embeddings" ("contactId");
