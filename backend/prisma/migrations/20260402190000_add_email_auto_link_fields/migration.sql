-- Add email auto-link fields for Phase 142 (AI background automation)
-- AI-01: contactId + contactTenantId for auto-linked contact
-- AI-02: dealId for auto-linked deal
-- AI-03: aiCategory for email categorization

ALTER TABLE "emails" ADD COLUMN "aiCategory" TEXT;
ALTER TABLE "emails" ADD COLUMN "contactId" TEXT;
ALTER TABLE "emails" ADD COLUMN "contactTenantId" TEXT;
ALTER TABLE "emails" ADD COLUMN "dealId" TEXT;

-- Foreign key: Email -> Contact (composite FK)
ALTER TABLE "emails" ADD CONSTRAINT "emails_contactId_contactTenantId_fkey"
  FOREIGN KEY ("contactId", "contactTenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign key: Email -> CrmDeal
ALTER TABLE "emails" ADD CONSTRAINT "emails_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for efficient querying
CREATE INDEX "emails_tenantId_contactId_idx" ON "emails"("tenantId", "contactId");
CREATE INDEX "emails_tenantId_dealId_idx" ON "emails"("tenantId", "dealId");
CREATE INDEX "emails_tenantId_aiCategory_idx" ON "emails"("tenantId", "aiCategory");
