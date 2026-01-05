# AI Module Refactor Schema v2.0

**Date**: 2025-01-05
**Status**: DRAFT
**Goal**: 11 agents → 1 unified classifier, 36 services → 6 services, $82K/mo → $7.5K/mo at 1000 users

---

## Executive Summary

| Metric | Current | Refactored | Improvement |
|--------|---------|------------|-------------|
| LLM calls per email | 11 | 1 | 91% reduction |
| Services | 36 (~22,000 lines) | 6 (~3,000 lines) | 86% reduction |
| Agents | 11 + supervisor | 0 (unified classifier) | 100% reduction |
| Memory services | 5 (~2,700 lines) | 0 (PostgreSQL) | 100% reduction |
| Cost at 1000 users | $82,500/mo | $7,500/mo | 91% savings |
| Response latency | 5-15 seconds | 1-2 seconds | 80% faster |

---

## 1. Database Schema

### 1.1 Core Tables (Prisma)

```prisma
// ============================================
// USER PREFERENCES (replaces memory services)
// ============================================
model UserPreferences {
  id                    String   @id @default(cuid())
  userId                String   @unique
  tenantId              String

  // AI Behavior
  communicationStyle    CommunicationStyle @default(CASUAL)
  responseLength        ResponseLength     @default(MODERATE)
  proactivityLevel      ProactivityLevel   @default(MEDIUM)
  aiAutoApproveThreshold Float             @default(0.9)

  // Features Toggle
  aiSmartRepliesEnabled Boolean @default(true)
  aiSummarizationEnabled Boolean @default(true)
  aiSchedulingEnabled   Boolean @default(true)
  aiFollowUpEnabled     Boolean @default(true)
  aiCRMEnabled          Boolean @default(true)

  // Working Hours
  workingHoursStart     String  @default("09:00")
  workingHoursEnd       String  @default("18:00")
  workingDays           String[] @default(["MON", "TUE", "WED", "THU", "FRI"])
  timezone              String  @default("UTC")

  // CRM Defaults
  defaultFollowUpDays   Int     @default(3)
  autoTagLeads          Boolean @default(true)
  dealStages            String[] @default(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"])

  // Notification
  notificationFrequency NotificationFrequency @default(DIGEST)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant                Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

enum CommunicationStyle {
  FORMAL
  CASUAL
  TECHNICAL
  CREATIVE
}

enum ResponseLength {
  BRIEF
  MODERATE
  DETAILED
}

enum ProactivityLevel {
  LOW
  MEDIUM
  HIGH
}

enum NotificationFrequency {
  IMMEDIATE
  DIGEST
  MINIMAL
}

// ============================================
// EMAIL ANALYSIS (unified classifier output)
// ============================================
model EmailAnalysis {
  id                String   @id @default(cuid())
  emailId           String   @unique
  tenantId          String

  // Classification (1 LLM call output)
  priority          EmailPriority @default(NORMAL)
  category          EmailCategory @default(OTHER)
  sentiment         Sentiment     @default(NEUTRAL)

  // Extracted Data
  hasDeadline       Boolean  @default(false)
  deadlineDate      DateTime?
  needsFollowUp     Boolean  @default(false)
  followUpDate      DateTime?

  // CRM Signals
  isSalesLead       Boolean  @default(false)
  dealSignal        DealSignal?
  buyingIntent      Float?   // 0-1 score

  // Actions Suggested
  suggestedActions  Json     @default("[]") // ActionSuggestion[]

  // Summary
  summary           String?  @db.Text
  keyPoints         String[] @default([])

  // Processing
  processedAt       DateTime @default(now())
  modelUsed         String   @default("gpt-4o-mini")
  tokensUsed        Int      @default(0)
  latencyMs         Int      @default(0)

  email             Email    @relation(fields: [emailId], references: [id], onDelete: Cascade)
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, processedAt])
  @@index([tenantId, priority])
  @@index([tenantId, needsFollowUp])
}

enum EmailPriority {
  URGENT
  HIGH
  NORMAL
  LOW
}

enum EmailCategory {
  SALES_INQUIRY
  SUPPORT_REQUEST
  MEETING_REQUEST
  FOLLOW_UP
  NEWSLETTER
  AUTOMATED
  PERSONAL
  OTHER
}

enum Sentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
  URGENT
}

enum DealSignal {
  NEW_LEAD
  INTEREST_SHOWN
  OBJECTION
  NEGOTIATION
  READY_TO_BUY
  CHURNING
}

// ============================================
// ACTION QUEUE (HITL safety)
// ============================================
model ActionQueue {
  id              String       @id @default(cuid())
  tenantId        String
  userId          String
  emailId         String?

  // Action Details
  actionType      ActionType
  actionPayload   Json         // Type-specific payload

  // AI Confidence
  confidence      Float        @default(0)
  reasoning       String?      @db.Text

  // HITL Status
  status          ActionStatus @default(PENDING_APPROVAL)
  approvedBy      String?
  approvedAt      DateTime?
  rejectedReason  String?

  // Execution
  executedAt      DateTime?
  executionResult Json?
  executionError  String?
  retryCount      Int          @default(0)

  // Metadata
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  expiresAt       DateTime?

  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  email           Email?       @relation(fields: [emailId], references: [id], onDelete: SetNull)
  tenant          Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, status])
  @@index([tenantId, userId, status])
  @@index([expiresAt])
}

enum ActionType {
  SEND_EMAIL
  SCHEDULE_MEETING
  CREATE_TASK
  UPDATE_CONTACT
  UPDATE_DEAL
  ADD_LABEL
  ARCHIVE_EMAIL
  SNOOZE_EMAIL
}

enum ActionStatus {
  PENDING_APPROVAL
  APPROVED
  AUTO_APPROVED
  REJECTED
  EXECUTED
  FAILED
  EXPIRED
}

// ============================================
// CRM: DEALS (for sellers)
// ============================================
model Deal {
  id              String      @id @default(cuid())
  tenantId        String
  userId          String
  contactId       String

  // Deal Info
  name            String
  value           Float       @default(0)
  currency        String      @default("USD")
  stage           String      @default("LEAD")
  probability     Float       @default(0)

  // Dates
  expectedCloseDate DateTime?
  actualCloseDate DateTime?

  // Source
  sourceEmailId   String?
  sourceChannel   String      @default("email")

  // Status
  status          DealStatus  @default(OPEN)
  lostReason      String?

  // Metadata
  notes           String?     @db.Text
  customFields    Json        @default("{}")

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  contact         Contact     @relation(fields: [contactId], references: [id], onDelete: Cascade)
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant          Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  activities      DealActivity[]

  @@index([tenantId, userId])
  @@index([tenantId, stage])
  @@index([tenantId, status])
}

enum DealStatus {
  OPEN
  WON
  LOST
}

model DealActivity {
  id          String   @id @default(cuid())
  dealId      String
  emailId     String?

  activityType DealActivityType
  description String?
  metadata    Json     @default("{}")

  createdAt   DateTime @default(now())

  deal        Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)

  @@index([dealId])
}

enum DealActivityType {
  EMAIL_RECEIVED
  EMAIL_SENT
  CALL_LOGGED
  MEETING_SCHEDULED
  STAGE_CHANGED
  NOTE_ADDED
  DEAL_CREATED
  DEAL_WON
  DEAL_LOST
}

// ============================================
// SUBSCRIPTIONS (Autumn integration)
// ============================================
model Subscription {
  id              String   @id @default(cuid())
  tenantId        String   @unique

  // Autumn Fields
  autumnCustomerId String?  @unique
  autumnSubscriptionId String? @unique

  // Plan
  plan            SubscriptionPlan @default(FREE)
  status          SubscriptionStatus @default(ACTIVE)

  // Limits
  monthlyEmailLimit Int     @default(100)
  monthlyAICallLimit Int    @default(50)
  maxUsers        Int       @default(1)

  // Usage This Month
  emailsProcessed Int       @default(0)
  aiCallsUsed     Int       @default(0)
  usageResetAt    DateTime  @default(now())

  // Billing
  currentPeriodStart DateTime?
  currentPeriodEnd DateTime?
  cancelAt        DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

enum SubscriptionPlan {
  FREE
  STARTER
  PROFESSIONAL
  ENTERPRISE
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
}
```

