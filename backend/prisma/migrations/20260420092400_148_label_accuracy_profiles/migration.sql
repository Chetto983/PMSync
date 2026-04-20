-- CreateTable
CREATE TABLE "label_accuracy_profiles" (
    "tenantId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "tp" INTEGER NOT NULL DEFAULT 0,
    "fp" INTEGER NOT NULL DEFAULT 0,
    "fn" INTEGER NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "f1" DOUBLE PRECISION,
    "wilsonPrecLow" DOUBLE PRECISION,
    "wilsonPrecHigh" DOUBLE PRECISION,
    "wilsonRecLow" DOUBLE PRECISION,
    "wilsonRecHigh" DOUBLE PRECISION,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_accuracy_profiles_pkey" PRIMARY KEY ("tenantId","labelId","windowKey")
);

-- CreateTable
CREATE TABLE "label_accuracy_source_breakdowns" (
    "tenantId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "triageSource" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "tp" INTEGER NOT NULL DEFAULT 0,
    "fp" INTEGER NOT NULL DEFAULT 0,
    "fn" INTEGER NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "f1" DOUBLE PRECISION,
    "wilsonPrecLow" DOUBLE PRECISION,
    "wilsonPrecHigh" DOUBLE PRECISION,
    "wilsonRecLow" DOUBLE PRECISION,
    "wilsonRecHigh" DOUBLE PRECISION,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_accuracy_source_breakdowns_pkey" PRIMARY KEY ("tenantId","labelId","triageSource","windowKey")
);

-- CreateIndex
CREATE INDEX "label_accuracy_profiles_tenantId_labelId_idx" ON "label_accuracy_profiles"("tenantId", "labelId");

-- CreateIndex
CREATE INDEX "label_accuracy_profiles_tenantId_windowKey_idx" ON "label_accuracy_profiles"("tenantId", "windowKey");

-- CreateIndex
CREATE INDEX "label_accuracy_source_breakdowns_tenantId_labelId_idx" ON "label_accuracy_source_breakdowns"("tenantId", "labelId");

-- CreateIndex
CREATE INDEX "label_accuracy_source_breakdowns_tenantId_triageSource_idx" ON "label_accuracy_source_breakdowns"("tenantId", "triageSource");

-- AddForeignKey
ALTER TABLE "label_accuracy_profiles" ADD CONSTRAINT "label_accuracy_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_accuracy_source_breakdowns" ADD CONSTRAINT "label_accuracy_source_breakdowns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
