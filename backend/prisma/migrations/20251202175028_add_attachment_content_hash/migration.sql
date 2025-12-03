/*
  Warnings:

  - You are about to drop the column `messageId` on the `embeddings` table. All the data in the column will be lost.
  - You are about to drop the `chat_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contacts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `messages` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_userId_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_providerId_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_embeddingId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_userId_fkey";

-- AlterTable
ALTER TABLE "email_attachments" ADD COLUMN     "contentHash" TEXT;

-- AlterTable
ALTER TABLE "embeddings" DROP COLUMN "messageId";

-- DropTable
DROP TABLE "chat_sessions";

-- DropTable
DROP TABLE "contacts";

-- DropTable
DROP TABLE "messages";

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderOrders" JSONB,
    "sidebarSmartFiltersExpanded" BOOLEAN NOT NULL DEFAULT true,
    "sidebarLabelsExpanded" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT DEFAULT 'light',
    "language" TEXT DEFAULT 'en',
    "timezone" TEXT DEFAULT 'UTC',
    "emailDensity" TEXT DEFAULT 'comfortable',
    "aiSmartRepliesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiSummarizationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiSchedulingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiAutoApproveThreshold" DOUBLE PRECISION DEFAULT 0.9,
    "jobTitle" TEXT,
    "jobRole" TEXT DEFAULT 'OTHER',
    "department" TEXT,
    "industry" TEXT,
    "companySize" TEXT DEFAULT 'SMB',
    "communicationStyle" TEXT DEFAULT 'CASUAL',
    "responseLength" TEXT DEFAULT 'MODERATE',
    "workingHoursStart" TEXT DEFAULT '09:00',
    "workingHoursEnd" TEXT DEFAULT '18:00',
    "workingDays" TEXT[] DEFAULT ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI']::TEXT[],
    "proactivityLevel" TEXT DEFAULT 'MEDIUM',
    "notificationFrequency" TEXT DEFAULT 'DIGEST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_emails" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "references" TEXT,
    "attachments" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_attachments" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageType" TEXT NOT NULL DEFAULT 's3',
    "storagePath" TEXT,
    "fileUrl" TEXT,
    "fileId" TEXT,
    "iconLink" TEXT,
    "isGoogleDrive" BOOLEAN NOT NULL DEFAULT false,
    "isOneDrive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unified_contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "middleName" TEXT,
    "nickname" TEXT,
    "prefix" TEXT,
    "suffix" TEXT,
    "emails" JSONB,
    "phoneNumbers" JSONB,
    "addresses" JSONB,
    "company" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "birthday" TIMESTAMP(3),
    "anniversary" TIMESTAMP(3),
    "websites" JSONB,
    "socialProfiles" JSONB,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoUrl" TEXT,
    "photoEtag" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "unified_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_contacts" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "contactGroup" TEXT,
    "rawData" JSONB,
    "firstName" TEXT,
    "lastName" TEXT,
    "middleName" TEXT,
    "displayName" TEXT,
    "nickname" TEXT,
    "prefix" TEXT,
    "suffix" TEXT,
    "emails" JSONB,
    "phoneNumbers" JSONB,
    "addresses" JSONB,
    "company" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "birthday" TIMESTAMP(3),
    "anniversary" TIMESTAMP(3),
    "websites" JSONB,
    "socialProfiles" JSONB,
    "notes" TEXT,
    "photoUrl" TEXT,
    "photoEtag" TEXT,
    "vCardVersion" TEXT DEFAULT '4.0',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "eTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "provider_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_pending_actions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "adjustedConfidence" DOUBLE PRECISION,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reasoningSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "agent_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_action_feedback" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "wasApproved" BOOLEAN NOT NULL,
    "wasExecuted" BOOLEAN NOT NULL,
    "wasSuccessful" BOOLEAN,
    "originalConfidence" DOUBLE PRECISION NOT NULL,
    "adjustedConfidence" DOUBLE PRECISION,
    "userFeedback" TEXT,
    "userRating" INTEGER,
    "executionTimeMs" INTEGER,
    "errorMessage" TEXT,
    "contextSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_action_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_learning_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "agentName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "autoExecutedCount" INTEGER NOT NULL DEFAULT 0,
    "avgOriginalConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "avgAdjustedConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastLearningAt" TIMESTAMP(3),
    "confidenceBoost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_learning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "bucket" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "operation" TEXT NOT NULL,
    "promptId" TEXT,
    "promptName" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "agentName" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile_embeddings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL DEFAULT 'PREFERENCE',
    "content" TEXT NOT NULL,
    "vector" vector,
    "source" TEXT NOT NULL DEFAULT 'INFERRED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "category" TEXT,
    "expiresAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_style_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avgSentenceLength" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "avgParagraphLines" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "avgWordsPerEmail" INTEGER NOT NULL DEFAULT 100,
    "bulletListRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formalityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "contractionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "emojiRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "typeTokenRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "exclamationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "questionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ellipsisRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "greetingPresent" BOOLEAN NOT NULL DEFAULT true,
    "preferredGreetings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signOffPresent" BOOLEAN NOT NULL DEFAULT true,
    "preferredSignOffs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentimentPolarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "empathyPhraseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hedgeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "lastAnalyzedEmailId" TEXT,
    "lastAnalyzed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voltagent_conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "isSummarized" BOOLEAN NOT NULL DEFAULT false,
    "summaryUpToIndex" INTEGER,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voltagent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voltagent_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "messageIndex" INTEGER NOT NULL,
    "tokenCount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voltagent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "vector" vector,
    "startMessageIndex" INTEGER NOT NULL,
    "endMessageIndex" INTEGER NOT NULL,
    "messageCountCovered" INTEGER NOT NULL,
    "keyFacts" JSONB,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summaryTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "scheduled_emails_tenantId_status_scheduledAt_idx" ON "scheduled_emails"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "scheduled_emails_scheduledAt_status_idx" ON "scheduled_emails"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "calendar_event_attachments_eventId_idx" ON "calendar_event_attachments"("eventId");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_displayName_idx" ON "unified_contacts"("tenantId", "displayName");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_lastName_firstName_idx" ON "unified_contacts"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_company_idx" ON "unified_contacts"("tenantId", "company");

-- CreateIndex
CREATE INDEX "provider_contacts_contactId_idx" ON "provider_contacts"("contactId");

-- CreateIndex
CREATE INDEX "provider_contacts_tenantId_idx" ON "provider_contacts"("tenantId");

-- CreateIndex
CREATE INDEX "provider_contacts_tenantId_displayName_idx" ON "provider_contacts"("tenantId", "displayName");

-- CreateIndex
CREATE INDEX "provider_contacts_contactGroup_idx" ON "provider_contacts"("contactGroup");

-- CreateIndex
CREATE UNIQUE INDEX "provider_contacts_providerId_externalId_key" ON "provider_contacts"("providerId", "externalId");

-- CreateIndex
CREATE INDEX "agent_pending_actions_tenantId_status_idx" ON "agent_pending_actions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "agent_pending_actions_tenantId_userId_status_idx" ON "agent_pending_actions"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "agent_pending_actions_sessionId_idx" ON "agent_pending_actions"("sessionId");

-- CreateIndex
CREATE INDEX "agent_pending_actions_createdAt_idx" ON "agent_pending_actions"("createdAt");

-- CreateIndex
CREATE INDEX "agent_pending_actions_expiresAt_idx" ON "agent_pending_actions"("expiresAt");

-- CreateIndex
CREATE INDEX "agent_action_feedback_tenantId_agentName_idx" ON "agent_action_feedback"("tenantId", "agentName");

-- CreateIndex
CREATE INDEX "agent_action_feedback_userId_actionType_idx" ON "agent_action_feedback"("userId", "actionType");

-- CreateIndex
CREATE INDEX "agent_action_feedback_wasApproved_idx" ON "agent_action_feedback"("wasApproved");

-- CreateIndex
CREATE INDEX "agent_action_feedback_createdAt_idx" ON "agent_action_feedback"("createdAt");

-- CreateIndex
CREATE INDEX "agent_action_feedback_actionId_idx" ON "agent_action_feedback"("actionId");

-- CreateIndex
CREATE INDEX "agent_learning_profiles_tenantId_idx" ON "agent_learning_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "agent_learning_profiles_agentName_actionType_idx" ON "agent_learning_profiles"("agentName", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "agent_learning_profiles_tenantId_userId_agentName_actionTyp_key" ON "agent_learning_profiles"("tenantId", "userId", "agentName", "actionType");

-- CreateIndex
CREATE INDEX "prompt_templates_tenantId_name_isActive_idx" ON "prompt_templates"("tenantId", "name", "isActive");

-- CreateIndex
CREATE INDEX "prompt_templates_name_locale_isActive_idx" ON "prompt_templates"("name", "locale", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_tenantId_name_version_locale_bucket_key" ON "prompt_templates"("tenantId", "name", "version", "locale", "bucket");

-- CreateIndex
CREATE INDEX "llm_usage_logs_tenantId_createdAt_idx" ON "llm_usage_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_logs_tenantId_operation_idx" ON "llm_usage_logs"("tenantId", "operation");

-- CreateIndex
CREATE INDEX "llm_usage_logs_agentName_createdAt_idx" ON "llm_usage_logs"("agentName", "createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_logs_promptName_createdAt_idx" ON "llm_usage_logs"("promptName", "createdAt");

-- CreateIndex
CREATE INDEX "user_profile_embeddings_tenantId_userId_idx" ON "user_profile_embeddings"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "user_profile_embeddings_tenantId_userId_memoryType_idx" ON "user_profile_embeddings"("tenantId", "userId", "memoryType");

-- CreateIndex
CREATE INDEX "user_profile_embeddings_tenantId_userId_category_idx" ON "user_profile_embeddings"("tenantId", "userId", "category");

-- CreateIndex
CREATE INDEX "user_profile_embeddings_expiresAt_idx" ON "user_profile_embeddings"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "writing_style_profiles_userId_key" ON "writing_style_profiles"("userId");

-- CreateIndex
CREATE INDEX "writing_style_profiles_tenantId_userId_idx" ON "writing_style_profiles"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_style_profiles_tenantId_userId_key" ON "writing_style_profiles"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "voltagent_conversations_tenantId_userId_lastActiveAt_idx" ON "voltagent_conversations"("tenantId", "userId", "lastActiveAt");

-- CreateIndex
CREATE INDEX "voltagent_conversations_tenantId_userId_isDeleted_idx" ON "voltagent_conversations"("tenantId", "userId", "isDeleted");

-- CreateIndex
CREATE INDEX "voltagent_messages_conversationId_messageIndex_idx" ON "voltagent_messages"("conversationId", "messageIndex");

-- CreateIndex
CREATE INDEX "voltagent_messages_tenantId_userId_createdAt_idx" ON "voltagent_messages"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "voltagent_messages_tenantId_createdAt_idx" ON "voltagent_messages"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_summaries_conversationId_idx" ON "conversation_summaries"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_summaries_tenantId_userId_idx" ON "conversation_summaries"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_attachments" ADD CONSTRAINT "calendar_event_attachments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unified_contacts" ADD CONSTRAINT "unified_contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_contacts" ADD CONSTRAINT "provider_contacts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "unified_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_contacts" ADD CONSTRAINT "provider_contacts_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_contacts" ADD CONSTRAINT "provider_contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_pending_actions" ADD CONSTRAINT "agent_pending_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_action_feedback" ADD CONSTRAINT "agent_action_feedback_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "agent_pending_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_action_feedback" ADD CONSTRAINT "agent_action_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile_embeddings" ADD CONSTRAINT "user_profile_embeddings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_style_profiles" ADD CONSTRAINT "writing_style_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voltagent_messages" ADD CONSTRAINT "voltagent_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "voltagent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "voltagent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