---

## 2. Service Architecture

### 2.1 Service Map (6 services vs 36)

```
CURRENT (36 services, ~22,000 lines)          REFACTORED (6 services, ~3,000 lines)
─────────────────────────────────────         ─────────────────────────────────────
voltagent.service.ts (1,976 lines)     ─┐
supervisor.agent.ts (434 lines)         │
email.agent.ts                          │
knowledge.agent.ts                      ├──►  email-classifier.service.ts (~600 lines)
unified-knowledge.agent.ts              │     - 1 LLM call per email (or batch of 10)
analytics.agent.ts                      │     - Returns: EmailAnalysis
contacts.agent.ts                       │
calendar.agent.ts                      ─┘

follow-up.service.ts (897 lines)       ─┐
deadline.service.ts                     ├──►  action-queue.service.ts (~500 lines)
action-item.service.ts (1,005 lines)    │     - HITL approval queue
action-executor.service.ts (1,829 lines)┘     - Auto-approve based on confidence threshold

relationship-intelligence.service.ts   ─┐
contact-scoring.service.ts              ├──►  crm-updater.service.ts (~400 lines)
deal pipeline logic                    ─┘     - Update contacts, deals from email signals

daily-briefing.service.ts (848 lines)  ────►  briefing-builder.service.ts (~300 lines)
                                              - Aggregate stats, build morning brief

smart-reply.service.ts                 ─┐
writing-style.service.ts                ├──►  compose-helper.service.ts (~400 lines)
email-composer.service.ts              ─┘     - Smart reply, style matching

memory.service.ts (1,120 lines)        ─┐
long-term-memory.service.ts (1,049)     │
summarization.queue.ts                  ├──►  DELETED (use PostgreSQL UserPreferences)
session-bridge.service.ts               │
episodic-memory.service.ts             ─┘

subscription-gate.service.ts (NEW)     ────►  subscription-gate.service.ts (~200 lines)
                                              - Autumn webhook handler
                                              - Usage tracking, limit enforcement
```

