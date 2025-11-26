# AI Improvement Roadmap 2025 - MailAgent (PMS/PMSync)

**Version:** 1.0.0
**Created:** 2025-11-26
**Status:** Active Development
**Based on:** Comprehensive Audits (Backend, Frontend, Zero-main patterns, Multi-agent docs)

---

## Executive Summary

This roadmap addresses critical improvements identified through comprehensive audits of the MailAgent AI system. It incorporates best practices from the Zero-main example project and industry standards to transform PMS into a truly intelligent, user-customizable personal assistant.

### Key Audit Findings

| Area | Critical Issues | Priority |
|------|----------------|----------|
| **Security** | pgvector SQL injection vulnerability | P0 - CRITICAL |
| **Configuration** | 20+ hardcoded values need externalization | P0 |
| **Learning** | Simplistic feedback loop, no visualization | P1 |
| **Personalization** | Basic job roles, no writing style analysis | P1 |
| **Dashboard** | Needs complete redesign for usefulness | P1 |
| **User Customization** | Limited task/action modification | P1 |
| **Chat Persistence** | No conversation history across sessions | P2 |
| **Provider Labeling** | Mail providers not clearly labeled | P2 |

---

## Phase 0: Critical Security Fixes [P0 - IMMEDIATE]

**Duration:** 1-2 days
**Owner:** Backend Team

### 0.1 Fix pgvector SQL Injection

**Location:** `backend/src/modules/ai/services/knowledge-base.service.ts`

**Current (Vulnerable):**
```typescript
// Direct string interpolation in SQL - VULNERABLE
const results = await this.prisma.$queryRaw`
  SELECT * FROM embeddings
  WHERE embedding <-> ${vector}::vector < ${threshold}
`;
```

**Fixed (Safe):**
```typescript
// Use parameterized queries with proper escaping
async searchByEmbedding(
  tenantId: string,
  vector: number[],
  threshold: number = 0.5,
  limit: number = 10
): Promise<EmbeddingResult[]> {
  // Validate inputs
  if (!Array.isArray(vector) || vector.some(v => typeof v !== 'number')) {
    throw new BadRequestException('Invalid embedding vector');
  }

  // Use Prisma's safe query builder where possible
  // For raw pgvector queries, use explicit parameterization
  const vectorString = `[${vector.join(',')}]`;

  return this.prisma.$queryRaw`
    SELECT id, content, document_name, similarity
    FROM (
      SELECT
        id,
        content,
        document_name,
        1 - (embedding <=> ${vectorString}::vector) as similarity
      FROM "KnowledgeChunk"
      WHERE "tenantId" = ${tenantId}
    ) subquery
    WHERE similarity > ${threshold}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
}
```

### 0.2 Add Input Validation

**File:** `backend/src/modules/ai/dto/embedding.dto.ts`

```typescript
import { IsArray, IsNumber, ArrayMinSize, ArrayMaxSize, Min, Max } from 'class-validator';

export class EmbeddingSearchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4096) // Mistral embedding dimension
  @IsNumber({}, { each: true })
  vector: number[];

  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number = 0.5;

  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
