-- AlterTable
ALTER TABLE "email_analyses" ADD COLUMN     "triageSource" TEXT;

-- AlterTable
ALTER TABLE "email_triage_feedback" ADD COLUMN     "signal" TEXT NOT NULL DEFAULT 'edit';

-- CreateIndex
CREATE INDEX "email_triage_feedback_tenantId_signal_createdAt_idx" ON "email_triage_feedback"("tenantId", "signal", "createdAt");
