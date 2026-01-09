-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'embeddings_contactId_fkey'
    ) THEN
        ALTER TABLE "embeddings"
        ADD CONSTRAINT "embeddings_contactId_fkey"
        FOREIGN KEY ("contactId") REFERENCES "unified_contacts"("id") ON DELETE CASCADE;
        RAISE NOTICE 'Added contactId FK constraint';
    ELSE
        RAISE NOTICE 'contactId FK constraint already exists';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add FK constraint: %', SQLERRM;
END $$;
