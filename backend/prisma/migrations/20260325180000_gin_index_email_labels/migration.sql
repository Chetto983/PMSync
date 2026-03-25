-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "emails_labels_idx" ON "emails" USING GIN ("labels");