```

### 0.3 Security Checklist

- [ ] Fix pgvector SQL injection in knowledge-base.service.ts
- [ ] Add input validation DTOs for all AI endpoints
- [ ] Review all `$queryRaw` usages for SQL injection
- [ ] Add rate limiting to AI endpoints (see Phase 1)
- [ ] Audit logging for all AI operations

---

## Phase 1: Configuration Externalization [P0]

**Duration:** 3-5 days
**Goal:** Remove all hardcoded values, make system configurable

### 1.1 Create Central AI Configuration

**File:** `backend/src/config/ai.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  // Model Configuration
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    defaultModel: process.env.AI_DEFAULT_MODEL || 'mistral-small-latest',
    routerModel: process.env.AI_ROUTER_MODEL || 'mistral-small-latest',
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'mistral-embed',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2048'),
  },

  // Memory Configuration
  memory: {
    maxHistoryLength: parseInt(process.env.AI_MAX_HISTORY || '50'),
    sessionTTLSeconds: parseInt(process.env.AI_SESSION_TTL || '3600'),
    fifoTrimSize: parseInt(process.env.AI_FIFO_TRIM || '10'),
  },

  // HITL Configuration
  hitl: {
    defaultAutoApproveThreshold: parseFloat(process.env.AI_AUTO_APPROVE_THRESHOLD || '0.9'),
    actionExpirationHours: parseInt(process.env.AI_ACTION_EXPIRATION || '24'),
    maxPendingActionsPerUser: parseInt(process.env.AI_MAX_PENDING_ACTIONS || '50'),
  },

  // Learning Configuration
  learning: {
    minSamplesForAdjustment: parseInt(process.env.AI_MIN_LEARNING_SAMPLES || '5'),
    confidenceBoostMax: parseFloat(process.env.AI_CONFIDENCE_BOOST_MAX || '0.15'),
    confidencePenaltyMax: parseFloat(process.env.AI_CONFIDENCE_PENALTY_MAX || '0.2'),
    learningDecayFactor: parseFloat(process.env.AI_LEARNING_DECAY || '0.95'),
  },

  // Rate Limiting
  rateLimit: {
    requestsPerMinute: parseInt(process.env.AI_RATE_LIMIT_RPM || '30'),
    requestsPerDay: parseInt(process.env.AI_RATE_LIMIT_RPD || '1000'),
    concurrentRequests: parseInt(process.env.AI_CONCURRENT_LIMIT || '3'),
  },

  // Feature Flags
  features: {
    smartRepliesEnabled: process.env.AI_SMART_REPLIES !== 'false',
    summarizationEnabled: process.env.AI_SUMMARIZATION !== 'false',
    schedulingEnabled: process.env.AI_SCHEDULING !== 'false',
    contactDedupeEnabled: process.env.AI_CONTACT_DEDUPE !== 'false',
    proactiveInsightsEnabled: process.env.AI_PROACTIVE !== 'false',
  },

  // Agent-specific Configuration
  agents: {
    email: {
      maxSmartReplies: parseInt(process.env.AI_MAX_SMART_REPLIES || '3'),
      summaryMaxLength: parseInt(process.env.AI_SUMMARY_MAX_LENGTH || '500'),
    },
    calendar: {
      maxSuggestedSlots: parseInt(process.env.AI_MAX_CALENDAR_SLOTS || '5'),
      businessHoursStart: parseInt(process.env.AI_BUSINESS_START || '9'),
      businessHoursEnd: parseInt(process.env.AI_BUSINESS_END || '17'),
    },
    contacts: {
      dedupeThreshold: parseFloat(process.env.AI_DEDUPE_THRESHOLD || '0.7'),
      maxMergeSuggestions: parseInt(process.env.AI_MAX_MERGE_SUGGESTIONS || '10'),
    },
  },
}));
```

### 1.2 Environment Template

**File:** `.env.ai.example`

```bash
# ===========================================
# AI Configuration - MailAgent (PMS)
# ===========================================

# Model Configuration
MISTRAL_API_KEY=your-api-key-here
AI_DEFAULT_MODEL=mistral-small-latest
AI_ROUTER_MODEL=mistral-small-latest
AI_EMBEDDING_MODEL=mistral-embed
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=2048

# Memory Configuration
AI_MAX_HISTORY=50
AI_SESSION_TTL=3600
AI_FIFO_TRIM=10

# HITL Configuration
AI_AUTO_APPROVE_THRESHOLD=0.9
AI_ACTION_EXPIRATION=24
AI_MAX_PENDING_ACTIONS=50

# Learning Configuration
AI_MIN_LEARNING_SAMPLES=5
AI_CONFIDENCE_BOOST_MAX=0.15
AI_CONFIDENCE_PENALTY_MAX=0.2
AI_LEARNING_DECAY=0.95

# Rate Limiting
AI_RATE_LIMIT_RPM=30
AI_RATE_LIMIT_RPD=1000
AI_CONCURRENT_LIMIT=3

# Feature Flags
AI_SMART_REPLIES=true
AI_SUMMARIZATION=true
AI_SCHEDULING=true
AI_CONTACT_DEDUPE=true
AI_PROACTIVE=false

