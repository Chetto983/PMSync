-- CreateTable
CREATE TABLE "task_smart_views" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_smart_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_smart_views_tenantId_userId_idx" ON "task_smart_views"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "task_smart_views_tenantId_userId_isPinned_idx" ON "task_smart_views"("tenantId", "userId", "isPinned");

-- CreateIndex
CREATE UNIQUE INDEX "task_smart_views_tenantId_userId_name_key" ON "task_smart_views"("tenantId", "userId", "name");

-- AddForeignKey
ALTER TABLE "task_smart_views" ADD CONSTRAINT "task_smart_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_smart_views" ADD CONSTRAINT "task_smart_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
