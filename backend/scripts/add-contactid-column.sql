-- Add contactId column to embeddings table if not exists
-- This enables O(log n) indexed lookups for contact embeddings

DO $$
BEGIN
    -- Add contactId column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'embeddings' AND column_name = 'contactId'
    ) THEN
        ALTER TABLE "embeddings" ADD COLUMN "contactId" TEXT;
        RAISE NOTICE 'Added contactId column';
    ELSE
        RAISE NOTICE 'contactId column already exists';
    END IF;
END $$;
