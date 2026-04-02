-- AlterTable: Remove unused slot time columns from telegram_settings
-- These columns are no longer used after migrating to exact-time notifications (Sprint 01)
ALTER TABLE "telegram_settings" DROP COLUMN IF EXISTS "slotMattina";
ALTER TABLE "telegram_settings" DROP COLUMN IF EXISTS "slotPomeriggio";
ALTER TABLE "telegram_settings" DROP COLUMN IF EXISTS "slotSera";
