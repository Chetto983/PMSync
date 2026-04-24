-- ALLOW-DESTRUCTIVE: one-time baseline reconcile after 2026-04-24 wipe. Re-creates 38 orphan tables that were previously db-push'd and never backed by a migration, plus captures work from 15 overlapping pending migrations (round2 FKs, telegram slot drops, triage_overrides, label_accuracy_profiles, etc). 2 DROP COLUMNs (telegram_settings.slotPomeriggio/slotSera) are safe because DB is empty.
-- CreateEnum
CREATE TYPE "PredictionType" AS ENUM ('LEAD_SCORE', 'CHURN', 'FORECAST', 'NBA', 'CHAT', 'OTHER');

-- DropForeignKey
ALTER TABLE "ai_draft_feedback" DROP CONSTRAINT "ai_draft_feedback_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ai_draft_feedback" DROP CONSTRAINT "ai_draft_feedback_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_memories" DROP CONSTRAINT "ai_memories_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_run_ledger" DROP CONSTRAINT "ai_run_ledger_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ai_run_ledger" DROP CONSTRAINT "ai_run_ledger_userId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_preferences" DROP CONSTRAINT "calendar_preferences_providerId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_preferences" DROP CONSTRAINT "calendar_preferences_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "email_follow_ups" DROP CONSTRAINT "email_follow_ups_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "email_follow_ups" DROP CONSTRAINT "email_follow_ups_userId_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "provider_configs" DROP CONSTRAINT "provider_configs_userId_fkey";

-- DropForeignKey
ALTER TABLE "telegram_settings" DROP CONSTRAINT "telegram_settings_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "writing_style_profiles" DROP CONSTRAINT "writing_style_profiles_tenantId_fkey";

-- AlterTable
ALTER TABLE "ai_memories" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "emailId" TEXT;

-- AlterTable
ALTER TABLE "ai_run_ledger" ADD COLUMN     "assembledContextTokens" INTEGER,
ADD COLUMN     "predictionType" "PredictionType",
ADD COLUMN     "rawContextTokens" INTEGER;

-- AlterTable
ALTER TABLE "email_analyses" ADD COLUMN     "actionability" TEXT,
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "lane" TEXT,
ADD COLUMN     "triageSource" TEXT;

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "aiActionability" TEXT,
ADD COLUMN     "aiCategory" TEXT,
ADD COLUMN     "aiIntent" TEXT,
ADD COLUMN     "aiLane" TEXT,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "contactTenantId" TEXT,
ADD COLUMN     "dealId" TEXT;

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "notificationScheduled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceParentId" TEXT,
ADD COLUMN     "recurrenceRule" TEXT,
ADD COLUMN     "remindCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "telegram_settings" DROP COLUMN "slotMattina",
DROP COLUMN "slotPomeriggio",
DROP COLUMN "slotSera";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "triageRules" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "user_labels" ADD COLUMN     "actionType" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "aiPrompt" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'custom',
ADD COLUMN     "contents" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defaultLane" TEXT,
ADD COLUMN     "mutuallyExclusiveWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "suppressUrgency" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "aiBehavioralTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hitlSensitivity" TEXT DEFAULT 'HIGH_ONLY',
ADD COLUMN     "pushAiEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushCalendarEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushEmailEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "manual_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueDate" TIMESTAMP(3),
    "contactId" TEXT,
    "contactTenant" TEXT,
    "dealId" TEXT,
    "emailId" TEXT,
    "emailTenant" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "revenue" DECIMAL(15,2),
    "currency" TEXT DEFAULT 'EUR',
    "address" JSONB,
    "phone" TEXT,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_pipelines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_stages" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT DEFAULT '#6B7280',
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "automations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "priority" TEXT DEFAULT 'MEDIUM',
    "source" TEXT,
    "notes" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_saved_views" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_saved_views_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT,
    "accountId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "price" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deal_products" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deal_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_account_contacts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_account_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deal_contacts" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_deal_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_custom_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_custom_field_values" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_suggestions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "entityData" JSONB NOT NULL,
    "sourceEmailId" TEXT,
    "sourceEmailTenant" TEXT,
    "sourceType" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_scores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '{}',
    "modelId" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_score_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_feature_store" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_feature_store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_drift_checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "psi" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "baselineN" INTEGER NOT NULL,
    "currentN" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_drift_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_model_evaluations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "weights" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_model_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_forecast_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "predictedRevenue" DECIMAL(15,2) NOT NULL,
    "p20Revenue" DECIMAL(15,2) NOT NULL,
    "p50Revenue" DECIMAL(15,2) NOT NULL,
    "p80Revenue" DECIMAL(15,2) NOT NULL,
    "actualRevenue" DECIMAL(15,2),
    "mape" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_forecast_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_churn_signals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "accountId" TEXT,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "signals" JSONB NOT NULL DEFAULT '{}',
    "reasoning" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_churn_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_nodes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "externalId" TEXT,
    "label" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "vector" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_edges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "edgeType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nba_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "expectedImpact" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "executedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nba_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assigneeId" TEXT,
    "contactId" TEXT,
    "contactTenant" TEXT,
    "accountId" TEXT,
    "emailId" TEXT,
    "emailTenant" TEXT,
    "emailThreadId" TEXT,
    "slaPolicyId" TEXT,
    "slaDeadline" TIMESTAMP(3),
    "portalToken" TEXT,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "responseTimeMinutes" INTEGER NOT NULL,
    "resolutionTimeMinutes" INTEGER NOT NULL,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_articles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "authorId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "search_vector" tsvector,

    CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csat_surveys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "token" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csat_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_triage_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "signal" TEXT NOT NULL DEFAULT 'edit',
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_triage_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_accuracy_profiles" (
    "tenantId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "tp" INTEGER NOT NULL DEFAULT 0,
    "fp" INTEGER NOT NULL DEFAULT 0,
    "fn" INTEGER NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "f1" DOUBLE PRECISION,
    "wilsonPrecLow" DOUBLE PRECISION,
    "wilsonPrecHigh" DOUBLE PRECISION,
    "wilsonRecLow" DOUBLE PRECISION,
    "wilsonRecHigh" DOUBLE PRECISION,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_accuracy_profiles_pkey" PRIMARY KEY ("tenantId","labelId","windowKey")
);