# Agent-specific
AI_MAX_SMART_REPLIES=3
AI_SUMMARY_MAX_LENGTH=500
AI_MAX_CALENDAR_SLOTS=5
AI_BUSINESS_START=9
AI_BUSINESS_END=17
AI_DEDUPE_THRESHOLD=0.7
AI_MAX_MERGE_SUGGESTIONS=10
```

### 1.3 Add Rate Limiting

**File:** `backend/src/modules/ai/guards/ai-rate-limit.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const tenantId = request.user?.tenantId;

    if (!userId || !tenantId) return true;

    const rpmLimit = this.configService.get<number>('ai.rateLimit.requestsPerMinute');
    const rpdLimit = this.configService.get<number>('ai.rateLimit.requestsPerDay');

    // Check per-minute rate
    const minuteKey = `ai:rate:${tenantId}:${userId}:minute`;
    const minuteCount = await this.incrementCounter(minuteKey, 60);

    if (minuteCount > rpmLimit) {
      throw new HttpException(
        'AI rate limit exceeded. Please wait a moment.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Check per-day rate
    const dayKey = `ai:rate:${tenantId}:${userId}:day`;
    const dayCount = await this.incrementCounter(dayKey, 86400);

    if (dayCount > rpdLimit) {
      throw new HttpException(
        'Daily AI request limit exceeded.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }

  private async incrementCounter(key: string, ttl: number): Promise<number> {
    const current = await this.cacheManager.get<number>(key) || 0;
    const newValue = current + 1;
    await this.cacheManager.set(key, newValue, ttl * 1000);
    return newValue;
  }
}
```

---

## Phase 2: Enhanced User Customization [P1]

**Duration:** 1 week
**Goal:** Allow users to fully customize AI behavior and tasks

### 2.1 User Task Templates

Users should be able to define and modify their own task templates.

**Database Schema Addition:**

```prisma
model UserAiTaskTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String

  // Template Definition
  name        String   // e.g., "Quick Reply to Manager"
  description String?
  agentType   String   // EMAIL, CALENDAR, CONTACTS
  actionType  String   // SEND_EMAIL, CREATE_EVENT, etc.

  // Customizable Parameters
  promptTemplate String?  // User's custom prompt modification
  defaultPayload Json?    // Pre-filled action parameters

  // Behavior
  autoApprove   Boolean @default(false)
  customThreshold Float? // Override confidence threshold
  hotkey        String?  // Keyboard shortcut

  // Metadata
  usageCount    Int      @default(0)
  lastUsedAt    DateTime?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tenantId, userId])
  @@index([agentType])
  @@map("user_ai_task_templates")
}
```

### 2.2 Task Template API

**File:** `backend/src/modules/ai/controllers/task-templates.controller.ts`

```typescript
@Controller('ai/task-templates')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiTags('AI Task Templates')
export class TaskTemplatesController {
  constructor(private readonly taskTemplateService: TaskTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'Get user task templates' })
  async getTemplates(@Request() req: AuthenticatedRequest) {
    return this.taskTemplateService.getUserTemplates(
      req.user.tenantId,
      req.user.userId,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create task template' })
  async createTemplate(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateTaskTemplateDto,
  ) {
    return this.taskTemplateService.createTemplate(
      req.user.tenantId,
      req.user.userId,
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update task template' })
  async updateTemplate(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTaskTemplateDto,
  ) {
    return this.taskTemplateService.updateTemplate(
      req.user.tenantId,
      req.user.userId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete task template' })
  async deleteTemplate(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.taskTemplateService.deleteTemplate(
      req.user.tenantId,
      req.user.userId,
      id,
    );
  }

  @Post(':id/execute')
  @ApiOperation({ summary: 'Execute task from template' })
  async executeTemplate(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ExecuteTemplateDto,
  ) {
    return this.taskTemplateService.executeTemplate(
      req.user.tenantId,
      req.user.userId,
      id,
      dto.contextData,
    );
  }
}
```

### 2.3 Frontend Task Customization UI

**File:** `frontend/components/dashboard/ai/TaskTemplateManager.tsx`

```typescript
interface TaskTemplateManagerProps {
  onTemplateSelect?: (template: TaskTemplate) => void;
}

// UI Design:
// ┌─────────────────────────────────────────────────────────────┐
// │ My AI Tasks                                      [+ New]    │
// ├─────────────────────────────────────────────────────────────┤
// │                                                             │
// │  ┌───────────────────────────────────────────────────────┐  │
// │  │ 📧 Quick Reply to Manager           [Edit] [Delete]   │  │
// │  │    Auto-approve: Yes | Shortcut: Ctrl+R               │  │
// │  │    Used 47 times | Last: 2 hours ago                  │  │
// │  └───────────────────────────────────────────────────────┘  │
// │                                                             │
// │  ┌───────────────────────────────────────────────────────┐  │
// │  │ 📅 Weekly Team Meeting              [Edit] [Delete]   │  │
// │  │    Auto-approve: No | Threshold: 0.95                 │  │
// │  │    Used 12 times | Last: 1 week ago                   │  │
// │  └───────────────────────────────────────────────────────┘  │
// │                                                             │
// │  ┌───────────────────────────────────────────────────────┐  │
// │  │ 👥 Find Contact Info                [Edit] [Delete]   │  │
// │  │    Auto-approve: Yes | Shortcut: Ctrl+F               │  │
// │  │    Used 89 times | Last: Today                        │  │
// │  └───────────────────────────────────────────────────────┘  │
// │                                                             │
// └─────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Enhanced Job Role & Profile System [P1]

**Duration:** 1 week
**Goal:** Know actual job of user, not just an array of supposed jobs

### 3.1 Rich Job Profile Schema

**Database Schema Update:**

```prisma
model UserJobProfile {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String   @unique

  // Primary Job Information
  jobTitle         String?   // e.g., "Senior Product Manager"
  department       String?   // e.g., "Product"
  seniority        String?   // ENTRY, MID, SENIOR, LEAD, EXECUTIVE
  industry         String?   // e.g., "Technology", "Finance"
  companySize      String?   // STARTUP, SMB, ENTERPRISE

  // Work Context
  primaryResponsibilities String[]  // What they actually do
  commonTasks            String[]  // Frequent tasks
  keyContacts            Json?     // Important people they interact with
  projectTypes           String[]  // Types of projects they work on

  // Communication Context
  typicalRecipients      Json?     // Who they usually email
  meetingTypes          String[]  // Standup, 1:1, Planning, etc.
  reportingTo           String?   // Manager's role/name
  directReports         Int?      // Number of people reporting to them

  // Time Context
  workSchedule          Json?     // Working hours, meeting-free times
  busySeasons           String[]  // e.g., "Q4 planning", "Year-end"
  vacationPattern       String?   // How they handle OOO

  // Learning from Behavior
  derivedInsights       Json?     // AI-learned patterns
  confidenceScore       Float?    // How confident AI is about profile
  lastAnalyzedAt        DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("user_job_profiles")
}
```

### 3.2 Job Profile Learning Service

**File:** `backend/src/modules/ai/services/job-profile-learning.service.ts`

```typescript
@Injectable()
export class JobProfileLearningService {
  private readonly logger = new Logger(JobProfileLearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
  ) {}

  /**
   * Analyze user's emails to derive job profile insights
   */
  async analyzeUserProfile(tenantId: string, userId: string): Promise<JobProfileInsights> {
    // Get recent sent emails
    const sentEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        folder: 'SENT',
      },
      select: {
        subject: true,
        to: true,
        snippet: true,
        sentAt: true,
      },
      take: 100,
      orderBy: { sentAt: 'desc' },
    });

    // Get calendar events
    const events = await this.prisma.calendarEvent.findMany({
      where: { tenantId },
      select: {
        title: true,
        attendees: true,
        recurrence: true,
      },
      take: 50,
      orderBy: { startTime: 'desc' },
    });

    // Analyze patterns with AI
    const analysis = await this.mistralService.chat({
      model: 'mistral-small-latest',
      messages: [{
        role: 'user',
        content: `Analyze this user's work patterns and derive their likely job profile:

SENT EMAILS (subjects):
${sentEmails.map(e => e.subject).join('\n')}

CALENDAR EVENTS:
${events.map(e => e.title).join('\n')}

Return a JSON object with:
{
  "likelyJobTitle": "string",
  "likelySeniority": "ENTRY|MID|SENIOR|LEAD|EXECUTIVE",
  "primaryResponsibilities": ["string"],
  "commonTaskPatterns": ["string"],
  "communicationStyle": "FORMAL|CASUAL|TECHNICAL",
  "meetingLoadEstimate": "LOW|MEDIUM|HIGH",
  "keyTopics": ["string"],
  "confidence": 0.0-1.0
}`
      }],
      temperature: 0.2,
    });

    return this.parseAnalysis(analysis);
  }

  /**
   * Update profile based on user feedback
   */
  async updateFromFeedback(
    tenantId: string,
    userId: string,
    feedback: JobProfileFeedback,
  ): Promise<void> {
    const existing = await this.prisma.userJobProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      await this.prisma.userJobProfile.create({
        data: {
          tenantId,
          userId,
          ...feedback,
        },
      });
    } else {
      await this.prisma.userJobProfile.update({
        where: { userId },
        data: feedback,
      });
    }
  }
}
```

### 3.3 Job Profile Setup Wizard (Frontend)

**File:** `frontend/components/onboarding/JobProfileWizard.tsx`

```typescript
// Multi-step wizard for setting up job profile
// Step 1: Basic Info (title, department, company size)
// Step 2: Responsibilities (what they do day-to-day)
// Step 3: Communication (who they interact with)
// Step 4: Work Preferences (hours, meeting preferences)
// Step 5: AI Verification (confirm AI-derived insights)

interface JobProfileWizardProps {
  onComplete: (profile: JobProfile) => void;
  initialProfile?: Partial<JobProfile>;
}
```

---

## Phase 4: Mail Provider Labeling [P2]

**Duration:** 3-5 days
**Goal:** Clearly label and differentiate mail providers

### 4.1 Provider Display Enhancement

**File:** `frontend/components/providers/ProviderBadge.tsx`

```typescript
interface ProviderBadgeProps {
  provider: {
    id: string;
    providerType: 'GOOGLE' | 'MICROSOFT' | 'IMAP';
    email: string;
    displayName?: string;
  };
  size?: 'sm' | 'md' | 'lg';
  showEmail?: boolean;
}

const PROVIDER_CONFIG = {
  GOOGLE: {
    icon: GoogleIcon,
    color: '#EA4335',
    bgColor: 'bg-red-50',
    label: 'Gmail',
  },
  MICROSOFT: {
    icon: MicrosoftIcon,
    color: '#00A4EF',
    bgColor: 'bg-blue-50',
    label: 'Outlook',
  },
  IMAP: {
    icon: MailIcon,
    color: '#6B7280',
    bgColor: 'bg-gray-50',
    label: 'IMAP',
  },
};
```

### 4.2 Enhanced Email List with Provider Context

**File:** `frontend/components/email/EmailListItem.tsx` (Update)

```typescript
// Add provider indicator to email list items
<div className="email-list-item">
  <ProviderBadge
    provider={email.provider}
    size="sm"
    className="mr-2"
  />
  <div className="email-content">
    <span className="from">{email.from}</span>
    <span className="subject">{email.subject}</span>
  </div>
</div>
```

### 4.3 Provider-Specific AI Context

When generating AI responses, include provider context:

```typescript
// In EmailAgent prompt
const providerContext = `
The user's email is sent via ${provider.providerType} (${provider.email}).
${provider.providerType === 'GOOGLE' ? 'They use Gmail features like labels and filters.' : ''}
${provider.providerType === 'MICROSOFT' ? 'They use Outlook features like categories and rules.' : ''}
`;
```

---

## Phase 5: Learning Visualization & Memory [P1]

**Duration:** 1-2 weeks
**Goal:** Memorize AI and user HITL to learn from the past, make learning visible

### 5.1 Learning Dashboard Component

**File:** `frontend/components/dashboard/ai/LearningDashboard.tsx`

```typescript
// UI Design:
// ┌─────────────────────────────────────────────────────────────┐
// │ 🧠 AI Learning Progress                                     │
// ├─────────────────────────────────────────────────────────────┤
// │                                                             │
// │  Overall Accuracy: 87% (+5% this month)                     │
// │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░                                   │
// │                                                             │
// │  ┌─────────────┬─────────────┬─────────────┐               │
// │  │ Email       │ Calendar    │ Contacts    │               │
// │  │ 92%         │ 78%         │ 85%         │               │
// │  │ 234 actions │ 45 actions  │ 67 actions  │               │
// │  └─────────────┴─────────────┴─────────────┘               │
// │                                                             │
// │  Recent Learning Events:                                    │
// │  • You corrected "Schedule meeting" → Now 95% accurate     │
// │  • Rejected "Archive email" → Reduced automation           │
// │  • Approved "Send reply" pattern → Now auto-approves       │
// │                                                             │
// │  [View Full History] [Reset Learning] [Export Data]        │
// └─────────────────────────────────────────────────────────────┘
```

### 5.2 Enhanced Feedback Service with History

**File:** `backend/src/modules/ai/multi-agent/services/feedback.service.ts` (Update)

```typescript
@Injectable()
export class EnhancedFeedbackService {
  /**
   * Record detailed feedback with context
   */
  async recordFeedback(params: {
    actionId: string;
    wasApproved: boolean;
    wasSuccessful: boolean;
    userFeedback?: string;
    correctionApplied?: Record<string, any>;
    timeToDecision?: number; // How long user took to approve/reject
  }): Promise<void> {
    // Store detailed feedback
    await this.prisma.agentActionFeedback.create({
      data: {
        actionId: params.actionId,
        ...params,
        metadata: {
          timeToDecision: params.timeToDecision,
          correctionApplied: params.correctionApplied,
        },
      },
    });

    // Update learning profile
    await this.updateLearningProfile(params);

    // Emit real-time event
    this.realtimeService.emitLearningUpdate(params);
  }

  /**
   * Get learning insights for user
   */
  async getLearningInsights(tenantId: string, userId: string): Promise<LearningInsights> {
    const profiles = await this.prisma.agentLearningProfile.findMany({
      where: { tenantId, userId },
    });

    const recentFeedback = await this.prisma.agentActionFeedback.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      overallAccuracy: this.calculateOverallAccuracy(profiles),
      agentBreakdown: this.calculateAgentBreakdown(profiles),
      recentEvents: this.formatRecentEvents(recentFeedback),
      trends: this.calculateTrends(profiles),
      recommendations: this.generateRecommendations(profiles),
    };
  }
}
```

### 5.3 Writing Style Analysis (Zero-main Pattern)

**File:** `backend/src/modules/ai/services/writing-style-analyzer.service.ts`

```typescript
@Injectable()
export class WritingStyleAnalyzerService {
  /**
   * Analyze user's writing style from sent emails
   * Based on Zero-main's 50+ linguistic metrics approach
   */
  async analyzeWritingStyle(tenantId: string, userId: string): Promise<WritingStyleProfile> {
    const sentEmails = await this.prisma.email.findMany({
      where: { tenantId, folder: 'SENT' },
      select: { body: true, subject: true },
      take: 50,
    });

    const analysis = await this.mistralService.chat({
      model: 'mistral-small-latest',
      messages: [{
        role: 'user',
        content: `Analyze the writing style in these emails and return a detailed profile:

EMAILS:
${sentEmails.map((e, i) => `[${i + 1}] Subject: ${e.subject}\nBody: ${e.body?.substring(0, 500)}`).join('\n\n')}

Return JSON with these linguistic metrics:
{
  "formality": 0.0-1.0,
  "technicalLevel": 0.0-1.0,
  "verbosity": "concise|moderate|detailed",
  "sentenceComplexity": 0.0-1.0,
  "commonGreetings": ["string"],
  "commonClosings": ["string"],
  "frequentPhrases": ["string"],
  "punctuationStyle": "minimal|standard|expressive",
  "emojiUsage": "never|rare|occasional|frequent",
  "responseSpeed": "quick|thoughtful|detailed",
  "topicPatterns": {
    "professional": 0.0-1.0,
    "technical": 0.0-1.0,
    "casual": 0.0-1.0
  },
  "uniqueVoiceMarkers": ["string"]
}`
      }],
      temperature: 0.2,
    });

    return this.parseWritingStyle(analysis);
  }

  /**
   * Apply writing style to generated content
   */
  async applyStyleToContent(
    content: string,
    style: WritingStyleProfile,
  ): Promise<string> {
    // Transform generic AI output to match user's style
    return this.mistralService.chat({
      model: 'mistral-small-latest',
      messages: [{
        role: 'user',
        content: `Rewrite this content to match this writing style:

STYLE PROFILE:
- Formality: ${style.formality}
- Common phrases: ${style.frequentPhrases.join(', ')}
- Greeting style: ${style.commonGreetings[0]}
- Closing style: ${style.commonClosings[0]}
- Verbosity: ${style.verbosity}

CONTENT TO REWRITE:
${content}

Rewrite maintaining the meaning but matching the style:`
      }],
      temperature: 0.3,
    });
  }
}
```

---

## Phase 6: Dashboard Redesign [P1]

**Duration:** 2-3 weeks
**Goal:** Completely rewrite /dashboard to make it useful and beautiful

### 6.1 New Dashboard Architecture

**File:** `frontend/pages/dashboard/index.tsx` (Complete Rewrite)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PMS Dashboard                     [Search...] [⚙️] [🔔 3] [👤 Profile] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │ 📧 Email Overview              │  │ 🗓️ Today's Schedule            │ │
│  │                                │  │                                │ │
│  │ Unread: 12  Urgent: 3          │  │ 09:00 - Team Standup          │ │
│  │ Pending replies: 5             │  │ 11:00 - Client Call           │ │
│  │                                │  │ 14:00 - Planning Meeting      │ │
│  │ [View Inbox →]                 │  │                                │ │
│  └────────────────────────────────┘  │ [View Calendar →]             │ │
│                                      └────────────────────────────────┘ │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🤖 AI Assistant                                           [Chat] │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                  │  │
│  │ Quick Actions:                                                   │  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │  │
│  │ │📝 Summary│ │📅 Schedule│ │✉️ Reply  │ │🔍 Search │            │  │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │  │
│  │                                                                  │  │
│  │ Pending Actions (3):                                            │  │
│  │ ┌────────────────────────────────────────────────────────────┐  │  │
│  │ │ 📧 Send reply to John about Q4 budget    [✓] [✗] [Edit]   │  │  │
│  │ │ 📅 Schedule meeting with team            [✓] [✗] [Edit]   │  │  │
│  │ │ 👥 Merge duplicate: John Smith           [✓] [✗] [Review] │  │  │
│  │ └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │ 🧠 AI Learning                 │  │ 📊 Activity Summary            │ │
│  │                                │  │                                │ │
│  │ Accuracy: 87% (+5%)            │  │ Emails processed: 234          │ │
│  │ Actions approved: 156          │  │ Meetings scheduled: 12         │ │
│  │ Time saved: ~4.5 hours         │  │ Contacts updated: 45           │ │
│  │                                │  │                                │ │
│  │ [View Details →]               │  │ [View Analytics →]             │ │
│  └────────────────────────────────┘  └────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Dashboard Components

**New Files to Create:**

```
frontend/components/dashboard/
├── overview/
│   ├── EmailOverviewCard.tsx      # Unread count, urgent, pending
│   ├── CalendarTodayCard.tsx      # Today's events at a glance
│   ├── ActivitySummaryCard.tsx    # Weekly/monthly stats
│   └── QuickActionsGrid.tsx       # Common AI actions
├── ai/
│   ├── AiAssistantPanel.tsx       # Main AI interaction area
│   ├── PendingActionsInline.tsx   # Approve/reject inline
│   ├── LearningProgressCard.tsx   # AI learning summary
│   └── QuickActionButton.tsx      # Single quick action
├── notifications/
│   ├── NotificationBell.tsx       # Bell icon with badge
│   ├── NotificationDropdown.tsx   # Dropdown list
│   └── NotificationItem.tsx       # Single notification
└── layout/
    ├── DashboardHeader.tsx        # Top header bar
    ├── DashboardGrid.tsx          # Responsive grid layout
    └── DashboardSidebar.tsx       # Optional sidebar
```

### 6.3 Dashboard Store

**File:** `frontend/stores/dashboard-store.ts`

```typescript
interface DashboardState {
  // Overview Data
  emailStats: {
    unreadCount: number;
    urgentCount: number;
    pendingRepliesCount: number;
    lastUpdated: Date;
  };

  todayEvents: CalendarEvent[];

  activitySummary: {
    emailsProcessed: number;
    meetingsScheduled: number;
    contactsUpdated: number;
    period: 'day' | 'week' | 'month';
  };

  // AI State
  pendingActions: PendingAction[];
  learningProgress: {
    overallAccuracy: number;
    accuracyChange: number;
    actionsApproved: number;
    timeSavedMinutes: number;
  };

  // UI State
  isLoading: boolean;
  refreshInterval: number;
  layout: 'grid' | 'list';

  // Actions
  refreshDashboard: () => Promise<void>;
  setRefreshInterval: (ms: number) => void;
}
```

---

## Phase 7: Chat History Persistence [P2]

**Duration:** 3-5 days
**Goal:** Persist conversation history across sessions

### 7.1 Chat Session Management

**Database Schema:**

```prisma
model AiChatSession {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String

  title       String?  // Auto-generated or user-set
  messages    Json     // Array of messages

  // Context
  lastAgentUsed String?
  lastIntent    String?

  // Metadata
  messageCount  Int     @default(0)
  isArchived    Boolean @default(false)
  isPinned      Boolean @default(false)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  lastMessageAt DateTime?

  @@index([tenantId, userId])
  @@index([updatedAt])
  @@map("ai_chat_sessions")
}
```

### 7.2 Chat History UI

**File:** `frontend/components/ai/ChatHistory.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│ Chat History                              [New Chat +]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📌 Pinned                                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Q4 Budget Discussion                      2 days ago  │  │
│  │ "Help me draft a response to..."                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Today                                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Meeting Scheduling                        10:30 AM    │  │
│  │ "Schedule meeting with John..."                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Yesterday                                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Contact Lookup                            3:45 PM     │  │
│  │ "Find contact info for..."                            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Load More...]                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority Matrix

### Immediate (This Week)
| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Fix pgvector SQL injection | P0 | 2h | Critical Security |
| Add AI rate limiting | P0 | 4h | Security/Stability |
| Externalize hardcoded values | P0 | 8h | Maintainability |

### Short Term (2-4 Weeks)
| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| User task templates | P1 | 1w | User Customization |
| Job profile system | P1 | 1w | Personalization |
| Learning dashboard | P1 | 1w | Transparency |
| Dashboard redesign | P1 | 2w | UX |

### Medium Term (1-2 Months)
| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Writing style analysis | P2 | 1w | Personalization |
| Chat history persistence | P2 | 3d | UX |
| Provider labeling | P2 | 3d | UX |
| A/B testing framework | P2 | 1w | Optimization |

---

## Success Metrics

### Security
- [ ] Zero SQL injection vulnerabilities
- [ ] All AI endpoints rate-limited
- [ ] Audit logs for all AI operations

### User Experience
- [ ] Dashboard useful score > 4/5 (user survey)
- [ ] Task template adoption > 30% of active users
- [ ] Chat session resumption rate > 50%

### AI Performance
- [ ] Overall accuracy > 85%
- [ ] User-reported accuracy improvement visible
- [ ] Auto-approve rate > 60% for trained actions

### Customization
- [ ] Average 3+ custom task templates per user
- [ ] Job profile completion > 80%
- [ ] Writing style applied to 50%+ of AI responses

---

## Appendix: File Creation Checklist

### Backend Files
- [ ] `backend/src/config/ai.config.ts`
- [ ] `backend/src/modules/ai/guards/ai-rate-limit.guard.ts`
- [ ] `backend/src/modules/ai/controllers/task-templates.controller.ts`
- [ ] `backend/src/modules/ai/services/task-template.service.ts`
- [ ] `backend/src/modules/ai/services/job-profile-learning.service.ts`
- [ ] `backend/src/modules/ai/services/writing-style-analyzer.service.ts`
- [ ] `backend/src/modules/ai/services/enhanced-feedback.service.ts`

### Frontend Files
- [ ] `frontend/components/dashboard/ai/TaskTemplateManager.tsx`
- [ ] `frontend/components/dashboard/ai/LearningDashboard.tsx`
- [ ] `frontend/components/onboarding/JobProfileWizard.tsx`
- [ ] `frontend/components/providers/ProviderBadge.tsx`
- [ ] `frontend/components/ai/ChatHistory.tsx`
- [ ] `frontend/pages/dashboard/index.tsx` (rewrite)
- [ ] `frontend/stores/dashboard-store.ts`

### Documentation
- [ ] `.env.ai.example`
- [ ] `docs/development/AI_SECURITY_CHECKLIST.md`
- [ ] `docs/development/AI_CONFIGURATION_GUIDE.md`

---

**Document Version:** 1.0.0
**Created:** 2025-11-26
**Author:** Claude Code
**Review Cycle:** Weekly