### 2.2 Service Details

#### email-classifier.service.ts (~600 lines)

```typescript
@Injectable()
export class EmailClassifierService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly prisma: PrismaService,
    private readonly subscriptionGate: SubscriptionGateService,
  ) {}

  /**
   * Single LLM call to classify email
   * Returns: priority, category, sentiment, deadline, followUp, CRM signals
   */
  async classifyEmail(email: Email, userPrefs: UserPreferences): Promise<EmailAnalysis> {
    // Check subscription limits
    await this.subscriptionGate.checkAICallLimit(email.tenantId);

    const prompt = this.buildClassificationPrompt(email, userPrefs);

    const startTime = Date.now();
    const response = await this.openai.chat({
      model: 'gpt-4o-mini', // Fast, cheap
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });
    const latencyMs = Date.now() - startTime;

    const result = JSON.parse(response.choices[0].message.content);

    // Save analysis
    return this.prisma.emailAnalysis.create({
      data: {
        emailId: email.id,
        tenantId: email.tenantId,
        priority: result.priority,
        category: result.category,
        sentiment: result.sentiment,
        hasDeadline: result.hasDeadline,
        deadlineDate: result.deadlineDate ? new Date(result.deadlineDate) : null,
        needsFollowUp: result.needsFollowUp,
        followUpDate: result.followUpDate ? new Date(result.followUpDate) : null,
        isSalesLead: result.isSalesLead,
        dealSignal: result.dealSignal,
        buyingIntent: result.buyingIntent,
        suggestedActions: result.suggestedActions,
        summary: result.summary,
        keyPoints: result.keyPoints,
        modelUsed: 'gpt-4o-mini',
        tokensUsed: response.usage?.total_tokens || 0,
        latencyMs,
      },
    });
  }

  /**
   * Batch classify 10 emails in 1 LLM call (10x cost reduction)
   */
  async classifyBatch(emails: Email[], userPrefs: UserPreferences): Promise<EmailAnalysis[]> {
    // For high-volume users (Professional+)
    const prompt = this.buildBatchPrompt(emails, userPrefs);
    // ... similar to single but returns array
  }

  private buildClassificationPrompt(email: Email, prefs: UserPreferences): string {
    return `Analyze this email and return JSON:
{
  "priority": "URGENT|HIGH|NORMAL|LOW",
  "category": "SALES_INQUIRY|SUPPORT_REQUEST|MEETING_REQUEST|FOLLOW_UP|NEWSLETTER|AUTOMATED|PERSONAL|OTHER",
  "sentiment": "POSITIVE|NEUTRAL|NEGATIVE|URGENT",
  "hasDeadline": boolean,
  "deadlineDate": "ISO date or null",
  "needsFollowUp": boolean,
  "followUpDate": "ISO date or null (default ${prefs.defaultFollowUpDays} days)",
  "isSalesLead": boolean,
  "dealSignal": "NEW_LEAD|INTEREST_SHOWN|OBJECTION|NEGOTIATION|READY_TO_BUY|CHURNING|null",
  "buyingIntent": 0-1 score or null,
  "suggestedActions": [{"type": "SEND_EMAIL|SCHEDULE_MEETING|CREATE_TASK|UPDATE_CONTACT", "description": "..."}],
  "summary": "1-2 sentence summary",
  "keyPoints": ["point1", "point2"]
}

