-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('WAITING_FOR', 'TODO');

-- AlterTable
ALTER TABLE "email_follow_ups" ADD COLUMN "followUpType" "FollowUpType" NOT NULL DEFAULT 'TODO';

-- CreateIndex
CREATE INDEX "email_follow_ups_tenantId_userId_followUpType_idx" ON "email_follow_ups"("tenantId", "userId", "followUpType");
