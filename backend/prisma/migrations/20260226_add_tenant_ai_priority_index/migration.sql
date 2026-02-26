-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "emails_tenantId_aiPriority_idx" ON "emails"("tenantId", "aiPriority");
