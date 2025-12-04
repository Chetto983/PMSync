/*
  Warnings:

  - You are about to drop the `mfa_codes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "mfa_codes" DROP CONSTRAINT "mfa_codes_userId_fkey";

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "calendarInviteData" JSONB,
ADD COLUMN     "calendarInviteStatus" TEXT,
ADD COLUMN     "hasCalendarInvite" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "mfa_codes";

-- CreateTable
CREATE TABLE "mfa_secrets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_backup_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "location" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_secrets_userId_key" ON "mfa_secrets"("userId");

-- CreateIndex
CREATE INDEX "mfa_secrets_userId_idx" ON "mfa_secrets"("userId");

-- CreateIndex
CREATE INDEX "mfa_backup_codes_userId_isUsed_idx" ON "mfa_backup_codes"("userId", "isUsed");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_deviceToken_key" ON "trusted_devices"("deviceToken");

-- CreateIndex
CREATE INDEX "trusted_devices_userId_idx" ON "trusted_devices"("userId");

-- CreateIndex
CREATE INDEX "trusted_devices_deviceToken_idx" ON "trusted_devices"("deviceToken");

-- CreateIndex
CREATE INDEX "trusted_devices_expiresAt_idx" ON "trusted_devices"("expiresAt");

-- CreateIndex
CREATE INDEX "emails_tenantId_hasCalendarInvite_idx" ON "emails"("tenantId", "hasCalendarInvite");

-- AddForeignKey
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