User Context:
- Communication Style: ${prefs.communicationStyle}
- Proactivity: ${prefs.proactivityLevel}
- CRM Enabled: ${prefs.aiCRMEnabled}

Email:
From: ${email.fromAddress}
Subject: ${email.subject}
Body:
${email.textBody?.slice(0, 2000)}`;
  }
}
```

#### action-queue.service.ts (~500 lines)

```typescript
@Injectable()
export class ActionQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hitl: HITLService, // Keep existing HITL for safety!
  ) {}

  /**
   * Queue action for approval (or auto-approve if confidence > threshold)
   */
  async queueAction(
    userId: string,
    tenantId: string,
    action: ActionSuggestion,
    emailAnalysis: EmailAnalysis,
  ): Promise<ActionQueue> {
    const userPrefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    const shouldAutoApprove =
      action.confidence >= (userPrefs?.aiAutoApproveThreshold || 0.9) &&
      !this.isDangerousAction(action.type);

    return this.prisma.actionQueue.create({
      data: {
        tenantId,
        userId,
        emailId: emailAnalysis.emailId,
        actionType: action.type,
        actionPayload: action.payload,
        confidence: action.confidence,
        reasoning: action.reasoning,
        status: shouldAutoApprove ? 'AUTO_APPROVED' : 'PENDING_APPROVAL',
        expiresAt: this.getExpiryDate(action.type),
      },
    });
  }

  /**
   * HITL: Approve action
   */
  async approveAction(actionId: string, userId: string): Promise<void> {
    await this.prisma.actionQueue.update({
      where: { id: actionId },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    await this.executeAction(actionId);
  }

  /**
   * HITL: Reject action
   */
  async rejectAction(actionId: string, userId: string, reason: string): Promise<void> {
    await this.prisma.actionQueue.update({
      where: { id: actionId },
      data: {
        status: 'REJECTED',
        approvedBy: userId,
        rejectedReason: reason,
      },
    });
  }

  /**
   * Execute approved action
   */
  private async executeAction(actionId: string): Promise<void> {
    const action = await this.prisma.actionQueue.findUnique({
      where: { id: actionId },
    });

    try {
      switch (action.actionType) {
        case 'SEND_EMAIL':
          await this.executeSendEmail(action);
          break;
        case 'SCHEDULE_MEETING':
          await this.executeScheduleMeeting(action);
          break;
        case 'UPDATE_CONTACT':
          await this.executeUpdateContact(action);
          break;
        case 'UPDATE_DEAL':
          await this.executeUpdateDeal(action);
          break;
        // ... other actions
      }

      await this.prisma.actionQueue.update({
        where: { id: actionId },
        data: {
          status: 'EXECUTED',
          executedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.actionQueue.update({
        where: { id: actionId },
        data: {
          status: 'FAILED',
          executionError: error.message,
          retryCount: { increment: 1 },
        },
      });
    }
  }

  private isDangerousAction(type: ActionType): boolean {
    // Never auto-approve these
    return ['SEND_EMAIL', 'UPDATE_DEAL'].includes(type);
  }
}
```

#### crm-updater.service.ts (~400 lines)

