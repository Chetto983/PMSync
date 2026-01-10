-- Add Auto-Triage fields to Email model (Superhuman-like feature)
-- COST CONTROLS:
-- - Only processes emails < 24h old
-- - Max 20 per batch
-- - Skips junk/spam/trash

-- Add AI triage fields to emails table
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "aiPriority" INTEGER;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "aiPriorityReason" TEXT;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "aiLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "isAutoTriaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "autoTriagedAt" TIMESTAMP(3);

-- Add auto-triage preference to user_preferences
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "aiAutoTriageEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient querying of untriaged emails
CREATE INDEX IF NOT EXISTS "emails_auto_triage_idx" ON "emails"("tenantId", "isAutoTriaged", "receivedAt") WHERE "isAutoTriaged" = false;

-- Comment for documentation
COMMENT ON COLUMN "emails"."aiPriority" IS 'AI-calculated priority 1-5 (1=highest)';
COMMENT ON COLUMN "emails"."aiPriorityReason" IS 'Explanation for AI priority assignment';
COMMENT ON COLUMN "emails"."aiLabels" IS 'AI-suggested labels for categorization';
COMMENT ON COLUMN "emails"."isAutoTriaged" IS 'Whether AI auto-triage has processed this email';
COMMENT ON COLUMN "emails"."autoTriagedAt" IS 'Timestamp when auto-triage ran';
COMMENT ON COLUMN "user_preferences"."aiAutoTriageEnabled" IS 'Enable AI auto-triage for new emails (off by default)';
