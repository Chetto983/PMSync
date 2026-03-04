-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('WAITING_FOR', 'TODO');

-- CreateEnum
CREATE TYPE "LabelType" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('PREFERENCE', 'FACT', 'PATTERN', 'INTERACTION', 'CONTACT_NOTE');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'REMINDED', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmailPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('SALES_INQUIRY', 'SUPPORT_REQUEST', 'MEETING_REQUEST', 'FOLLOW_UP', 'NEWSLETTER', 'AUTOMATED', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'URGENT');

-- CreateEnum
CREATE TYPE "DealSignal" AS ENUM ('NEW_LEAD', 'INTEREST_SHOWN', 'OBJECTION', 'NEGOTIATION', 'READY_TO_BUY', 'CHURNING');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('SEND_EMAIL', 'SCHEDULE_MEETING', 'CREATE_TASK', 'UPDATE_CONTACT', 'UPDATE_DEAL', 'ADD_LABEL', 'ARCHIVE_EMAIL', 'SNOOZE_EMAIL', 'CREATE_CONTACT', 'DELETE_CONTACT', 'DELETE_EMAIL', 'REPLY_EMAIL', 'FORWARD_EMAIL');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'AUTO_APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isMfaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
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
    "aiAutoTriageEnabled" BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE "dashboard_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_secrets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
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
    "tenantId" TEXT NOT NULL,
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
    "tenantId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "credentialDeviceType" TEXT NOT NULL DEFAULT 'singleDevice',
    "credentialBackedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aaguid" TEXT,
    "deviceName" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "providerType" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "supportsEmail" BOOLEAN NOT NULL DEFAULT true,
    "supportsCalendar" BOOLEAN NOT NULL DEFAULT false,
    "supportsContacts" BOOLEAN NOT NULL DEFAULT false,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenEncryptionIv" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapUsername" TEXT,
    "imapPassword" TEXT,
    "imapEncryptionIv" TEXT,
    "imapUseTls" BOOLEAN NOT NULL DEFAULT true,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUsername" TEXT,
    "smtpPassword" TEXT,
    "smtpEncryptionIv" TEXT,
    "smtpUseTls" BOOLEAN NOT NULL DEFAULT true,
    "caldavUrl" TEXT,
    "caldavUsername" TEXT,
    "caldavPassword" TEXT,
    "caldavEncryptionIv" TEXT,
    "carddavUrl" TEXT,
    "carddavUsername" TEXT,
    "carddavPassword" TEXT,
    "carddavEncryptionIv" TEXT,
    "metadata" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avgActivityRate" DOUBLE PRECISION DEFAULT 0.0,
    "syncPriority" INTEGER DEFAULT 3,
    "nextSyncAt" TIMESTAMP(3),
    "emailsReceivedLast24h" INTEGER DEFAULT 0,
    "errorStreak" INTEGER DEFAULT 0,
    "lastActivityCheck" TIMESTAMP(3),
    "refreshTokenEncryptionIv" TEXT,
    "scope" TEXT,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "threadId" TEXT,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "snippet" TEXT,
    "folder" TEXT NOT NULL DEFAULT 'INBOX',
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "size" INTEGER,
    "headers" JSONB,
    "metadata" JSONB,
    "hasCalendarInvite" BOOLEAN NOT NULL DEFAULT false,
    "calendarInviteData" JSONB,
    "calendarInviteStatus" TEXT,
    "calendarEventId" TEXT,
    "userModifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "isBodyFetched" BOOLEAN NOT NULL DEFAULT false,
    "aiPriority" INTEGER,
    "aiPriorityReason" TEXT,
    "aiSentiment" TEXT,
    "aiLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isAutoTriaged" BOOLEAN NOT NULL DEFAULT false,
    "autoTriagedAt" TIMESTAMP(3),

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id","tenantId")
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
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "externalId" TEXT,
    "delimiter" TEXT NOT NULL DEFAULT '/',
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "isSelectable" BOOLEAN NOT NULL DEFAULT true,
    "specialUse" TEXT,
    "attributes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "recentCount" INTEGER NOT NULL DEFAULT 0,
    "unseenCount" INTEGER NOT NULL DEFAULT 0,
    "uidValidity" TEXT,
    "uidNext" INTEGER DEFAULT 0,
    "syncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "user_labels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "LabelType" NOT NULL DEFAULT 'USER',
    "color" JSONB,
    "icon" TEXT,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_labels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentId" TEXT,
    "storageType" TEXT NOT NULL DEFAULT 'local',
    "storagePath" TEXT,
    "contentHash" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentName" TEXT,
    "vector" vector,
    "embeddingModel" TEXT NOT NULL DEFAULT 'mistral-embed',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "calendarId" TEXT,
    "iCalUID" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "organizer" TEXT,
    "attendees" JSONB,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "recurrence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recurringEventId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "visibility" TEXT NOT NULL DEFAULT 'default',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "reminders" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "htmlLink" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "calendarName" TEXT,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "calendar_event_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
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
CREATE TABLE "calendar_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "color" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_sync_states" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarName" TEXT,
    "syncToken" TEXT,
    "deltaLink" TEXT,
    "lastFullSyncAt" TIMESTAMP(3),
    "lastIncrementalAt" TIMESTAMP(3),
    "fullSyncRequired" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_states_pkey" PRIMARY KEY ("id")
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
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "lastInteractedAt" TIMESTAMP(3),
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "reconnectRemindedAt" TIMESTAMP(3),
    "relationshipScore" DOUBLE PRECISION,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "totalInteractions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "unified_contacts_pkey" PRIMARY KEY ("id","tenantId")
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
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT,
    "fileSize" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "resourcePath" TEXT NOT NULL DEFAULT 'generic',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "lastNotificationAt" TIMESTAMP(3),
    "notificationCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_style_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "manualSamples" TEXT,
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
CREATE TABLE "email_signatures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_draft_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "draftBody" TEXT NOT NULL,
    "sentBody" TEXT,
    "action" TEXT NOT NULL DEFAULT 'pending',
    "editDistance" DOUBLE PRECISION,
    "corrections" JSONB,
    "tone" TEXT,
    "locale" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_draft_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "category" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_memories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "memoryType" "MemoryType" NOT NULL DEFAULT 'FACT',
    "source" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "category" TEXT,
    "tags" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vector" vector,

    CONSTRAINT "ai_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mistral_agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mistral_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "toolCallId" TEXT,
    "stepIndex" INTEGER,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_follow_ups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "followUpType" "FollowUpType" NOT NULL DEFAULT 'TODO',
    "reason" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "remindCount" INTEGER NOT NULL DEFAULT 0,
    "lastRemindedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "commitments" JSONB,
    "waitingFor" JSONB,
    "actionItems" JSONB,
    "emailType" TEXT,
    "confidence" DOUBLE PRECISION,
    "detectedDeadline" TIMESTAMP(3),
    "deadlineSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_analyses" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "priority" "EmailPriority" NOT NULL DEFAULT 'NORMAL',
    "category" "EmailCategory" NOT NULL DEFAULT 'OTHER',
    "sentiment" "Sentiment" NOT NULL DEFAULT 'NEUTRAL',
    "hasDeadline" BOOLEAN NOT NULL DEFAULT false,
    "deadlineDate" TIMESTAMP(3),
    "needsFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "isSalesLead" BOOLEAN NOT NULL DEFAULT false,
    "dealSignal" "DealSignal",
    "buyingIntent" DOUBLE PRECISION,
    "suggestedActions" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "keyPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelUsed" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "email_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_queue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "emailId" TEXT,
    "actionType" "ActionType" NOT NULL,
    "actionPayload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasoning" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionResult" JSONB,
    "executionError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "action_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_learning_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "autoExecutedCount" INTEGER NOT NULL DEFAULT 0,
    "avgOriginalConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgAdjustedConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastLearningAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "agent_learning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_action_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
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
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "agent_action_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autumnCustomerId" TEXT,
    "autumnSubscriptionId" TEXT,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthlyEmailLimit" INTEGER NOT NULL DEFAULT 100,
    "monthlyAICallLimit" INTEGER NOT NULL DEFAULT 50,
    "maxUsers" INTEGER NOT NULL DEFAULT 1,
    "emailsProcessed" INTEGER NOT NULL DEFAULT 0,
    "aiCallsUsed" INTEGER NOT NULL DEFAULT 0,
    "usageResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voltagent_memory_conversations" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT timezone('utc'::text, now()),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT "voltagent_memory_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voltagent_memory_messages" (
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB,
    "metadata" JSONB,
    "format_version" INTEGER DEFAULT 2,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT "voltagent_memory_messages_pkey" PRIMARY KEY ("conversation_id","message_id")
);

