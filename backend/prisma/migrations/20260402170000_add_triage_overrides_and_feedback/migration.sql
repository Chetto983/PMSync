-- CreateTable
CREATE TABLE "triage_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_triage_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_triage_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "triage_overrides_tenantId_idx" ON "triage_overrides"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "triage_overrides_tenantId_type_pattern_key" ON "triage_overrides"("tenantId", "type", "pattern");

-- CreateIndex
CREATE INDEX "email_triage_feedback_tenantId_type_idx" ON "email_triage_feedback"("tenantId", "type");

-- CreateIndex
CREATE INDEX "email_triage_feedback_tenantId_createdAt_idx" ON "email_triage_feedback"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "triage_overrides" ADD CONSTRAINT "triage_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_triage_feedback" ADD CONSTRAINT "email_triage_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
