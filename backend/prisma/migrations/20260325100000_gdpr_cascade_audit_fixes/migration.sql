-- GDPR Cascade Audit Fixes
-- Ensures all user/tenant data cascades on deletion per GDPR Art. 17 (Right to Erasure)
-- Idempotent: DROP IF EXISTS before ADD to handle partial applies

-- 1. AuditLog.userId: Restrict -> SetNull (preserve audit trail, anonymize user)
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. WritingStyleProfile.providerId: Restrict -> SetNull
ALTER TABLE "writing_style_profiles" DROP CONSTRAINT IF EXISTS "writing_style_profiles_providerId_fkey";
ALTER TABLE "writing_style_profiles" ADD CONSTRAINT "writing_style_profiles_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. EmailSignature.providerId: Restrict -> SetNull
ALTER TABLE "email_signatures" DROP CONSTRAINT IF EXISTS "email_signatures_providerId_fkey";
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. AiDraftFeedback: Add missing FK relations to tenant and user
ALTER TABLE "ai_draft_feedback" DROP CONSTRAINT IF EXISTS "ai_draft_feedback_tenantId_fkey";
ALTER TABLE "ai_draft_feedback" ADD CONSTRAINT "ai_draft_feedback_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_draft_feedback" DROP CONSTRAINT IF EXISTS "ai_draft_feedback_userId_fkey";
ALTER TABLE "ai_draft_feedback" ADD CONSTRAINT "ai_draft_feedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. AiRunLedger: Clean orphaned rows then add missing FK relations
DELETE FROM "ai_run_ledger" WHERE "tenantId" NOT IN (SELECT id FROM "tenants");
DELETE FROM "ai_run_ledger" WHERE "userId" NOT IN (SELECT id FROM "users");
ALTER TABLE "ai_run_ledger" DROP CONSTRAINT IF EXISTS "ai_run_ledger_tenantId_fkey";
ALTER TABLE "ai_run_ledger" ADD CONSTRAINT "ai_run_ledger_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_run_ledger" DROP CONSTRAINT IF EXISTS "ai_run_ledger_userId_fkey";
ALTER TABLE "ai_run_ledger" ADD CONSTRAINT "ai_run_ledger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. PasswordResetToken: Add missing FK relation to tenant
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_tenantId_fkey";
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. EmailFollowUp: Add missing FK relations to tenant and user
ALTER TABLE "email_follow_ups" DROP CONSTRAINT IF EXISTS "email_follow_ups_tenantId_fkey";
ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_follow_ups" DROP CONSTRAINT IF EXISTS "email_follow_ups_userId_fkey";
ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. TelegramSettings: Add missing FK relation to tenant
ALTER TABLE "telegram_settings" DROP CONSTRAINT IF EXISTS "telegram_settings_tenantId_fkey";
ALTER TABLE "telegram_settings" ADD CONSTRAINT "telegram_settings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