-- CreateTable
CREATE TABLE "voltagent_memory_steps" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "agent_name" TEXT,
    "operation_id" TEXT,
    "step_index" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "arguments" JSONB,
    "result" JSONB,
    "usage" JSONB,
    "sub_agent_id" TEXT,
    "sub_agent_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT "voltagent_memory_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voltagent_memory_users" (
    "id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT timezone('utc'::text, now()),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT "voltagent_memory_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voltagent_memory_workflow_states" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "suspension" JSONB,
    "events" JSONB,
    "output" JSONB,
    "cancellation" JSONB,
    "user_id" TEXT,
    "conversation_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "voltagent_memory_workflow_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_run_ledger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "hitlRequired" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "status" "AiRunStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_run_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_tenantId_idx" ON "user_preferences"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_preferences_userId_key" ON "dashboard_preferences"("userId");

-- CreateIndex
CREATE INDEX "dashboard_preferences_tenantId_idx" ON "dashboard_preferences"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_secrets_userId_key" ON "mfa_secrets"("userId");

-- CreateIndex
CREATE INDEX "mfa_secrets_userId_idx" ON "mfa_secrets"("userId");

-- CreateIndex
CREATE INDEX "mfa_secrets_tenantId_idx" ON "mfa_secrets"("tenantId");

