-- AlterTable: Add structured wizard fields to user_labels
ALTER TABLE "user_labels" ADD COLUMN "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_labels" ADD COLUMN "contents" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_labels" ADD COLUMN "actionType" TEXT NOT NULL DEFAULT 'none';
