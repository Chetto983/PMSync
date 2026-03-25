-- GDPR Cascade Audit Round 2
-- Fixes 5 remaining orphaned FK fields without @relation

-- 1. ProviderConfig.userId: Add FK with SetNull (provider config survives user deletion)
ALTER TABLE "provider_configs" DROP CONSTRAINT IF EXISTS "provider_configs_userId_fkey";
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. CalendarPreference: Add missing FK relations to tenant and provider
ALTER TABLE "calendar_preferences" DROP CONSTRAINT IF EXISTS "calendar_preferences_tenantId_fkey";
ALTER TABLE "calendar_preferences" ADD CONSTRAINT "calendar_preferences_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_preferences" DROP CONSTRAINT IF EXISTS "calendar_preferences_providerId_fkey";
ALTER TABLE "calendar_preferences" ADD CONSTRAINT "calendar_preferences_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. WritingStyleProfile.tenantId: Add missing FK relation to tenant
ALTER TABLE "writing_style_profiles" DROP CONSTRAINT IF EXISTS "writing_style_profiles_tenantId_fkey";
ALTER TABLE "writing_style_profiles" ADD CONSTRAINT "writing_style_profiles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. AIMemory.userId: Add missing FK relation to user
ALTER TABLE "ai_memories" DROP CONSTRAINT IF EXISTS "ai_memories_userId_fkey";
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. CrmActivity.tenantId: Add missing FK relation to tenant
ALTER TABLE "crm_activities" DROP CONSTRAINT IF EXISTS "crm_activities_tenantId_fkey";
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