```typescript
@Injectable()
export class CRMUpdaterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update CRM from email analysis signals
   */
  async processEmailSignals(
    emailAnalysis: EmailAnalysis,
    email: Email,
  ): Promise<void> {
    if (!emailAnalysis.isSalesLead) return;

    // Find or create contact
    const contact = await this.findOrCreateContact(email);

    // Update deal based on signal
    if (emailAnalysis.dealSignal) {
      await this.updateDealFromSignal(
        contact,
        emailAnalysis.dealSignal,
        emailAnalysis.buyingIntent,
        email,
      );
    }

    // Update contact engagement score
    await this.updateContactScore(contact, emailAnalysis);
  }

  private async updateDealFromSignal(
    contact: Contact,
    signal: DealSignal,
    buyingIntent: number | null,
    email: Email,
  ): Promise<void> {
    let deal = await this.prisma.deal.findFirst({
      where: {
        contactId: contact.id,
        status: 'OPEN',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!deal && signal === 'NEW_LEAD') {
      // Create new deal
      deal = await this.prisma.deal.create({
        data: {
          tenantId: contact.tenantId,
          userId: email.userId,
          contactId: contact.id,
          name: `Deal with ${contact.name || contact.email}`,
          stage: 'LEAD',
          sourceEmailId: email.id,
          probability: buyingIntent || 0.1,
        },
      });
    }

    if (deal) {
      // Update stage based on signal
      const newStage = this.signalToStage(signal, deal.stage);

      await this.prisma.deal.update({
        where: { id: deal.id },
        data: {
          stage: newStage,
          probability: buyingIntent || deal.probability,
        },
      });

      // Log activity
      await this.prisma.dealActivity.create({
        data: {
          dealId: deal.id,
          emailId: email.id,
          activityType: 'EMAIL_RECEIVED',
          description: `Signal: ${signal}`,
        },
      });
    }
  }

  private signalToStage(signal: DealSignal, currentStage: string): string {
    const stageMap: Record<DealSignal, string> = {
      NEW_LEAD: 'LEAD',
      INTEREST_SHOWN: 'QUALIFIED',
      OBJECTION: currentStage, // Don't regress
      NEGOTIATION: 'NEGOTIATION',
      READY_TO_BUY: 'PROPOSAL',
      CHURNING: currentStage, // Flag but don't change
    };
    return stageMap[signal] || currentStage;
  }
}
```

#### subscription-gate.service.ts (~200 lines)

```typescript
@Injectable()
export class SubscriptionGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if tenant can make AI call
   */
  async checkAICallLimit(tenantId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new ForbiddenException('No subscription found');
    }

    // Reset monthly usage if needed
    if (this.shouldResetUsage(subscription.usageResetAt)) {
      await this.resetMonthlyUsage(tenantId);
    }

    if (subscription.aiCallsUsed >= subscription.monthlyAICallLimit) {
      throw new ForbiddenException(
        `AI call limit reached (${subscription.monthlyAICallLimit}/month). Upgrade plan.`,
      );
    }

    // Increment usage
    await this.prisma.subscription.update({
      where: { tenantId },
      data: { aiCallsUsed: { increment: 1 } },
    });
  }

  /**
   * Handle Autumn webhook
   */
  async handleAutumnWebhook(event: AutumnWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'subscription.created':
      case 'subscription.updated':
        await this.updateSubscription(event.data);
        break;
      case 'subscription.canceled':
        await this.cancelSubscription(event.data);
        break;
      case 'invoice.paid':
        await this.activateSubscription(event.data);
        break;
    }
  }

  /**
   * Get plan limits
   */
  getPlanLimits(plan: SubscriptionPlan): PlanLimits {
    const limits: Record<SubscriptionPlan, PlanLimits> = {
      FREE: { monthlyEmailLimit: 100, monthlyAICallLimit: 50, maxUsers: 1 },
      STARTER: { monthlyEmailLimit: 1000, monthlyAICallLimit: 500, maxUsers: 3 },
      PROFESSIONAL: { monthlyEmailLimit: 10000, monthlyAICallLimit: 5000, maxUsers: 10 },
      ENTERPRISE: { monthlyEmailLimit: -1, monthlyAICallLimit: -1, maxUsers: -1 }, // Unlimited
    };
    return limits[plan];
  }
}
```

---

## 3. Email Processing Flow

