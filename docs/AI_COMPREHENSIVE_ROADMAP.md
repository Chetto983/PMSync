# AI Comprehensive Roadmap - MailAgent

**Version:** 2.1
**Date:** 2025-11-28
**Status:** Implementation Phase - B1 Complete

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Best Practices Research Summary](#3-best-practices-research-summary)
4. [Tenant/User Isolation Architecture](#4-tenantusr-isolation-architecture)
5. [Backend Roadmap](#5-backend-roadmap)
6. [Frontend Roadmap](#6-frontend-roadmap)
7. [Implementation Phases](#7-implementation-phases)
8. [Validation & Testing Strategy](#8-validation--testing-strategy)
9. [References](#9-references)

---

## 1. Executive Summary

This document provides a comprehensive roadmap for enhancing the AI capabilities in MailAgent, covering both backend (`backend/src/modules/ai`) and frontend components. It incorporates best practices from industry research and patterns from the Zero-main reference implementation.

### Key Goals
- Implement AI-assisted email composition with style learning
- Enhance multi-agent orchestration with guardrails and observability
- Add prompt operations (registry, versioning, locale variants)
- Implement calendar and contacts AI features
- Ensure strict tenant/user isolation throughout
- Build comprehensive frontend AI experience

---

## 2. Current State Analysis

### 2.1 Backend AI Module Structure

```
backend/src/modules/ai/
├── controllers/
│   ├── ai.controller.ts           # Chat, sessions, summarize, smart-reply, compose
│   ├── knowledge-base.controller.ts
│   └── personalization.controller.ts
├── services/
│   ├── mistral.service.ts         # LLM provider
│   ├── agent.service.ts           # LangChain agent
│   ├── chat-session.service.ts    # Session management
│   ├── email-insights.service.ts  # Summarize, smart-reply, categorize, compose
│   ├── knowledge-base.service.ts  # RAG/embeddings
│   └── embeddings.service.ts      # Vector operations
├── multi-agent/
│   ├── agents/
│   │   ├── base.agent.ts          # Abstract base
│   │   ├── router.agent.ts        # Intent classification
│   │   ├── email.agent.ts         # Email operations
│   │   ├── calendar.agent.ts      # Calendar operations
│   │   ├── contacts.agent.ts      # Contacts operations
│   │   └── general.agent.ts       # General chat
│   ├── services/
│   │   ├── multi-agent.service.ts # Orchestrator
│   │   ├── hitl.service.ts        # Human-in-the-loop
│   │   ├── feedback.service.ts    # Learning profiles
│   │   └── action-executor.service.ts
│   └── interfaces/                # Types and contracts
└── dto/                           # Request/response DTOs
```

### 2.2 Working Features (54/54 Tests Passing)

| Feature | Status | Notes |
|---------|--------|-------|
| RouterAgent (intent classification) | ✅ | Fast-path + LLM fallback |
| EmailAgent | ✅ | Send, reply, forward, search, archive, delete |
| CalendarAgent | ✅ | Create, update, delete events |
| ContactsAgent | ✅ | CRUD, search, merge |
| KnowledgeAgent | ✅ | RAG with pgvector |
| GeneralAgent | ✅ | General chat |
| HITL Service | ✅ | Pending actions, approve/reject |
| Feedback Service | ✅ | Learning profiles, confidence adjustment |
| Multi-language | ✅ | en, it, es, fr, de, pt |
| Session Management | ✅ | Server-issued sessions |
| AI Compose | ✅ | POST /ai/compose (basic) |

### 2.3 Gaps Identified

| Gap | Priority | Impact |
|-----|----------|--------|
| No prompt registry/versioning | High | Hardcoded prompts hard to maintain |
| No writing style learning | High | Can't personalize to user voice |
| Limited frontend AI UX | High | Missing AI chat panel in compose |
| No observability/telemetry | Medium | Can't track LLM costs/latency |
| No model fallback | Medium | Single point of failure |
| No audit logging | Medium | Compliance concerns |

---

## 3. Best Practices Research Summary

### 3.1 Prompt Engineering Best Practices

Source: [Lakera Guide](https://www.lakera.ai/blog/prompt-engineering-guide), [Palantir Best Practices](https://www.palantir.com/docs/foundry/aip/best-practices-prompt-engineering)

**Key Principles:**
1. **Specificity over vagueness** - "Create a 3-section report with executive summary" vs "write a report"
2. **Role assignment** - "You are a SaaS sales rep drafting follow-ups"
3. **Chain-of-thought scaffolding** - Break complex tasks into steps
4. **Output format instructions** - JSON schema, max length, structure
5. **Iterative refinement** - Prompt chaining for complex tasks

**Implementation for MailAgent:**
```typescript
// Structured prompt template
const emailComposePrompt = {
  role: 'You are a professional email assistant writing on behalf of {userName}.',
  context: 'Recipients: {recipients}\nSubject: {subject}\nThread: {threadSummary}',
  task: 'Compose an email body that {userRequest}.',
  constraints: [
    'Match the tone: {tone}',
    'Keep within {maxLength} words',
    'Use greeting style: {greetingStyle}',
    'Apply writing metrics: {styleProfile}'
  ],
  output: 'Respond with ONLY the email body, no markdown or commentary.'
};
```

### 3.2 Multi-Agent Architecture Best Practices

Source: [SuperAnnotate Guide](https://www.superannotate.com/blog/multi-agent-llms), [Microsoft AI Agent Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)

**Key Patterns:**

1. **Hierarchical Orchestration**
   - Router agent classifies intent
   - Specialized agents handle domains
   - Manager coordinates multi-step workflows

2. **Memory Architecture**
   - Working memory: Current task context
   - Persistent memory: Cross-session history
   - Semantic memory: RAG embeddings

3. **Human-in-the-Loop**
   - Severity-based approval thresholds
   - Confidence calibration from feedback
   - Audit trail for compliance

**Current MailAgent Alignment:**
- ✅ Router → Specialized agents pattern implemented
- ✅ HITL with severity levels
- ⚠️ Missing persistent cross-session personalization
- ⚠️ Missing telemetry/observability

### 3.3 Email Personalization Best Practices

Source: [Mailtrap Guide](https://mailtrap.io/blog/ai-email-personalization/), [Gmelius Guide](https://gmelius.com/blog/how-to-use-ai-in-email)

**Key Strategies:**

1. **Style Learning**
   - Analyze sent emails to build writing profile
   - Track 50+ linguistic metrics (Zero-main pattern)
   - Adapt AI output to match user voice

2. **Personality-Based Personalization**
   - DISC personality insights from communication patterns
   - Formality detection and matching
   - Greeting/sign-off preferences

3. **Continuous Learning**
   - Connect to past conversation history
   - Fine-tune based on user feedback
   - Regular audits (3-6 month review cycles)

4. **Safe Patterns**
   - AI as "fast junior writer" needing review
   - Constraints to prevent hallucinations
   - Human in the loop for sensitive content

---

## 4. Tenant/User Isolation Architecture

### 4.1 Data Isolation Model

```
┌─────────────────────────────────────────────────────────────┐
│                    TENANT BOUNDARY                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  User A Scope                          │  │
│  │  • ChatSessions (filtered by userId)                   │  │
│  │  • WritingStyleProfile (one per user)                  │  │
│  │  • LearningProfiles (per user + agent + action)        │  │
│  │  • PendingActions (owned by user, admin can access)    │  │
│  │  • Preferences (user-specific settings)                │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  User B Scope                          │  │
│  │  • (same structure, isolated from User A)              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Tenant-Wide Shared Resources              │  │
│  │  • PromptRegistry (tenant-scoped templates)            │  │
│  │  • Embeddings (filtered by tenantId)                   │  │
│  │  • AggregateStats (anonymized, tenant-level)           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Isolation Enforcement Points

| Layer | Enforcement | Implementation |
|-------|-------------|----------------|
| Controller | TenantGuard | `@UseGuards(JwtAuthGuard, TenantGuard)` |
| Service | Query filter | `WHERE tenantId = $1 AND userId = $2` |
| Database | Index | `@@index([tenantId, userId])` |
| Embeddings | Metadata filter | `filter: { tenantId: 'xxx' }` |
| Prompts | Scoping | Prompt registry per tenant |
| Logs | Redaction | PII stripped, tenant tagged |

### 4.3 Security Checklist

```typescript
// Every service method MUST include tenant/user filtering
class BaseService {
  protected assertTenantAccess(entity: { tenantId: string }, context: AgentContext) {
    if (entity.tenantId !== context.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  protected assertUserAccess(entity: { userId: string }, context: AgentContext, allowAdmin = true) {
    if (entity.userId !== context.userId) {
      if (!allowAdmin || !['admin', 'super-admin'].includes(context.userRole)) {
        throw new ForbiddenException('Cross-user access denied');
      }
    }
  }
}
```

---

## 5. Backend Roadmap

### Phase B1: Prompt Operations & Observability

**Duration:** Week 1-2

#### B1.1 Prompt Registry

**Database Schema:**
```prisma
model PromptTemplate {
  id          String   @id @default(cuid())
  tenantId    String?  // null = system default
  name        String   // e.g., "email.compose", "router.classify"
  version     Int      @default(1)
  locale      String   @default("en")
  bucket      String?  // A/B test bucket
  body        String   @db.Text
  variables   Json?    // Expected variables schema
  metadata    Json?    // Temperature, maxTokens, etc.
  isActive    Boolean  @default(true)
  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, name, version, locale, bucket])
  @@index([tenantId, name, isActive])
}
```

**Service Implementation:**
```typescript
@Injectable()
export class PromptRegistryService {
  async getPrompt(params: {
    tenantId: string;
    name: string;
    locale?: string;
    bucket?: string;
  }): Promise<PromptTemplate> {
    // Priority: tenant+locale+bucket > tenant+locale > tenant > system+locale > system
    const prompts = await this.prisma.promptTemplate.findMany({
      where: {
        name: params.name,
        isActive: true,
        OR: [
          { tenantId: params.tenantId },
          { tenantId: null }
        ]
      },
      orderBy: [
        { tenantId: 'desc' }, // tenant-specific first
        { locale: 'desc' },
        { version: 'desc' }
      ]
    });

    return this.selectBestMatch(prompts, params);
  }

  async seedDefaults(): Promise<void> {
    // Migrate hardcoded prompts to registry
  }
}
```

**Files to Create:**
- `backend/src/modules/ai/services/prompt-registry.service.ts`
- `backend/src/modules/ai/controllers/prompt-admin.controller.ts` (admin only)
- `backend/src/modules/ai/dto/prompt.dto.ts`

**Migration:**
- Extract prompts from router.agent.ts, email.agent.ts, etc.
- Create seed migration with default prompts
- Update agents to use PromptRegistryService

#### B1.2 Observability Layer

**OpenTelemetry Integration:**
```typescript
@Injectable()
export class LlmTelemetryService {
  private tracer: Tracer;
  private meter: Meter;

  // Metrics
  private llmLatency: Histogram;
  private llmTokensUsed: Counter;
  private llmCost: Counter;
  private llmErrors: Counter;

  async trackLlmCall<T>(
    operation: string,
    promptId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const span = this.tracer.startSpan(`llm.${operation}`);
    const startTime = Date.now();

    try {
      span.setAttributes({
        'llm.prompt_id': promptId,
        'llm.model': this.model,
        'tenant.id': this.tenantId
      });

      const result = await fn();

      // Extract token usage from response
      this.llmTokensUsed.add(result.usage?.total_tokens || 0);
      this.llmLatency.record(Date.now() - startTime);

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      this.llmErrors.add(1);
      throw error;
    } finally {
      span.end();
    }
  }
}
```

**Files to Create:**
- `backend/src/modules/ai/services/llm-telemetry.service.ts`
- `backend/src/modules/ai/config/telemetry.config.ts`

---

### Phase B2: Writing Style Learning

**Duration:** Week 3-4

#### B2.1 Writing Style Profile Schema

```prisma
model WritingStyleProfile {
  id                String   @id @default(cuid())
  tenantId          String
  userId            String

  // Structure metrics
  avgSentenceLength     Float    @default(15)
  avgParagraphLines     Float    @default(3)
  avgWordsPerEmail      Int      @default(100)
  bulletListRate        Float    @default(0)

  // Vocabulary metrics
  formalityScore        Float    @default(0.5)  // 0=casual, 1=formal
  contractionRate       Float    @default(0.3)
  emojiRate             Float    @default(0)
  typeTokenRatio        Float    @default(0)    // vocabulary diversity

  // Punctuation habits
  exclamationRate       Float    @default(0)
  questionRate          Float    @default(0)
  ellipsisRate          Float    @default(0)

  // Greeting/Sign-off patterns
  greetingPresent       Boolean  @default(true)
  preferredGreetings    String[] @default([])
  signOffPresent        Boolean  @default(true)
  preferredSignOffs     String[] @default([])

  // Tone metrics
  sentimentPolarity     Float    @default(0)    // -1 to 1
  empathyPhraseRate     Float    @default(0)
  hedgeRate             Float    @default(0)    // uncertainty markers

  // Learning metadata
  sampleCount           Int      @default(0)
  lastAnalyzedEmailId   String?
  lastAnalyzed          DateTime @default(now())

  tenant                Tenant   @relation(fields: [tenantId], references: [id])
  user                  User     @relation(fields: [userId], references: [id])

  @@unique([tenantId, userId])
  @@index([tenantId, userId])
}
```

#### B2.2 Writing Style Analysis Service

```typescript
@Injectable()
export class WritingStyleService {
  constructor(
    private prisma: PrismaService,
    private nlpService: NlpAnalysisService,
  ) {}

  /**
   * Analyze a sent email and update user's style profile
   */
  async analyzeSentEmail(
    tenantId: string,
    userId: string,
    email: { bodyText: string; bodyHtml?: string }
  ): Promise<void> {
    const text = this.extractCleanText(email);
    if (text.length < 50) return; // Skip very short emails

    const metrics = await this.nlpService.analyzeText(text);

    await this.prisma.writingStyleProfile.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        ...this.initializeFromMetrics(metrics)
      },
      update: {
        // Rolling average update
        avgSentenceLength: { increment: (metrics.avgSentenceLength - currentProfile.avgSentenceLength) / (currentProfile.sampleCount + 1) },
        // ... other metrics
        sampleCount: { increment: 1 },
        lastAnalyzed: new Date()
      }
    });
  }

  /**
   * Generate style instructions for AI prompts
   */
  async getStylePromptSection(
    tenantId: string,
    userId: string
  ): Promise<string> {
    const profile = await this.prisma.writingStyleProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } }
    });

    if (!profile || profile.sampleCount < 5) {
      return ''; // Not enough data yet
    }

    return `
<writing_style>
  <formality>${profile.formalityScore > 0.6 ? 'formal' : 'casual'}</formality>
  <sentence_length>average ${Math.round(profile.avgSentenceLength)} words</sentence_length>
  <contractions>${profile.contractionRate > 0.2 ? 'use contractions' : 'avoid contractions'}</contractions>
  <emojis>${profile.emojiRate > 0.01 ? 'occasional emojis allowed' : 'no emojis'}</emojis>
  <greeting>${profile.preferredGreetings[0] || 'Hi'}</greeting>
  <signoff>${profile.preferredSignOffs[0] || 'Best'}</signoff>
</writing_style>
    `.trim();
  }
}
```

**Files to Create:**
- `backend/src/modules/ai/services/writing-style.service.ts`
- `backend/src/modules/ai/services/nlp-analysis.service.ts`
- `backend/src/modules/ai/dto/writing-style.dto.ts`

**Integration Points:**
- Hook into email send flow to analyze sent emails
- Inject style profile into compose prompts
- Expose GET /ai/writing-style/:userId endpoint

---

### Phase B3: Enhanced Email Composition

**Duration:** Week 5-6

#### B3.1 Upgrade /ai/compose Endpoint

```typescript
// Enhanced compose DTO
export class ComposeEmailDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsArray()
  to?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsEnum(['formal', 'casual', 'technical'])
  tone?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsBoolean()
  useMyStyle?: boolean; // Apply user's writing style

  @IsOptional()
  @IsArray()
  threadContext?: Array<{
    from: string;
    body: string;
    timestamp?: string;
  }>;

  @IsOptional()
  @IsString()
  replyToEmailId?: string; // For context-aware replies
}

// Enhanced compose service
async composeEmail(
  tenantId: string,
  userId: string,
  dto: ComposeEmailDto
): Promise<{ body: string; subject?: string; styleApplied: boolean }> {
  // 1. Get prompt template from registry
  const promptTemplate = await this.promptRegistry.getPrompt({
    tenantId,
    name: 'email.compose',
    locale: dto.locale
  });

  // 2. Get writing style if requested
  let styleSection = '';
  if (dto.useMyStyle) {
    styleSection = await this.writingStyleService.getStylePromptSection(tenantId, userId);
  }

  // 3. Build thread context
  let threadContext = '';
  if (dto.replyToEmailId) {
    threadContext = await this.buildThreadContext(tenantId, dto.replyToEmailId);
  } else if (dto.threadContext) {
    threadContext = this.formatThreadContext(dto.threadContext);
  }

  // 4. Render prompt with variables
  const systemPrompt = this.renderPrompt(promptTemplate.body, {
    tone: dto.tone || 'casual',
    styleSection,
    locale: dto.locale || 'en'
  });

  const userPrompt = `
Recipients: ${dto.to?.join(', ') || 'Not specified'}
Subject: ${dto.subject || 'Not specified'}
${threadContext ? `\nThread context:\n${threadContext}` : ''}

User request: ${dto.prompt}
  `.trim();

  // 5. Call LLM with telemetry
  const response = await this.telemetry.trackLlmCall(
    'compose',
    promptTemplate.id,
    () => this.mistral.completePrompt({
      systemPrompt,
      userPrompt,
      temperature: promptTemplate.metadata?.temperature || 0.4,
      maxTokens: promptTemplate.metadata?.maxTokens || 1000
    })
  );

  return {
    body: this.stripMarkdown(response),
    subject: this.extractSubjectIfRequested(response, dto),
    styleApplied: !!styleSection
  };
}
```

#### B3.2 Add /ai/rewrite Endpoint

```typescript
@Post('rewrite')
@ApiOperation({ summary: 'Rewrite/improve existing draft' })
async rewriteEmail(
  @Request() req: AuthenticatedRequest,
  @Body() dto: RewriteEmailDto
): Promise<RewriteEmailResponseDto> {
  // Accepts: currentBody, instruction (e.g., "make it more formal", "shorten")
  // Returns: rewrittenBody, diff highlights
}
```

---

### Phase B4: Agent Architecture Uplift

**Duration:** Week 7-8

#### B4.1 Tool/Function Calling Schema

```typescript
// Define strict schemas for each agent's tools
const emailAgentTools = {
  send_email: {
    name: 'send_email',
    description: 'Send a new email',
    parameters: {
      type: 'object',
      required: ['to', 'subject', 'body'],
      properties: {
        to: { type: 'array', items: { type: 'string', format: 'email' } },
        cc: { type: 'array', items: { type: 'string', format: 'email' } },
        subject: { type: 'string', maxLength: 200 },
        body: { type: 'string', maxLength: 10000 }
      }
    }
  },
  search_emails: {
    name: 'search_emails',
    description: 'Search emails with filters',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        from: { type: 'string' },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' }
          }
        }
      }
    }
  }
  // ... more tools
};
```

#### B4.2 Response Schema Validation

```typescript
// Validate LLM responses before execution
async validateAgentResponse(
  response: any,
  expectedSchema: JSONSchema
): Promise<{ valid: boolean; errors?: string[] }> {
  const ajv = new Ajv();
  const validate = ajv.compile(expectedSchema);

  if (!validate(response)) {
    // Attempt repair
    const repaired = await this.attemptRepair(response, validate.errors);
    if (repaired) return { valid: true };

    return {
      valid: false,
      errors: validate.errors.map(e => e.message)
    };
  }

  return { valid: true };
}
```

#### B4.3 Model Routing & Fallback

```typescript
@Injectable()
export class ModelRouterService {
  private providers: Map<string, ILlmProvider> = new Map();