-- CreateIndex
CREATE INDEX "mfa_backup_codes_userId_isUsed_idx" ON "mfa_backup_codes"("userId", "isUsed");

-- CreateIndex
CREATE INDEX "mfa_backup_codes_tenantId_idx" ON "mfa_backup_codes"("tenantId");

-- CreateIndex
CREATE INDEX "trusted_devices_tenantId_idx" ON "trusted_devices"("tenantId");

-- CreateIndex
CREATE INDEX "trusted_devices_userId_idx" ON "trusted_devices"("userId");

-- CreateIndex
CREATE INDEX "trusted_devices_deviceToken_idx" ON "trusted_devices"("deviceToken");

-- CreateIndex
CREATE INDEX "trusted_devices_expiresAt_idx" ON "trusted_devices"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_tenantId_deviceToken_key" ON "trusted_devices"("tenantId", "deviceToken");

-- CreateIndex
CREATE INDEX "webauthn_credentials_tenantId_idx" ON "webauthn_credentials"("tenantId");

-- CreateIndex
CREATE INDEX "webauthn_credentials_userId_idx" ON "webauthn_credentials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_tenantId_credentialId_key" ON "webauthn_credentials"("tenantId", "credentialId");

-- CreateIndex
CREATE INDEX "sessions_tenantId_idx" ON "sessions"("tenantId");