### 3.1 Unified Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EMAIL PROCESSING FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐     ┌──────────────┐     ┌─────────────────┐
  │  EMAIL   │────►│  SYNC TO DB  │────►│ SUBSCRIPTION    │
  │ RECEIVED │     │  (existing)  │     │ GATE CHECK      │
  └──────────┘     └──────────────┘     └────────┬────────┘
                                                 │
                           ┌─────────────────────▼─────────────────────┐
                           │         EMAIL CLASSIFIER SERVICE          │
                           │          (1 LLM call per email)           │
                           │                                           │
                           │  IN:  email, user_preferences             │
                           │  OUT: EmailAnalysis                       │
                           │       - priority                          │
                           │       - category                          │
                           │       - sentiment                         │
                           │       - deadline/followUp dates           │
                           │       - CRM signals                       │
                           │       - suggested actions                 │
                           │       - summary                           │
                           └────────────────────┬──────────────────────┘
                                                │
          ┌────────────────────┬────────────────┼────────────────┬──────────────────┐
          │                    │                │                │                  │
          ▼                    ▼                ▼                ▼                  ▼
   ┌─────────────┐     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   ┌─────────────┐
   │ SAVE TO DB  │     │ CRM UPDATER │  │ ACTION      │  │ NOTIFICATION│   │ DAILY       │
   │ EmailAnalysis     │ (if CRM      │  │ QUEUE       │  │ (if URGENT) │   │ BRIEFING    │
   │             │     │  signals)   │  │ (HITL)      │  │             │   │ AGGREGATE   │
   └─────────────┘     └─────────────┘  └─────────────┘  └─────────────┘   └─────────────┘
                              │                │
                              ▼                ▼
                       ┌─────────────┐  ┌─────────────┐
                       │ UPDATE      │  │ PENDING     │
                       │ DEAL/CONTACT│  │ APPROVAL    │
                       └─────────────┘  │ QUEUE       │
                                        └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │ USER REVIEWS│
                                        │ IN INBOX    │
                                        └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │ APPROVE/    │
                                        │ REJECT      │
                                        └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │ EXECUTE     │
                                        │ ACTION      │
                                        └─────────────┘
```

### 3.2 Processing Code

```typescript
// email-processor.service.ts - The main orchestrator (~200 lines)

