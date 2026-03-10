-- AlterTable: Add admin columns to users (ban support)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banReason" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP(3);

-- AlterTable: Add impersonation tracking to sessions
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;
