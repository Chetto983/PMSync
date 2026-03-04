-- AlterTable: Add fromHash column to emails table
ALTER TABLE "emails" ADD COLUMN "fromHash" TEXT;

-- CreateIndex: B-tree index on [tenantId, fromHash] for exact-match sender lookup
-- NOTE: In production, use CREATE INDEX CONCURRENTLY to avoid locking the table.
-- Prisma migrate dev does not support CONCURRENTLY, so we use a standard CREATE INDEX here.
CREATE INDEX "emails_tenantId_fromHash_idx" ON "emails"("tenantId", "fromHash");