@Injectable()
export class EmailProcessorService {
  constructor(
    private readonly classifier: EmailClassifierService,
    private readonly actionQueue: ActionQueueService,
    private readonly crmUpdater: CRMUpdaterService,
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Process new email through unified pipeline
   * Called after email sync completes
   */
  async processEmail(email: Email): Promise<void> {
    // Get user preferences (replaces memory lookup)
    const userPrefs = await this.prisma.userPreferences.findUnique({
      where: { userId: email.userId },
    });

    if (!userPrefs) return; // No AI for this user

    // 1. CLASSIFY (1 LLM call)
    const analysis = await this.classifier.classifyEmail(email, userPrefs);

    // 2. UPDATE CRM (if enabled & signals detected)
    if (userPrefs.aiCRMEnabled && analysis.isSalesLead) {
      await this.crmUpdater.processEmailSignals(analysis, email);
    }

    // 3. QUEUE ACTIONS (for HITL approval)
    if (analysis.suggestedActions?.length > 0) {
      for (const action of analysis.suggestedActions) {
        await this.actionQueue.queueAction(
          email.userId,
          email.tenantId,
          action,
          analysis,
        );
      }
    }

    // 4. NOTIFY (if urgent)
    if (analysis.priority === 'URGENT') {
      await this.notifications.sendUrgentEmailNotification(email, analysis);
    }
  }

  /**
   * Batch process for high-volume users (Professional+)
   */
  async processBatch(emails: Email[]): Promise<void> {
    if (emails.length === 0) return;

    const userPrefs = await this.prisma.userPreferences.findUnique({
      where: { userId: emails[0].userId },
    });

    // Batch classify (1 LLM call for 10 emails)
    const analyses = await this.classifier.classifyBatch(emails, userPrefs);

    // Process each result
    for (let i = 0; i < emails.length; i++) {
      await this.processAnalysisResult(emails[i], analyses[i], userPrefs);
    }
  }
}
```

---

## 4. API Endpoints

### 4.1 Simplified Controller Structure

```
CURRENT (scattered across modules)          REFACTORED (clean REST)
─────────────────────────────────           ────────────────────────
/api/v1/voltagent/*                  ──►    /api/v1/ai/*
/api/v1/ai/*                                /api/v1/crm/*
/api/v1/follow-ups/*                        /api/v1/actions/*
/api/v1/briefings/*                         /api/v1/subscriptions/*
/api/v1/actions/*
/api/v1/memory/*
```

### 4.2 AI Endpoints

```typescript
// ai.controller.ts

@Controller('api/v1/ai')
@UseGuards(AuthGuard, SubscriptionGuard)
export class AIController {

  // Get daily briefing
  @Get('briefing')
  async getBriefing(@CurrentUser() user: User) {
    return this.briefingBuilder.buildBriefing(user.id);
  }

  // Get email analysis
  @Get('emails/:emailId/analysis')
  async getEmailAnalysis(@Param('emailId') emailId: string) {
    return this.prisma.emailAnalysis.findUnique({ where: { emailId } });
  }

  // Get smart reply suggestions
  @Post('emails/:emailId/smart-reply')
  async getSmartReply(
    @Param('emailId') emailId: string,
    @Body() dto: SmartReplyDto,
  ) {
    return this.composeHelper.generateSmartReply(emailId, dto);
  }

  // Get user preferences
  @Get('preferences')
  async getPreferences(@CurrentUser() user: User) {
    return this.prisma.userPreferences.findUnique({ where: { userId: user.id } });
  }

  // Update user preferences
  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.prisma.userPreferences.update({
      where: { userId: user.id },
      data: dto,
    });
  }
}
```

### 4.3 CRM Endpoints

```typescript
// crm.controller.ts

@Controller('api/v1/crm')
@UseGuards(AuthGuard, SubscriptionGuard)
export class CRMController {

  // List deals
  @Get('deals')
  async listDeals(
    @CurrentUser() user: User,
    @Query() query: ListDealsDto,
  ) {
    return this.prisma.deal.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        status: query.status,
        stage: query.stage,
      },
      include: { contact: true, activities: { take: 5 } },
      orderBy: { updatedAt: 'desc' },
      take: query.limit || 20,
    });
  }

  // Get deal
  @Get('deals/:dealId')
  async getDeal(@Param('dealId') dealId: string) {
    return this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { contact: true, activities: true },
    });
  }

  // Update deal stage
  @Patch('deals/:dealId')
  async updateDeal(
    @Param('dealId') dealId: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.prisma.deal.update({
      where: { id: dealId },
      data: dto,
    });
  }

  // Get pipeline summary
  @Get('pipeline')
  async getPipelineSummary(@CurrentUser() user: User) {
    return this.prisma.deal.groupBy({
      by: ['stage'],
      where: { tenantId: user.tenantId, status: 'OPEN' },
      _count: true,
      _sum: { value: true },
    });
  }
}
```

### 4.4 Actions Endpoints (HITL)

```typescript
// actions.controller.ts

@Controller('api/v1/actions')
@UseGuards(AuthGuard)
export class ActionsController {

  // List pending actions
  @Get('pending')
  async listPending(@CurrentUser() user: User) {
    return this.prisma.actionQueue.findMany({
      where: {
        userId: user.id,
        status: 'PENDING_APPROVAL',
      },
      include: { email: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Approve action
  @Post(':actionId/approve')
  async approve(
    @CurrentUser() user: User,
    @Param('actionId') actionId: string,
  ) {
    return this.actionQueue.approveAction(actionId, user.id);
  }

  // Reject action
  @Post(':actionId/reject')
  async reject(
    @CurrentUser() user: User,
    @Param('actionId') actionId: string,
    @Body() dto: RejectActionDto,
  ) {
    return this.actionQueue.rejectAction(actionId, user.id, dto.reason);
  }

  // Bulk approve
  @Post('bulk/approve')
  async bulkApprove(
    @CurrentUser() user: User,
    @Body() dto: BulkApproveDto,
  ) {
    for (const actionId of dto.actionIds) {
      await this.actionQueue.approveAction(actionId, user.id);
    }
    return { approved: dto.actionIds.length };
  }
}
```

### 4.5 Subscription Endpoints

```typescript
// subscriptions.controller.ts

@Controller('api/v1/subscriptions')
export class SubscriptionsController {

  // Get current subscription
  @Get()
  @UseGuards(AuthGuard)
  async getSubscription(@CurrentUser() user: User) {
    return this.prisma.subscription.findUnique({
      where: { tenantId: user.tenantId },
    });
  }

  // Get available plans
  @Get('plans')
  async getPlans() {
    return [
      { plan: 'FREE', price: 0, limits: this.subscriptionGate.getPlanLimits('FREE') },
      { plan: 'STARTER', price: 19, limits: this.subscriptionGate.getPlanLimits('STARTER') },
      { plan: 'PROFESSIONAL', price: 49, limits: this.subscriptionGate.getPlanLimits('PROFESSIONAL') },
      { plan: 'ENTERPRISE', price: null, limits: this.subscriptionGate.getPlanLimits('ENTERPRISE') },
    ];
  }

  // Create checkout session (Autumn)
  @Post('checkout')
  @UseGuards(AuthGuard)
  async createCheckout(
    @CurrentUser() user: User,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.autumn.createCheckoutSession({
      tenantId: user.tenantId,
      email: user.email,
      plan: dto.plan,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });
  }

  // Autumn webhook
  @Post('webhooks/autumn')
  async autumnWebhook(
    @Body() body: AutumnWebhookEvent,
    @Headers('autumn-signature') signature: string,
  ) {
    this.autumn.verifySignature(body, signature);
    return this.subscriptionGate.handleAutumnWebhook(body);
  }
}
```

---

## 5. Migration Plan

### Phase 1: Database (Week 1)

1. Add new Prisma models (UserPreferences, EmailAnalysis, ActionQueue, Deal, Subscription)
2. Run migration: `npx prisma migrate dev --name ai-refactor-v2`
3. Create seed script to migrate existing data

### Phase 2: Core Services (Week 2)

1. Create `email-classifier.service.ts`
2. Create `action-queue.service.ts` (wrap existing HITL)
3. Create `crm-updater.service.ts`
4. Create `subscription-gate.service.ts`

### Phase 3: Integration (Week 3)

1. Wire EmailProcessorService into email sync
2. Create new controllers
3. Test with real emails

### Phase 4: Migration & Cleanup (Week 4)

1. Migrate user preferences from memory services
2. Deprecate old services (don't delete yet)
3. Feature flag: `USE_NEW_AI_PIPELINE`

### Phase 5: Cleanup (Week 5)

1. Delete deprecated services
2. Delete old agents
3. Final testing

---

## 6. Cost Analysis

### Per Email Cost

| Architecture | LLM Calls | Cost per Email | 1000 Users (50 emails/day) |
|--------------|-----------|----------------|---------------------------|
| Current (11 agents) | 11 | $0.055 | $82,500/month |
| Unified (1 call) | 1 | $0.005 | $7,500/month |
| Batched (10 emails/call) | 0.1 | $0.0005 | $750/month |

### Subscription Tiers

| Plan | Price | AI Calls/mo | Emails/mo | Users | Target |
|------|-------|-------------|-----------|-------|--------|
| Free | $0 | 50 | 100 | 1 | Trial |
| Starter | $19 | 500 | 1,000 | 3 | Solo sellers |
| Professional | $49 | 5,000 | 10,000 | 10 | Small teams |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | Large orgs |

---

## 7. Files to Delete After Migration

```
# Agents (~1,300 lines)
src/modules/ai/voltagent/agents/supervisor.agent.ts
src/modules/ai/voltagent/agents/unified-knowledge.agent.ts
src/modules/ai/voltagent/agents/email.agent.ts
src/modules/ai/voltagent/agents/knowledge.agent.ts
src/modules/ai/voltagent/agents/document-library.agent.ts
src/modules/ai/voltagent/agents/analytics.agent.ts
src/modules/ai/voltagent/agents/websearch.agent.ts
src/modules/ai/voltagent/agents/calendar.agent.ts
src/modules/ai/voltagent/agents/contacts.agent.ts
src/modules/ai/voltagent/agents/general.agent.ts

# Memory Services (~2,700 lines)
src/modules/ai/services/memory.service.ts
src/modules/ai/services/long-term-memory.service.ts
src/modules/ai/queues/summarization.queue.ts
src/modules/ai/services/session-bridge.service.ts
src/modules/ai/services/episodic-memory.service.ts

# Consolidate into smaller services
src/modules/ai/services/voltagent.service.ts (1,976 lines → delete)
src/modules/ai/services/action-executor.service.ts (1,829 lines → integrate into action-queue)
src/modules/ai/services/knowledge-base.service.ts (1,112 lines → delete)
```

---

## 8. Keep These Services

| Service | Lines | Reason |
|---------|-------|--------|
| hitl.service.ts | 592 | Safety critical - NEVER DELETE |
| follow-up.service.ts | 897 | Core CRM feature |
| daily-briefing.service.ts | 848 | Core feature (refactor to ~300) |
| smart-reply.service.ts | ~400 | Core feature |
| writing-style.service.ts | ~300 | Style matching |

---

## References

- [Autumn Docs](https://docs.useautumn.com/)
- [VoltAgent](https://voltagent.dev/)
- [Superhuman Features](https://superhuman.com/features)