-- CreateIndex
CREATE INDEX "sessions_userId_token_idx" ON "sessions"("userId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tenantId_token_key" ON "sessions"("tenantId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "provider_configs_tenantId_isDefault_idx" ON "provider_configs"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "provider_configs_userId_idx" ON "provider_configs"("userId");

-- CreateIndex
CREATE INDEX "provider_configs_nextSyncAt_isActive_idx" ON "provider_configs"("nextSyncAt", "isActive");

-- CreateIndex
CREATE INDEX "provider_configs_syncPriority_nextSyncAt_idx" ON "provider_configs"("syncPriority", "nextSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_tenantId_email_providerType_key" ON "provider_configs"("tenantId", "email", "providerType");

-- CreateIndex
CREATE INDEX "emails_tenantId_folder_receivedAt_idx" ON "emails"("tenantId", "folder", "receivedAt");

-- CreateIndex
CREATE INDEX "emails_tenantId_isRead_idx" ON "emails"("tenantId", "isRead");

-- CreateIndex
CREATE INDEX "emails_tenantId_threadId_idx" ON "emails"("tenantId", "threadId");

-- CreateIndex
CREATE INDEX "emails_sentAt_idx" ON "emails"("sentAt");

-- CreateIndex
CREATE INDEX "emails_tenantId_hasCalendarInvite_idx" ON "emails"("tenantId", "hasCalendarInvite");

-- CreateIndex
CREATE INDEX "emails_tenantId_providerId_folder_receivedAt_idx" ON "emails"("tenantId", "providerId", "folder", "receivedAt");

-- CreateIndex
CREATE INDEX "emails_tenantId_isStarred_receivedAt_idx" ON "emails"("tenantId", "isStarred", "receivedAt");

-- CreateIndex
CREATE INDEX "emails_tenantId_providerId_isDeleted_idx" ON "emails"("tenantId", "providerId", "isDeleted");

-- CreateIndex
CREATE INDEX "emails_providerId_folder_isRead_idx" ON "emails"("providerId", "folder", "isRead");

-- CreateIndex
CREATE INDEX "emails_tenantId_from_idx" ON "emails"("tenantId", "from");

-- CreateIndex
CREATE INDEX "emails_tenantId_isBodyFetched_idx" ON "emails"("tenantId", "isBodyFetched");

-- CreateIndex
CREATE INDEX "emails_tenantId_isFlagged_idx" ON "emails"("tenantId", "isFlagged");

-- CreateIndex
CREATE INDEX "emails_tenantId_aiPriority_idx" ON "emails"("tenantId", "aiPriority");

-- CreateIndex
CREATE INDEX "emails_subject_idx" ON "emails" USING GIN ("subject" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "emails_from_idx" ON "emails" USING GIN ("from" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "emails_providerId_folder_isRead_isDeleted_idx" ON "emails"("providerId", "folder", "isRead", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "emails_tenantId_messageId_folder_key" ON "emails"("tenantId", "messageId", "folder");

-- CreateIndex
CREATE UNIQUE INDEX "emails_providerId_externalId_key" ON "emails"("providerId", "externalId");

-- CreateIndex
CREATE INDEX "scheduled_emails_tenantId_status_scheduledAt_idx" ON "scheduled_emails"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "scheduled_emails_scheduledAt_status_idx" ON "scheduled_emails"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "folders_providerId_externalId_idx" ON "folders"("providerId", "externalId");

-- CreateIndex
CREATE INDEX "folders_tenantId_providerId_idx" ON "folders"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "folders_tenantId_specialUse_idx" ON "folders"("tenantId", "specialUse");

-- CreateIndex
CREATE INDEX "folders_tenantId_isSystem_idx" ON "folders"("tenantId", "isSystem");

-- CreateIndex
CREATE INDEX "folders_providerId_parentId_idx" ON "folders"("providerId", "parentId");

-- CreateIndex
CREATE INDEX "folders_lastSyncedAt_idx" ON "folders"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "folders_providerId_path_key" ON "folders"("providerId", "path");

-- CreateIndex
CREATE INDEX "user_labels_tenantId_type_idx" ON "user_labels"("tenantId", "type");

-- CreateIndex
CREATE INDEX "user_labels_tenantId_parentId_idx" ON "user_labels"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "user_labels_tenantId_orderIndex_idx" ON "user_labels"("tenantId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "user_labels_tenantId_slug_key" ON "user_labels"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "email_labels_emailId_idx" ON "email_labels"("emailId");

-- CreateIndex
CREATE INDEX "email_labels_labelId_idx" ON "email_labels"("labelId");

-- CreateIndex
CREATE INDEX "email_labels_tenantId_idx" ON "email_labels"("tenantId");

-- CreateIndex
CREATE INDEX "email_labels_createdAt_idx" ON "email_labels"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_labels_tenantId_emailId_labelId_key" ON "email_labels"("tenantId", "emailId", "labelId");

-- CreateIndex
CREATE INDEX "email_attachments_emailId_idx" ON "email_attachments"("emailId");

-- CreateIndex
CREATE INDEX "email_attachments_tenantId_idx" ON "email_attachments"("tenantId");

-- CreateIndex
CREATE INDEX "embeddings_tenantId_idx" ON "embeddings"("tenantId");

-- CreateIndex
CREATE INDEX "embeddings_emailId_idx" ON "embeddings"("emailId");

-- CreateIndex
CREATE INDEX "embeddings_contactId_idx" ON "embeddings"("contactId");

-- CreateIndex
CREATE INDEX "calendar_events_tenantId_startTime_idx" ON "calendar_events"("tenantId", "startTime");

-- CreateIndex
CREATE INDEX "calendar_events_tenantId_calendarId_startTime_idx" ON "calendar_events"("tenantId", "calendarId", "startTime");

-- CreateIndex
CREATE INDEX "calendar_events_tenantId_providerId_startTime_idx" ON "calendar_events"("tenantId", "providerId", "startTime");

-- CreateIndex
CREATE INDEX "calendar_events_iCalUID_idx" ON "calendar_events"("iCalUID");

-- CreateIndex
CREATE INDEX "calendar_events_tenantId_title_idx" ON "calendar_events"("tenantId", "title");

-- CreateIndex
CREATE INDEX "calendar_events_title_idx" ON "calendar_events" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_providerId_externalId_key" ON "calendar_events"("providerId", "externalId");

-- CreateIndex
CREATE INDEX "calendar_event_attachments_eventId_idx" ON "calendar_event_attachments"("eventId");

-- CreateIndex
CREATE INDEX "calendar_event_attachments_tenantId_idx" ON "calendar_event_attachments"("tenantId");

-- CreateIndex
CREATE INDEX "calendar_preferences_tenantId_idx" ON "calendar_preferences"("tenantId");

-- CreateIndex
CREATE INDEX "calendar_preferences_providerId_idx" ON "calendar_preferences"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_preferences_tenantId_providerId_calendarId_key" ON "calendar_preferences"("tenantId", "providerId", "calendarId");

-- CreateIndex
CREATE INDEX "calendar_sync_states_providerId_idx" ON "calendar_sync_states"("providerId");

-- CreateIndex
CREATE INDEX "calendar_sync_states_tenantId_idx" ON "calendar_sync_states"("tenantId");

-- CreateIndex
CREATE INDEX "calendar_sync_states_fullSyncRequired_idx" ON "calendar_sync_states"("fullSyncRequired");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sync_states_tenantId_providerId_calendarId_key" ON "calendar_sync_states"("tenantId", "providerId", "calendarId");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_displayName_idx" ON "unified_contacts"("tenantId", "displayName");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_lastName_firstName_idx" ON "unified_contacts"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_company_idx" ON "unified_contacts"("tenantId", "company");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_displayName_firstName_lastName_co_idx" ON "unified_contacts"("tenantId", "displayName", "firstName", "lastName", "company");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_lastInteractedAt_idx" ON "unified_contacts"("tenantId", "lastInteractedAt");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_relationshipScore_idx" ON "unified_contacts"("tenantId", "relationshipScore");

-- CreateIndex
CREATE INDEX "unified_contacts_tenantId_isVip_idx" ON "unified_contacts"("tenantId", "isVip");

-- CreateIndex
CREATE INDEX "unified_contacts_displayName_idx" ON "unified_contacts" USING GIN ("displayName" gin_trgm_ops);

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
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_consents_userId_feature_createdAt_idx" ON "user_consents"("userId", "feature", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_consents_tenantId_createdAt_idx" ON "user_consents"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "legal_acceptances_userId_documentType_acceptedAt_idx" ON "legal_acceptances"("userId", "documentType", "acceptedAt" DESC);

-- CreateIndex
CREATE INDEX "legal_acceptances_tenantId_documentType_idx" ON "legal_acceptances"("tenantId", "documentType");

-- CreateIndex
CREATE INDEX "data_export_requests_userId_status_idx" ON "data_export_requests"("userId", "status");

-- CreateIndex
CREATE INDEX "data_export_requests_expiresAt_idx" ON "data_export_requests"("expiresAt");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_tenantId_idx" ON "webhook_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_tenantId_isActive_idx" ON "webhook_subscriptions"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_providerId_isActive_idx" ON "webhook_subscriptions"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_expiresAt_idx" ON "webhook_subscriptions"("expiresAt");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_providerType_idx" ON "webhook_subscriptions"("providerType");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_subscriptionId_idx" ON "webhook_subscriptions"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_subscriptions_providerId_resourcePath_key" ON "webhook_subscriptions"("providerId", "resourcePath");

-- CreateIndex
CREATE INDEX "writing_style_profiles_tenantId_userId_idx" ON "writing_style_profiles"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "writing_style_profiles_providerId_idx" ON "writing_style_profiles"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_style_profiles_tenantId_userId_providerId_key" ON "writing_style_profiles"("tenantId", "userId", "providerId");

-- CreateIndex
CREATE INDEX "email_signatures_tenantId_userId_idx" ON "email_signatures"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "email_signatures_tenantId_userId_providerId_idx" ON "email_signatures"("tenantId", "userId", "providerId");

-- CreateIndex
CREATE INDEX "email_signatures_providerId_idx" ON "email_signatures"("providerId");

-- CreateIndex
CREATE INDEX "ai_draft_feedback_tenantId_userId_idx" ON "ai_draft_feedback"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "ai_draft_feedback_tenantId_emailId_idx" ON "ai_draft_feedback"("tenantId", "emailId");

-- CreateIndex
CREATE INDEX "email_templates_tenantId_userId_idx" ON "email_templates"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "email_templates_tenantId_userId_category_idx" ON "email_templates"("tenantId", "userId", "category");

-- CreateIndex
CREATE INDEX "ai_memories_tenantId_userId_idx" ON "ai_memories"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "ai_memories_tenantId_userId_memoryType_idx" ON "ai_memories"("tenantId", "userId", "memoryType");

-- CreateIndex
CREATE INDEX "ai_memories_tenantId_userId_category_idx" ON "ai_memories"("tenantId", "userId", "category");

-- CreateIndex
CREATE INDEX "ai_memories_content_gin_idx" ON "ai_memories" USING GIN ("content" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ai_memories_vector_hnsw_idx" ON "ai_memories"("vector");

-- CreateIndex
CREATE INDEX "mistral_agents_tenantId_idx" ON "mistral_agents"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "mistral_agents_tenantId_agentType_locale_key" ON "mistral_agents"("tenantId", "agentType", "locale");

-- CreateIndex
CREATE INDEX "ai_conversations_tenantId_userId_updatedAt_idx" ON "ai_conversations"("tenantId", "userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ai_conversations_tenantId_updatedAt_idx" ON "ai_conversations"("tenantId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "email_follow_ups_tenantId_userId_idx" ON "email_follow_ups"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "email_follow_ups_tenantId_userId_status_idx" ON "email_follow_ups"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "email_follow_ups_tenantId_userId_followUpType_idx" ON "email_follow_ups"("tenantId", "userId", "followUpType");

-- CreateIndex
CREATE INDEX "email_follow_ups_dueDate_idx" ON "email_follow_ups"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "email_follow_ups_emailId_tenantId_key" ON "email_follow_ups"("emailId", "tenantId");

-- CreateIndex
CREATE INDEX "email_analyses_tenantId_idx" ON "email_analyses"("tenantId");

-- CreateIndex
CREATE INDEX "email_analyses_tenantId_processedAt_idx" ON "email_analyses"("tenantId", "processedAt");

-- CreateIndex
CREATE INDEX "email_analyses_tenantId_priority_idx" ON "email_analyses"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "email_analyses_tenantId_needsFollowUp_idx" ON "email_analyses"("tenantId", "needsFollowUp");

-- CreateIndex
CREATE UNIQUE INDEX "email_analyses_emailId_tenantId_key" ON "email_analyses"("emailId", "tenantId");

-- CreateIndex
CREATE INDEX "action_queue_tenantId_status_idx" ON "action_queue"("tenantId", "status");

-- CreateIndex
CREATE INDEX "action_queue_tenantId_userId_status_idx" ON "action_queue"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "action_queue_expiresAt_idx" ON "action_queue"("expiresAt");

-- CreateIndex
CREATE INDEX "agent_learning_profiles_tenantId_userId_idx" ON "agent_learning_profiles"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "agent_learning_profiles_expiresAt_idx" ON "agent_learning_profiles"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_learning_profiles_tenantId_userId_agentName_actionTyp_key" ON "agent_learning_profiles"("tenantId", "userId", "agentName", "actionType");

-- CreateIndex
CREATE INDEX "agent_action_feedback_tenantId_userId_idx" ON "agent_action_feedback"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "agent_action_feedback_tenantId_agentName_actionType_idx" ON "agent_action_feedback"("tenantId", "agentName", "actionType");

-- CreateIndex
CREATE INDEX "agent_action_feedback_actionId_idx" ON "agent_action_feedback"("actionId");

-- CreateIndex
CREATE INDEX "agent_action_feedback_expiresAt_idx" ON "agent_action_feedback"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_autumnCustomerId_key" ON "subscriptions"("autumnCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_autumnSubscriptionId_key" ON "subscriptions"("autumnSubscriptionId");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_conversations_resource_id" ON "voltagent_memory_conversations"("resource_id");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_conversations_user_id" ON "voltagent_memory_conversations"("user_id");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_messages_conversation_id" ON "voltagent_memory_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_messages_created_at" ON "voltagent_memory_messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_steps_conversation" ON "voltagent_memory_steps"("conversation_id", "step_index");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_steps_operation" ON "voltagent_memory_steps"("conversation_id", "operation_id");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_workflow_states_status" ON "voltagent_memory_workflow_states"("status");

-- CreateIndex
CREATE INDEX "idx_voltagent_memory_workflow_states_workflow_id" ON "voltagent_memory_workflow_states"("workflow_id");

-- CreateIndex
CREATE INDEX "ai_run_ledger_tenantId_createdAt_idx" ON "ai_run_ledger"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_run_ledger_tenantId_userId_createdAt_idx" ON "ai_run_ledger"("tenantId", "userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_run_ledger_tenantId_runType_idx" ON "ai_run_ledger"("tenantId", "runType");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_tenantId_fkey" FOREIGN KEY ("parentId", "tenantId") REFERENCES "folders"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_labels" ADD CONSTRAINT "user_labels_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "user_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_labels" ADD CONSTRAINT "user_labels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_labels" ADD CONSTRAINT "email_labels_emailId_tenantId_fkey" FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_labels" ADD CONSTRAINT "email_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "user_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_labels" ADD CONSTRAINT "email_labels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_emailId_tenantId_fkey" FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_emailId_tenantId_fkey" FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_attachments" ADD CONSTRAINT "calendar_event_attachments_eventId_tenantId_fkey" FOREIGN KEY ("eventId", "tenantId") REFERENCES "calendar_events"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_attachments" ADD CONSTRAINT "calendar_event_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_sync_states" ADD CONSTRAINT "calendar_sync_states_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_sync_states" ADD CONSTRAINT "calendar_sync_states_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unified_contacts" ADD CONSTRAINT "unified_contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_contacts" ADD CONSTRAINT "provider_contacts_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_contacts" ADD CONSTRAINT "provider_contacts_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_contacts" ADD CONSTRAINT "provider_contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_style_profiles" ADD CONSTRAINT "writing_style_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_style_profiles" ADD CONSTRAINT "writing_style_profiles_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistral_agents" ADD CONSTRAINT "mistral_agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_emailId_tenantId_fkey" FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_analyses" ADD CONSTRAINT "email_analyses_emailId_tenantId_fkey" FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_analyses" ADD CONSTRAINT "email_analyses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_queue" ADD CONSTRAINT "action_queue_emailId_tenantId_fkey" FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_queue" ADD CONSTRAINT "action_queue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_queue" ADD CONSTRAINT "action_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_learning_profiles" ADD CONSTRAINT "agent_learning_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_learning_profiles" ADD CONSTRAINT "agent_learning_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_action_feedback" ADD CONSTRAINT "agent_action_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_action_feedback" ADD CONSTRAINT "agent_action_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voltagent_memory_messages" ADD CONSTRAINT "voltagent_memory_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "voltagent_memory_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voltagent_memory_steps" ADD CONSTRAINT "voltagent_memory_steps_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "voltagent_memory_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

