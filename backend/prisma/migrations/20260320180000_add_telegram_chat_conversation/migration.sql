-- AlterTable
ALTER TABLE "telegram_settings" ADD COLUMN "aiConversationId" TEXT;

-- AddForeignKey
ALTER TABLE "telegram_settings" ADD CONSTRAINT "telegram_settings_aiConversationId_fkey" FOREIGN KEY ("aiConversationId") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