-- CreateTable
CREATE TABLE "label_accuracy_source_breakdowns" (
    "tenantId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "triageSource" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "tp" INTEGER NOT NULL DEFAULT 0,
    "fp" INTEGER NOT NULL DEFAULT 0,
    "fn" INTEGER NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "f1" DOUBLE PRECISION,
    "wilsonPrecLow" DOUBLE PRECISION,
    "wilsonPrecHigh" DOUBLE PRECISION,
    "wilsonRecLow" DOUBLE PRECISION,
    "wilsonRecHigh" DOUBLE PRECISION,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_accuracy_source_breakdowns_pkey" PRIMARY KEY ("tenantId","labelId","triageSource","windowKey")
);

-- CreateIndex
CREATE INDEX "manual_tasks_tenantId_userId_idx" ON "manual_tasks"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "manual_tasks_tenantId_userId_status_idx" ON "manual_tasks"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "manual_tasks_tenantId_userId_dueDate_idx" ON "manual_tasks"("tenantId", "userId", "dueDate");

-- CreateIndex
CREATE INDEX "push_subscriptions_tenantId_userId_idx" ON "push_subscriptions"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_tenantId_endpoint_key" ON "push_subscriptions"("tenantId", "endpoint");

-- CreateIndex
CREATE INDEX "crm_accounts_tenantId_idx" ON "crm_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "crm_accounts_tenantId_name_idx" ON "crm_accounts"("tenantId", "name");

-- CreateIndex
CREATE INDEX "crm_accounts_tenantId_industry_idx" ON "crm_accounts"("tenantId", "industry");

-- CreateIndex
CREATE INDEX "crm_accounts_tenantId_parentId_idx" ON "crm_accounts"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "crm_pipelines_tenantId_idx" ON "crm_pipelines"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_pipelines_tenantId_name_key" ON "crm_pipelines"("tenantId", "name");