  constructor(
    private mistralProvider: MistralProvider,
    private openaiProvider?: OpenAIProvider, // Optional fallback
  ) {
    this.providers.set('mistral', mistralProvider);
    if (openaiProvider) {
      this.providers.set('openai', openaiProvider);
    }
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const primary = this.providers.get('mistral');

    try {
      return await primary.complete(params);
    } catch (error) {
      if (this.shouldFallback(error)) {
        const fallback = this.providers.get('openai');
        if (fallback) {
          this.logger.warn('Falling back to OpenAI');
          return await fallback.complete(params);
        }
      }
      throw error;
    }
  }
}
```

---

### Phase B5: Calendar & Contacts AI Enhancement

**Duration:** Week 9-10

#### B5.1 Calendar Intelligence

```typescript
// Smart scheduling with conflict detection
const calendarAgentTools = {
  find_available_slots: {
    name: 'find_available_slots',
    description: 'Find available time slots for a meeting',
    parameters: {
      type: 'object',
      required: ['duration', 'dateRange'],
      properties: {
        duration: { type: 'integer', description: 'Meeting duration in minutes' },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date-time' },
            end: { type: 'string', format: 'date-time' }
          }
        },
        attendees: { type: 'array', items: { type: 'string', format: 'email' } },
        preferredTimes: {
          type: 'array',
          items: { enum: ['morning', 'afternoon', 'evening'] }
        }
      }
    }
  },
  schedule_meeting: {
    name: 'schedule_meeting',
    description: 'Schedule a new meeting with attendees',
    parameters: {
      // ... full schema
    }
  }
};
```

#### B5.2 Contacts Intelligence

```typescript
// Smart contact management
const contactsAgentTools = {
  find_duplicates: {
    name: 'find_duplicates',
    description: 'Find potential duplicate contacts',
    parameters: {
      type: 'object',
      properties: {
        threshold: { type: 'number', minimum: 0, maximum: 1 }
      }
    }
  },
  enrich_contact: {
    name: 'enrich_contact',
    description: 'Enrich contact with additional information',
    parameters: {
      type: 'object',
      required: ['contactId'],
      properties: {
        contactId: { type: 'string' },
        sources: { type: 'array', items: { enum: ['email_history', 'calendar', 'manual'] } }
      }
    }
  }
};
```

---

## 6. Frontend Roadmap

### Phase F1: AI Compose Dialog Enhancement

**Duration:** Week 1-2

#### F1.1 Current State (Already Implemented)

- ✅ `EditorToolbar` with AI compose button (Sparkles icon)
- ✅ `AiComposeDialog` with prompt input, tone selector, variant selector
- ✅ `aiApi.composeEmail()` integration

#### F1.2 Enhancements Needed

```typescript
// Enhanced AiComposeDialog
interface AiComposeDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (result: ComposeResult) => void;
  // Context from ComposeDialog
  recipients: string[];
  subject: string;
  currentBody: string;
  mode: 'compose' | 'reply' | 'forward';
  replyToEmailId?: string;
}

