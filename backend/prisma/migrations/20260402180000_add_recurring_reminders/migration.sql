-- Add recurring reminder fields
ALTER TABLE "reminders" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reminders" ADD COLUMN "recurrenceRule" TEXT;
ALTER TABLE "reminders" ADD COLUMN "recurrenceParentId" TEXT;

-- Self-referencing FK for recurrence series
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_recurrenceParentId_fkey"
  FOREIGN KEY ("recurrenceParentId") REFERENCES "reminders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for querying children of a recurring parent
CREATE INDEX "reminders_recurrenceParentId_idx" ON "reminders"("recurrenceParentId");