-- CreateIndex
CREATE INDEX "crm_stages_pipelineId_idx" ON "crm_stages"("pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_stages_pipelineId_name_key" ON "crm_stages"("pipelineId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "crm_stages_pipelineId_position_key" ON "crm_stages"("pipelineId", "position");

-- CreateIndex
CREATE INDEX "crm_deals_tenantId_idx" ON "crm_deals"("tenantId");

-- CreateIndex
CREATE INDEX "crm_deals_tenantId_pipelineId_idx" ON "crm_deals"("tenantId", "pipelineId");

-- CreateIndex
CREATE INDEX "crm_deals_tenantId_stageId_idx" ON "crm_deals"("tenantId", "stageId");

-- CreateIndex
CREATE INDEX "crm_deals_tenantId_accountId_idx" ON "crm_deals"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "crm_deals_tenantId_expectedCloseDate_idx" ON "crm_deals"("tenantId", "expectedCloseDate");

-- CreateIndex
CREATE INDEX "crm_deals_tenantId_closedAt_idx" ON "crm_deals"("tenantId", "closedAt");

-- CreateIndex
CREATE INDEX "crm_deals_tenantId_score_idx" ON "crm_deals"("tenantId", "score");

-- CreateIndex
CREATE INDEX "crm_saved_views_tenantId_pipelineId_idx" ON "crm_saved_views"("tenantId", "pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_saved_views_tenantId_pipelineId_name_key" ON "crm_saved_views"("tenantId", "pipelineId", "name");

-- CreateIndex
CREATE INDEX "task_smart_views_tenantId_userId_idx" ON "task_smart_views"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "task_smart_views_tenantId_userId_isPinned_idx" ON "task_smart_views"("tenantId", "userId", "isPinned");

-- CreateIndex
CREATE UNIQUE INDEX "task_smart_views_tenantId_userId_name_key" ON "task_smart_views"("tenantId", "userId", "name");

-- CreateIndex
CREATE INDEX "crm_activities_dealId_idx" ON "crm_activities"("dealId");

-- CreateIndex
CREATE INDEX "crm_activities_accountId_idx" ON "crm_activities"("accountId");

-- CreateIndex
CREATE INDEX "crm_activities_tenantId_dealId_createdAt_idx" ON "crm_activities"("tenantId", "dealId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_activities_tenantId_accountId_createdAt_idx" ON "crm_activities"("tenantId", "accountId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_products_tenantId_idx" ON "crm_products"("tenantId");

-- CreateIndex
CREATE INDEX "crm_products_tenantId_name_idx" ON "crm_products"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "crm_products_tenantId_code_key" ON "crm_products"("tenantId", "code");

-- CreateIndex
CREATE INDEX "crm_deal_products_dealId_idx" ON "crm_deal_products"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_deal_products_dealId_productId_key" ON "crm_deal_products"("dealId", "productId");

-- CreateIndex
CREATE INDEX "crm_account_contacts_accountId_idx" ON "crm_account_contacts"("accountId");

-- CreateIndex
CREATE INDEX "crm_account_contacts_contactId_tenantId_idx" ON "crm_account_contacts"("contactId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_account_contacts_accountId_contactId_tenantId_key" ON "crm_account_contacts"("accountId", "contactId", "tenantId");

-- CreateIndex
CREATE INDEX "crm_deal_contacts_dealId_idx" ON "crm_deal_contacts"("dealId");

-- CreateIndex
CREATE INDEX "crm_deal_contacts_contactId_tenantId_idx" ON "crm_deal_contacts"("contactId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_deal_contacts_dealId_contactId_tenantId_key" ON "crm_deal_contacts"("dealId", "contactId", "tenantId");

-- CreateIndex
CREATE INDEX "crm_custom_fields_tenantId_entity_idx" ON "crm_custom_fields"("tenantId", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "crm_custom_fields_tenantId_entity_name_key" ON "crm_custom_fields"("tenantId", "entity", "name");

-- CreateIndex
CREATE INDEX "crm_custom_field_values_entityId_tenantId_idx" ON "crm_custom_field_values"("entityId", "tenantId");

-- CreateIndex
CREATE INDEX "crm_custom_field_values_fieldId_idx" ON "crm_custom_field_values"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_custom_field_values_fieldId_entityId_tenantId_key" ON "crm_custom_field_values"("fieldId", "entityId", "tenantId");

-- CreateIndex
CREATE INDEX "crm_suggestions_tenantId_status_idx" ON "crm_suggestions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "crm_suggestions_tenantId_type_idx" ON "crm_suggestions"("tenantId", "type");

-- CreateIndex
CREATE INDEX "crm_suggestions_tenantId_sourceEmailId_idx" ON "crm_suggestions"("tenantId", "sourceEmailId");

-- CreateIndex
CREATE INDEX "crm_lead_scores_tenantId_score_idx" ON "crm_lead_scores"("tenantId", "score");

-- CreateIndex
CREATE INDEX "crm_lead_scores_tenantId_computedAt_idx" ON "crm_lead_scores"("tenantId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_lead_scores_tenantId_contactId_key" ON "crm_lead_scores"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "crm_lead_score_history_tenantId_contactId_computedAt_idx" ON "crm_lead_score_history"("tenantId", "contactId", "computedAt");

-- CreateIndex
CREATE INDEX "crm_lead_feature_store_tenantId_contactId_idx" ON "crm_lead_feature_store"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "crm_lead_feature_store_tenantId_computedAt_idx" ON "crm_lead_feature_store"("tenantId", "computedAt");

-- CreateIndex
CREATE INDEX "crm_drift_checks_tenantId_modelType_checkedAt_idx" ON "crm_drift_checks"("tenantId", "modelType", "checkedAt" DESC);

-- CreateIndex
CREATE INDEX "crm_model_evaluations_tenantId_modelType_idx" ON "crm_model_evaluations"("tenantId", "modelType");

-- CreateIndex
CREATE INDEX "crm_model_evaluations_tenantId_modelType_isActive_idx" ON "crm_model_evaluations"("tenantId", "modelType", "isActive");

-- CreateIndex
CREATE INDEX "crm_forecast_snapshots_tenantId_pipelineId_periodStart_idx" ON "crm_forecast_snapshots"("tenantId", "pipelineId", "periodStart");

-- CreateIndex
CREATE INDEX "crm_forecast_snapshots_tenantId_period_periodStart_idx" ON "crm_forecast_snapshots"("tenantId", "period", "periodStart");

-- CreateIndex
CREATE INDEX "crm_churn_signals_tenantId_probability_idx" ON "crm_churn_signals"("tenantId", "probability");

-- CreateIndex
CREATE INDEX "crm_churn_signals_tenantId_riskLevel_idx" ON "crm_churn_signals"("tenantId", "riskLevel");

-- CreateIndex
CREATE INDEX "crm_churn_signals_tenantId_computedAt_idx" ON "crm_churn_signals"("tenantId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_churn_signals_tenantId_contactId_key" ON "crm_churn_signals"("tenantId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_churn_signals_tenantId_accountId_key" ON "crm_churn_signals"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "graph_nodes_tenantId_idx" ON "graph_nodes"("tenantId");

-- CreateIndex
CREATE INDEX "graph_nodes_tenantId_nodeType_idx" ON "graph_nodes"("tenantId", "nodeType");

-- CreateIndex
CREATE INDEX "graph_nodes_tenantId_externalId_idx" ON "graph_nodes"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "graph_nodes_label_gin_idx" ON "graph_nodes" USING GIN ("label" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "graph_edges_tenantId_idx" ON "graph_edges"("tenantId");

-- CreateIndex
CREATE INDEX "graph_edges_sourceId_idx" ON "graph_edges"("sourceId");

-- CreateIndex
CREATE INDEX "graph_edges_targetId_idx" ON "graph_edges"("targetId");

-- CreateIndex
CREATE INDEX "graph_edges_tenantId_edgeType_idx" ON "graph_edges"("tenantId", "edgeType");

-- CreateIndex
CREATE INDEX "graph_edges_sourceId_edgeType_idx" ON "graph_edges"("sourceId", "edgeType");

-- CreateIndex
CREATE UNIQUE INDEX "graph_edges_tenantId_sourceId_targetId_edgeType_key" ON "graph_edges"("tenantId", "sourceId", "targetId", "edgeType");

-- CreateIndex
CREATE INDEX "nba_actions_tenantId_idx" ON "nba_actions"("tenantId");

-- CreateIndex
CREATE INDEX "nba_actions_tenantId_dealId_idx" ON "nba_actions"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "nba_actions_tenantId_dealId_status_idx" ON "nba_actions"("tenantId", "dealId", "status");

-- CreateIndex
CREATE INDEX "nba_actions_tenantId_actionType_idx" ON "nba_actions"("tenantId", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_portalToken_key" ON "tickets"("portalToken");

-- CreateIndex
CREATE INDEX "tickets_tenantId_status_idx" ON "tickets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tickets_tenantId_assigneeId_idx" ON "tickets"("tenantId", "assigneeId");

-- CreateIndex
CREATE INDEX "tickets_tenantId_priority_idx" ON "tickets"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "tickets_tenantId_contactId_idx" ON "tickets"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "tickets_tenantId_accountId_idx" ON "tickets"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "tickets_tenantId_emailThreadId_idx" ON "tickets"("tenantId", "emailThreadId");

-- CreateIndex
CREATE INDEX "tickets_tenantId_createdAt_idx" ON "tickets"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_comments_ticketId_idx" ON "ticket_comments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_comments_ticketId_createdAt_idx" ON "ticket_comments"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "sla_policies_tenantId_idx" ON "sla_policies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_tenantId_priority_key" ON "sla_policies"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "routing_rules_tenantId_active_idx" ON "routing_rules"("tenantId", "active");

-- CreateIndex
CREATE INDEX "kb_categories_tenantId_idx" ON "kb_categories"("tenantId");

-- CreateIndex
CREATE INDEX "kb_categories_tenantId_parentId_idx" ON "kb_categories"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "kb_categories_tenantId_slug_key" ON "kb_categories"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "kb_articles_tenantId_status_idx" ON "kb_articles"("tenantId", "status");

-- CreateIndex
CREATE INDEX "kb_articles_tenantId_categoryId_idx" ON "kb_articles"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "kb_articles_tenantId_authorId_idx" ON "kb_articles"("tenantId", "authorId");

-- CreateIndex
CREATE INDEX "kb_articles_tenantId_createdAt_idx" ON "kb_articles"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "kb_articles_tenantId_slug_key" ON "kb_articles"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "csat_surveys_ticketId_key" ON "csat_surveys"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "csat_surveys_token_key" ON "csat_surveys"("token");

-- CreateIndex
CREATE INDEX "csat_surveys_tenantId_idx" ON "csat_surveys"("tenantId");

-- CreateIndex
CREATE INDEX "csat_surveys_tenantId_createdAt_idx" ON "csat_surveys"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_templates_tenantId_idx" ON "ticket_templates"("tenantId");

-- CreateIndex
CREATE INDEX "ticket_templates_tenantId_category_idx" ON "ticket_templates"("tenantId", "category");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenantId_userId_readAt_idx" ON "in_app_notifications"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenantId_userId_createdAt_idx" ON "in_app_notifications"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "triage_overrides_tenantId_idx" ON "triage_overrides"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "triage_overrides_tenantId_type_pattern_key" ON "triage_overrides"("tenantId", "type", "pattern");

-- CreateIndex
CREATE INDEX "email_triage_feedback_tenantId_type_idx" ON "email_triage_feedback"("tenantId", "type");

-- CreateIndex
CREATE INDEX "email_triage_feedback_tenantId_createdAt_idx" ON "email_triage_feedback"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "email_triage_feedback_tenantId_signal_createdAt_idx" ON "email_triage_feedback"("tenantId", "signal", "createdAt");

-- CreateIndex
CREATE INDEX "label_accuracy_profiles_tenantId_labelId_idx" ON "label_accuracy_profiles"("tenantId", "labelId");

-- CreateIndex
CREATE INDEX "label_accuracy_profiles_tenantId_windowKey_idx" ON "label_accuracy_profiles"("tenantId", "windowKey");

-- CreateIndex
CREATE INDEX "label_accuracy_source_breakdowns_tenantId_labelId_idx" ON "label_accuracy_source_breakdowns"("tenantId", "labelId");

-- CreateIndex
CREATE INDEX "label_accuracy_source_breakdowns_tenantId_triageSource_idx" ON "label_accuracy_source_breakdowns"("tenantId", "triageSource");

-- CreateIndex
CREATE INDEX "ai_memories_tenantId_contactId_idx" ON "ai_memories"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "ai_memories_tenantId_emailId_idx" ON "ai_memories"("tenantId", "emailId");

-- CreateIndex
CREATE INDEX "ai_run_ledger_tenantId_predictionType_createdAt_idx" ON "ai_run_ledger"("tenantId", "predictionType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "email_analyses_tenantId_lane_idx" ON "email_analyses"("tenantId", "lane");

-- CreateIndex
CREATE INDEX "emails_tenantId_isDeleted_receivedAt_idx" ON "emails"("tenantId", "isDeleted", "receivedAt");

-- CreateIndex
CREATE INDEX "emails_tenantId_aiLane_idx" ON "emails"("tenantId", "aiLane");

-- CreateIndex
CREATE INDEX "emails_tenantId_contactId_idx" ON "emails"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "emails_tenantId_dealId_idx" ON "emails"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "emails_tenantId_aiCategory_idx" ON "emails"("tenantId", "aiCategory");

-- CreateIndex
CREATE INDEX "emails_labels_idx" ON "emails" USING GIN ("labels");

-- CreateIndex
CREATE INDEX "reminders_titolo_idx" ON "reminders" USING GIN ("titolo" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "reminders_contatto_idx" ON "reminders" USING GIN ("contatto" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "reminders_recurrenceParentId_idx" ON "reminders"("recurrenceParentId");

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_contactId_contactTenantId_fkey" FOREIGN KEY ("contactId", "contactTenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_recurrenceParentId_fkey" FOREIGN KEY ("recurrenceParentId") REFERENCES "reminders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_tasks" ADD CONSTRAINT "manual_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_tasks" ADD CONSTRAINT "manual_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_tasks" ADD CONSTRAINT "manual_tasks_contactId_contactTenant_fkey" FOREIGN KEY ("contactId", "contactTenant") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_tasks" ADD CONSTRAINT "manual_tasks_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_tasks" ADD CONSTRAINT "manual_tasks_emailId_emailTenant_fkey" FOREIGN KEY ("emailId", "emailTenant") REFERENCES "emails"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "crm_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "crm_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_saved_views" ADD CONSTRAINT "crm_saved_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_saved_views" ADD CONSTRAINT "crm_saved_views_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "crm_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_smart_views" ADD CONSTRAINT "task_smart_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_smart_views" ADD CONSTRAINT "task_smart_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_products" ADD CONSTRAINT "crm_products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_products" ADD CONSTRAINT "crm_deal_products_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_products" ADD CONSTRAINT "crm_deal_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_account_contacts" ADD CONSTRAINT "crm_account_contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_account_contacts" ADD CONSTRAINT "crm_account_contacts_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_custom_fields" ADD CONSTRAINT "crm_custom_fields_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_custom_field_values" ADD CONSTRAINT "crm_custom_field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "crm_custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_suggestions" ADD CONSTRAINT "crm_suggestions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_suggestions" ADD CONSTRAINT "crm_suggestions_sourceEmailId_sourceEmailTenant_fkey" FOREIGN KEY ("sourceEmailId", "sourceEmailTenant") REFERENCES "emails"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_scores" ADD CONSTRAINT "crm_lead_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_scores" ADD CONSTRAINT "crm_lead_scores_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_score_history" ADD CONSTRAINT "crm_lead_score_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_score_history" ADD CONSTRAINT "crm_lead_score_history_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_feature_store" ADD CONSTRAINT "crm_lead_feature_store_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_feature_store" ADD CONSTRAINT "crm_lead_feature_store_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_drift_checks" ADD CONSTRAINT "crm_drift_checks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_model_evaluations" ADD CONSTRAINT "crm_model_evaluations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_forecast_snapshots" ADD CONSTRAINT "crm_forecast_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_forecast_snapshots" ADD CONSTRAINT "crm_forecast_snapshots_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "crm_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_churn_signals" ADD CONSTRAINT "crm_churn_signals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_churn_signals" ADD CONSTRAINT "crm_churn_signals_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_churn_signals" ADD CONSTRAINT "crm_churn_signals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nba_actions" ADD CONSTRAINT "nba_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nba_actions" ADD CONSTRAINT "nba_actions_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nba_actions" ADD CONSTRAINT "nba_actions_contactId_tenantId_fkey" FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contactId_contactTenant_fkey" FOREIGN KEY ("contactId", "contactTenant") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_emailId_emailTenant_fkey" FOREIGN KEY ("emailId", "emailTenant") REFERENCES "emails"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "kb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "kb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_overrides" ADD CONSTRAINT "triage_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_triage_feedback" ADD CONSTRAINT "email_triage_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_accuracy_profiles" ADD CONSTRAINT "label_accuracy_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_accuracy_source_breakdowns" ADD CONSTRAINT "label_accuracy_source_breakdowns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