function AiComposeDialog({...props}: AiComposeDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState<'formal' | 'casual' | 'technical'>('casual');
  const [useMyStyle, setUseMyStyle] = useState(true);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // Example prompts based on context
  const examplePrompts = useMemo(() => {
    if (props.mode === 'reply') {
      return [
        'Confirm receipt and schedule a follow-up call',
        'Politely decline the request with an alternative',
        'Request more information about...',
      ];
    }
    return [
      'Write a meeting invitation for...',
      'Draft a project update email',
      'Send a thank you note for...',
    ];
  }, [props.mode]);

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {t.dashboard.email.composer.aiComposeTitle}
      </DialogTitle>
      <DialogContent>
        {/* Example prompts as chips */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption">Try:</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
            {examplePrompts.map((example, i) => (
              <Chip
                key={i}
                label={example}
                onClick={() => setPrompt(example)}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>
        </Box>

        {/* Prompt input */}
        <TextField
          label={t.dashboard.email.composer.aiComposePrompt}
          multiline
          minRows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          fullWidth
          placeholder="Describe what you want to write..."
        />

        {/* Options row */}
        <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Tone</InputLabel>
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              <MenuItem value="formal">Formal</MenuItem>
              <MenuItem value="casual">Casual</MenuItem>
              <MenuItem value="technical">Technical</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Switch checked={useMyStyle} onChange={(e) => setUseMyStyle(e.target.checked)} />
            }
            label="Use my writing style"
          />
        </Box>

        {/* Preview section */}
        {preview && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="subtitle2">Preview:</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {preview}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          variant="outlined"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
        >
          {loading ? <CircularProgress size={16} /> : 'Generate'}
        </Button>
        <Button
          variant="contained"
          onClick={() => props.onApply({ body: preview! })}
          disabled={!preview}
        >
          Insert
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

**Files to Modify:**
- `frontend/components/email/ComposeDialog/ComposeDialog.tsx`
- `frontend/components/email/ComposeDialog/EditorToolbar.tsx`

**New Components:**
- `frontend/components/email/ai/AiComposePanel.tsx` (side panel variant)
- `frontend/components/email/ai/ExamplePrompts.tsx`

---

### Phase F2: AI Chat Panel in Compose

**Duration:** Week 3-4

```typescript
// New component: AiComposePanel (collapsible side panel)
interface AiComposePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onInsert: (content: string) => void;
  context: {
    recipients: string[];
    subject: string;
    body: string;
    threadId?: string;
  };
}

function AiComposePanel({ isOpen, onToggle, onInsert, context }: AiComposePanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: input }]);

    // Call AI with context
    const response = await aiApi.composeEmail({
      prompt: input,
      to: context.recipients,
      subject: context.subject,
      threadContext: context.body ? [{ from: 'draft', body: context.body }] : undefined
    });

    // Add AI response with insert button
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: response.data.body,
      canInsert: true
    }]);
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      variant="persistent"
      sx={{ width: 360 }}
    >
      <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">AI Assistant</Typography>
          <IconButton onClick={onToggle}><X size={20} /></IconButton>
        </Box>

        {/* Messages area */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {messages.map((msg, i) => (
            <Box key={i} sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {msg.role === 'user' ? 'You' : 'AI'}
              </Typography>
              <Typography variant="body2">{msg.content}</Typography>
              {msg.canInsert && (
                <Button
                  size="small"
                  onClick={() => onInsert(msg.content)}
                  startIcon={<Plus size={14} />}
                >
                  Insert into email
                </Button>
              )}
            </Box>
          ))}
        </Box>

        {/* Input area */}
        <Box sx={{ mt: 'auto' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Ask AI to help write..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            InputProps={{
              endAdornment: (
                <IconButton onClick={handleSend}>
                  <Send size={18} />
                </IconButton>
              )
            }}
          />
        </Box>
      </Box>
    </Drawer>
  );
}
```

---

### Phase F3: Dashboard AI Enhancements

**Duration:** Week 5-6

#### F3.1 Learning Dashboard Component

```typescript
// Show AI accuracy trends and learning progress
function LearningDashboard() {
  const { data: stats } = useQuery(['learningStats'], () =>
    multiAgentApi.getLearningStats()
  );

  return (
    <Card>
      <CardHeader title="AI Learning Progress" />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={4}>
            <StatCard
              label="Approval Rate"
              value={`${(stats?.summary.overallApprovalRate * 100).toFixed(0)}%`}
              trend={stats?.trend}
            />
          </Grid>
          <Grid item xs={4}>
            <StatCard
              label="Success Rate"
              value={`${(stats?.summary.overallSuccessRate * 100).toFixed(0)}%`}
            />
          </Grid>
          <Grid item xs={4}>
            <StatCard
              label="Actions Today"
              value={stats?.summary.totalAttempts}
            />
          </Grid>
        </Grid>

        {/* Per-agent breakdown */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>By Agent</Typography>
          {stats?.profiles.map(profile => (
            <AgentProgressBar
              key={profile.id}
              agent={profile.agentName}
              approvalRate={profile.approvalCount / (profile.approvalCount + profile.rejectionCount)}
              confidenceBoost={profile.confidenceBoost}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
```

#### F3.2 Pending Actions Inline Component

```typescript
// Inline approve/reject in email list
function PendingActionsInline({ emailId }: { emailId: string }) {
  const { data: actions } = useQuery(['pendingActions', emailId], () =>
    multiAgentApi.getPendingActions({ status: 'PENDING' })
  );

  const relatedActions = actions?.filter(a => a.payload?.emailId === emailId);

  if (!relatedActions?.length) return null;

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <Chip
        size="small"
        color="warning"
        label={`${relatedActions.length} pending action(s)`}
      />
      {relatedActions.map(action => (
        <Box key={action.id}>
          <Tooltip title={`${action.actionType}: ${JSON.stringify(action.payload)}`}>
            <IconButton
              size="small"
              color="success"
              onClick={() => multiAgentApi.approveAction(action.id)}
            >
              <Check size={14} />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            color="error"
            onClick={() => multiAgentApi.rejectAction(action.id)}
          >
            <X size={14} />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}
```

---

### Phase F4: Localization

**Duration:** Week 7

**New i18n Keys:**
```typescript
// Add to translations/en.ts and translations/it.ts
{
  dashboard: {
    email: {
      composer: {
        // Existing...
        aiComposeTitle: 'Draft with AI',
        aiComposePrompt: 'What would you like to write?',
        aiComposeToneLabel: 'Tone',
        aiComposeUseMyStyle: 'Use my writing style',
        aiComposeGenerate: 'Generate',
        aiComposeInsert: 'Insert into email',
        aiComposeExamples: 'Try these examples:',
        aiComposeError: 'Failed to generate email. Please try again.',

        // AI Panel
        aiPanelTitle: 'AI Assistant',
        aiPanelPlaceholder: 'Ask AI to help write...',
        aiPanelInsert: 'Insert into email',
      }
    },
    ai: {
      learningDashboard: {
        title: 'AI Learning Progress',
        approvalRate: 'Approval Rate',
        successRate: 'Success Rate',
        actionsToday: 'Actions Today',
        byAgent: 'By Agent',
        confidenceBoost: 'Confidence Boost',
      },
      pendingActions: {
        title: 'Pending Actions',
        approve: 'Approve',
        reject: 'Reject',
        viewDetails: 'View Details',
      }
    }
  }
}
```

---

## 7. Implementation Phases

### Master Timeline

| Phase | Component | Duration | Dependencies | Status |
|-------|-----------|----------|--------------|--------|
| B1 | Prompt Registry + Observability | Week 1-2 | None | ✅ Complete |
| F1 | AI Compose Dialog Enhancement | Week 1-2 | None | ✅ Complete |
| B2 | Writing Style Learning | Week 3-4 | B1 | ✅ Complete |
| F2 | AI Chat Panel in Compose | Week 3-4 | F1 | ⏳ Pending |
| B3 | Enhanced Email Composition | Week 5-6 | B1, B2 | ⏳ Pending |
| F3 | Dashboard AI Enhancements | Week 5-6 | F1 | ⏳ Pending |
| B4 | Agent Architecture Uplift | Week 7-8 | B1 | ⏳ Pending |
| F4 | Localization | Week 7 | F1, F2, F3 | ⏳ Pending |
| B5 | Calendar & Contacts AI | Week 9-10 | B4 | ⏳ Pending |

### Parallel Execution

```
Week 1-2: [B1] ─────┬───── [F1]
                    │
Week 3-4: [B2] ─────┼───── [F2]
                    │
Week 5-6: [B3] ─────┼───── [F3]
                    │
Week 7-8: [B4] ─────┴───── [F4]
                    │
Week 9-10: [B5] ────┘
```

---

## 8. Validation & Testing Strategy

### 8.1 Unit Tests

```typescript
// Example: Writing Style Service Tests
describe('WritingStyleService', () => {
  it('should analyze formal email correctly', async () => {
    const email = { bodyText: 'Dear Mr. Smith, I am writing to inquire...' };
    const metrics = await service.analyzeText(email.bodyText);
    expect(metrics.formalityScore).toBeGreaterThan(0.6);
  });

  it('should enforce tenant isolation', async () => {
    await expect(
      service.getStyleProfile('tenant-a', 'user-from-tenant-b')
    ).rejects.toThrow(ForbiddenException);
  });
});
```

### 8.2 Integration Tests

```typescript
// Example: AI Compose E2E Test
describe('AI Compose E2E', () => {
  it('should compose email with user style', async () => {
    // 1. Analyze some sent emails to build profile
    await writingStyleService.analyzeSentEmail(tenantId, userId, sampleEmail1);
    await writingStyleService.analyzeSentEmail(tenantId, userId, sampleEmail2);

    // 2. Request compose with style
    const result = await aiController.composeEmail(mockRequest, {
      prompt: 'Write a follow-up email about the project',
      useMyStyle: true
    });

    // 3. Verify style was applied
    expect(result.styleApplied).toBe(true);
    expect(result.body).toContain(profile.preferredGreetings[0]);
  });
});
```

### 8.3 Golden Dataset Tests

```typescript
// Prompt regression tests
describe('Prompt Golden Tests', () => {
  const goldenDataset = [
    {
      input: { prompt: 'Schedule a meeting', locale: 'en' },
      expectedIntent: 'CALENDAR',
      expectedAgent: 'CalendarAgent'
    },
    {
      input: { prompt: 'Pianifica una riunione', locale: 'it' },
      expectedIntent: 'CALENDAR',
      expectedAgent: 'CalendarAgent'
    }
  ];

  goldenDataset.forEach(({ input, expectedIntent, expectedAgent }) => {
    it(`should route "${input.prompt}" to ${expectedAgent}`, async () => {
      const result = await multiAgentService.process(createContext(input));
      expect(result.intent.intent).toBe(expectedIntent);
      expect(result.agentUsed).toBe(expectedAgent);
    });
  });
});
```

### 8.4 Tenant Isolation Tests

```typescript
describe('Tenant Isolation', () => {
  it('should not leak data between tenants', async () => {
    // Create data for tenant A
    await createTestSession(tenantA, userA);
    await createTestPendingAction(tenantA, userA);

    // Query as tenant B should return empty
    const sessionsB = await chatSessionService.listSessions(tenantB, userB);
    const actionsB = await hitlService.getPendingActions({ tenantId: tenantB, userId: userB });

    expect(sessionsB).toHaveLength(0);
    expect(actionsB.items).toHaveLength(0);
  });

  it('should block cross-tenant action approval', async () => {
    const action = await createTestPendingAction(tenantA, userA);

    await expect(
      multiAgentService.approveAndExecuteAction(
        tenantB, // Wrong tenant
        action.id,
        { userId: userB, role: 'admin' }
      )
    ).rejects.toThrow(ForbiddenException);
  });
});
```

### 8.5 Test Coverage Targets

| Component | Target Coverage |
|-----------|-----------------|
| Prompt Registry Service | 90% |
| Writing Style Service | 85% |
| Multi-Agent Service | 90% |
| HITL Service | 95% |
| Agent Base Classes | 80% |
| Controllers | 85% |
| Frontend AI Components | 70% |

---

## 9. References

### Documentation
- [Multi-Agent Architecture](./development/multi-agent/03_ARCHITECTURE.md)
- [Gap Analysis 2025](./development/multi-agent/GAP_ANALYSIS_2025.md)
- [Security Audit](./development/multi-agent/SECURITY_AUDIT_2025.md)
- [AI Compose Implementation](./AI_COMPOSE_IMPLEMENTATION.md)

### External Best Practices
- [Prompt Engineering Guide - Lakera](https://www.lakera.ai/blog/prompt-engineering-guide)
- [Multi-Agent LLMs - SuperAnnotate](https://www.superannotate.com/blog/multi-agent-llms)
- [AI Agent Architecture - Microsoft](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [AI Email Personalization - Mailtrap](https://mailtrap.io/blog/ai-email-personalization/)
- [LLM Agents Guide - Botpress](https://botpress.com/blog/llm-agents)
- [AI Agent Architecture - Lindy](https://www.lindy.ai/blog/ai-agent-architecture)
- [Prompt Engineering - Palantir](https://www.palantir.com/docs/foundry/aip/best-practices-prompt-engineering)

### Zero-main Reference
- `esempio/Zero-main/apps/server/src/lib/prompts.ts` - Prompt templates
- `esempio/Zero-main/apps/server/src/trpc/routes/ai/compose.ts` - Compose endpoint
- `esempio/Zero-main/apps/mail/components/create/ai-chat.tsx` - AI chat panel

---

**Document Version:** 2.0
**Last Updated:** 2025-11-28
**Author:** Claude Code
**Next Review:** 2025-12-15
