# Roadmap Dettagliata - Sistema Multi-Agent con HITL per MailAgent

## 📋 Executive Summary

Questo documento fornisce una roadmap dettagliata per implementare un sistema multi-agente orchestrato con Human-in-the-Loop (HITL) nel backend NestJS di MailAgent.

**Durata stimata:** 7-8 settimane
**Branch:** `feature/multi-agent-orchestrator`

---

## 🎯 Stato Attuale del Backend

### ✅ Componenti Già Implementati

| Componente | Stato | Path |
|------------|-------|------|
| **MistralService** | ✅ Completo | `backend/src/modules/ai/services/mistral.service.ts` |
| **AgentService** | ✅ Completo (base LangChain) | `backend/src/modules/ai/services/agent.service.ts` |
| **EmbeddingsService** | ✅ Completo | `backend/src/modules/ai/services/embeddings.service.ts` |
| **KnowledgeBaseService** | ✅ Completo (RAG) | `backend/src/modules/ai/services/knowledge-base.service.ts` |
| **ChatSessionService** | ✅ Completo | `backend/src/modules/ai/services/chat-session.service.ts` |
| **EmailInsightsService** | ✅ Completo (summary, smart reply, categorize) | `backend/src/modules/ai/services/email-insights.service.ts` |
| **Multi-tenancy** | ✅ Completo | Prisma + Guards |
| **PostgreSQL + pgvector** | ✅ Completo | Schema Prisma |
| **Redis Caching** | ✅ Completo | CacheModule |
| **Audit Logging** | ✅ Completo | AuditModule |
| **EmailModule** (fetch/send/sync/attachments) | ✅ Completo | `backend/src/modules/email` |
| **CalendarModule** (Google/MS sync + webhooks) | ✅ Completo | `backend/src/modules/calendar` |
| **ContactsModule** (Google/MS sync + dedup queue) | ✅ Completo | `backend/src/modules/contacts` |

### 🆕 Componenti Da Implementare

1. **Sistema Multi-Agente Orchestrato**
   - BaseAgent interface
   - RouterAgent (coordinator)
   - EmailAgent specializzato
   - CalendarAgent specializzato
   - ContactsAgent specializzato
   - KnowledgeAgent specializzato (wrapper del servizio esistente)

2. **Orchestratore Conversazionale**
   - MultiAgentService
   - AiMultiAgentController
   - Gestione sessioni multi-agente

3. **Sistema HITL**
   - Schema DB `AgentPendingAction`
   - HitlService
   - HitlController
   - Policy di approvazione automatica/manuale

---

## 🗺️ Roadmap Fase per Fase

## **FASE 0: Pianificazione e Setup** (3-4 giorni)

### Obiettivi
- Definire use cases MVP
- Identificare policy HITL
- Creare branch e struttura directory
- Progettare architettura degli agenti

### Tasks

#### 0.1 Definizione Use Cases MVP
**File:** `docs/development/multi-agent-use-cases.md`

```markdown
### Use Cases MVP

1. **Smart Reply Email**
   - Input: emailId
   - Output: 3 suggerimenti di risposta
   - HITL: confidence < 0.7 → richiede approvazione

2. **Scheduling Meeting da Testo**
   - Input: "Fissa call con Mario mercoledì alle 15:00"
   - Output: Evento calendario bozza
   - HITL: sempre richiede approvazione

3. **Deduplicazione Contatti**
   - Input: scan rubrica
   - Output: lista merge proposti
   - HITL: sempre richiede approvazione

4. **RAG Knowledge Search**
   - Input: domanda utente
   - Output: documenti/email rilevanti
   - HITL: non richiede approvazione (solo lettura)
```

#### 0.2 Policy HITL
**File:** `docs/development/hitl-policies.md`

```typescript
// Matrice decisionale HITL
type HitlPolicy = {
  actionType: string;
  requiresApproval: (context: ActionContext) => boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
};

const HITL_POLICIES: HitlPolicy[] = [
  {
    actionType: 'SEND_EMAIL',
    requiresApproval: (ctx) => ctx.confidence < 0.85 || ctx.recipientCount > 1,
    severity: 'HIGH',
  },
  {
    actionType: 'CREATE_CALENDAR_EVENT',
    requiresApproval: () => true, // Sempre
    severity: 'MEDIUM',
  },
  {
    actionType: 'MERGE_CONTACTS',
    requiresApproval: () => true, // Sempre
    severity: 'MEDIUM',
  },
  {
    actionType: 'ARCHIVE_EMAIL',
    requiresApproval: (ctx) => ctx.confidence < 0.9,
    severity: 'LOW',
  },
];
```

#### 0.3 Creazione Branch
```bash
git checkout -b feature/multi-agent-orchestrator
```

#### 0.4 Struttura Directory
```
backend/src/modules/ai/
├── agents/
│   ├── interfaces/
│   │   ├── base-agent.interface.ts
│   │   ├── agent-result.interface.ts
│   │   └── agent-context.interface.ts
│   ├── router.agent.ts
│   ├── email.agent.ts
│   ├── calendar.agent.ts
│   ├── contacts.agent.ts
│   └── knowledge.agent.ts
├── multi-agent/
│   ├── multi-agent.service.ts
│   ├── multi-agent.controller.ts
│   └── dto/
│       ├── multi-agent-session.dto.ts
│       └── multi-agent-message.dto.ts
├── hitl/
│   ├── hitl.service.ts
│   ├── hitl.controller.ts
│   ├── policies/
│   │   ├── hitl-policy.interface.ts
│   │   └── default-policies.ts
│   └── dto/
│       ├── pending-action.dto.ts
│       ├── approve-action.dto.ts
│       └── reject-action.dto.ts
```

---

## **FASE 1: Infrastruttura Base Agenti** (5-7 giorni)

### 1.1 Migrazione Prisma - Schema AgentPendingAction

**File:** `backend/prisma/migrations/YYYYMMDDHHMMSS_add_agent_pending_actions/migration.sql`

```sql
-- CreateTable
CREATE TABLE "agent_pending_actions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reasoningSteps" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "agent_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_pending_actions_tenantId_status_idx" ON "agent_pending_actions"("tenantId", "status");
CREATE INDEX "agent_pending_actions_userId_status_idx" ON "agent_pending_actions"("userId", "status");
CREATE INDEX "agent_pending_actions_sessionId_idx" ON "agent_pending_actions"("sessionId");
CREATE INDEX "agent_pending_actions_createdAt_idx" ON "agent_pending_actions"("createdAt");
```

**File:** `backend/prisma/schema.prisma` (aggiungere)

```prisma
model AgentPendingAction {
  id              String    @id @default(cuid())
  sessionId       String
  userId          String
  tenantId        String
  type            String    // SEND_EMAIL, CREATE_EVENT, MERGE_CONTACTS, etc.
  payload         Json
  confidence      Float
  severity        String    // LOW, MEDIUM, HIGH
  status          String    @default("PENDING") // PENDING, APPROVED, EXECUTED, REJECTED
  reasoningSteps  String?
  createdBy       String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  approvedAt      DateTime?
  approvedBy      String?
  executedAt      DateTime?
  rejectedAt      DateTime?
  rejectedBy      String?
  rejectionReason String?

  @@index([tenantId, status])
  @@index([userId, status])
  @@index([sessionId])
  @@index([createdAt])
  @@map("agent_pending_actions")
}
```

```bash
npx prisma migrate dev --name add_agent_pending_actions
npx prisma generate
```

### 1.2 Interface BaseAgent

**File:** `backend/src/modules/ai/agents/interfaces/base-agent.interface.ts`

```typescript
import { AgentContext } from './agent-context.interface';
import { AgentResult } from './agent-result.interface';

export interface BaseAgent {
  /**
   * Nome univoco dell'agente
   */
  readonly name: string;

  /**
   * Descrizione delle capabilities dell'agente
   */
  readonly description: string;

  /**
   * Verifica se l'agente può gestire questa richiesta
   */
  canHandle(context: AgentContext): Promise<boolean> | boolean;

  /**
   * Esegue l'azione dell'agente
   */
  handle(context: AgentContext): Promise<AgentResult>;
}
```

**File:** `backend/src/modules/ai/agents/interfaces/agent-context.interface.ts`

```typescript
export interface AgentContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string }>;
  metadata?: Record<string, any>;
}
```

**File:** `backend/src/modules/ai/agents/interfaces/agent-result.interface.ts`

```typescript
export interface AgentAction {
  type: string; // SEND_EMAIL, CREATE_EVENT, etc.
  payload: Record<string, any>;
  confidence: number; // 0.0 - 1.0
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoningSteps?: string;
}

export interface AgentResult {
  messages: string[]; // Risposte testuali per l'utente
  actions: AgentAction[]; // Azioni proposte (HITL)
  metadata?: Record<string, any>;
}
```

### 1.3 RouterAgent - Orchestratore Principale

**File:** `backend/src/modules/ai/agents/router.agent.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MistralService } from '../services/mistral.service';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult } from './interfaces/agent-result.interface';

@Injectable()
export class RouterAgent implements BaseAgent {
  private readonly logger = new Logger(RouterAgent.name);
  readonly name = 'RouterAgent';
  readonly description = 'Routes user requests to specialized agents';

  constructor(private readonly mistralService: MistralService) {}

  canHandle(context: AgentContext): boolean {
    // Il router può sempre gestire (è il punto di ingresso)
    return true;
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    // Classifica l'intent dell'utente
    const intent = await this.classifyIntent(context.userMessage);

    return {
      messages: [`Intent detected: ${intent}`],
      actions: [],
      metadata: { intent, routedTo: intent },
    };
  }

  /**
   * Classifica l'intent usando Mistral
   */
  private async classifyIntent(userMessage: string): Promise<string> {
    const systemPrompt = `You are an intent classifier. Classify the user's request into one of:
- EMAIL: compose, reply, search, categorize emails
- CALENDAR: schedule, create, modify calendar events
- CONTACTS: search, merge, enrich contacts
- KNOWLEDGE: search knowledge base, answer questions

Reply with just the category name.`;

    const intent = await this.mistralService.completePrompt({
      systemPrompt,
      userPrompt: userMessage,
      temperature: 0.1,
      maxTokens: 32,
    });

    return intent.trim().toUpperCase();
  }
}
```

### 1.4 KnowledgeAgent - Wrapper del servizio esistente

**File:** `backend/src/modules/ai/agents/knowledge.agent.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult } from './interfaces/agent-result.interface';
import { KnowledgeBaseService } from '../services/knowledge-base.service';

@Injectable()
export class KnowledgeAgent implements BaseAgent {
  private readonly logger = new Logger(KnowledgeAgent.name);
  readonly name = 'KnowledgeAgent';
  readonly description = 'Search and retrieve information from RAG knowledge base';

  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  canHandle(context: AgentContext): boolean {
    // Logica semplice: keywords
    const keywords = ['cerca', 'find', 'search', 'ricorda', 'remember', 'documento'];
    return keywords.some((kw) => context.userMessage.toLowerCase().includes(kw));
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    const results = await this.knowledgeBaseService.searchKnowledgeBase({
      tenantId: context.tenantId,
      query: context.userMessage,
      limit: 5,
    });

    if (results.items.length === 0) {
      return {
        messages: ['Non ho trovato documenti rilevanti nella knowledge base.'],
        actions: [],
      };
    }

    const summary = results.items
      .map((item, idx) => `${idx + 1}. ${item.documentName}: ${item.content.slice(0, 150)}...`)
      .join('\n\n');

    return {
      messages: [`Ho trovato ${results.items.length} documenti rilevanti:\n\n${summary}`],
      actions: [], // Nessuna azione HITL (solo lettura)
      metadata: { resultsCount: results.items.length },
    };
  }
}
```

### 1.5 EmailAgent - Stub

**File:** `backend/src/modules/ai/agents/email.agent.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult } from './interfaces/agent-result.interface';
import { EmailInsightsService } from '../services/email-insights.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EmailAgent implements BaseAgent {
  private readonly logger = new Logger(EmailAgent.name);
  readonly name = 'EmailAgent';
  readonly description = 'Handle email operations: smart reply, categorize, archive';

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailInsightsService: EmailInsightsService,
  ) {}

  canHandle(context: AgentContext): boolean {
    const keywords = ['email', 'mail', 'rispondi', 'reply', 'invia', 'send'];
    return keywords.some((kw) => context.userMessage.toLowerCase().includes(kw));
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    // TODO: implementare logica smart reply
    return {
      messages: ['EmailAgent: funzionalità in sviluppo'],
      actions: [],
    };
  }
}
```

### 1.6 CalendarAgent - Stub

**File:** `backend/src/modules/ai/agents/calendar.agent.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult } from './interfaces/agent-result.interface';

@Injectable()
export class CalendarAgent implements BaseAgent {
  private readonly logger = new Logger(CalendarAgent.name);
  readonly name = 'CalendarAgent';
  readonly description = 'Schedule and manage calendar events';

  canHandle(context: AgentContext): boolean {
    const keywords = ['calendar', 'meeting', 'evento', 'appuntamento', 'schedule'];
    return keywords.some((kw) => context.userMessage.toLowerCase().includes(kw));
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    // TODO: implementare logica scheduling
    return {
      messages: ['CalendarAgent: funzionalità in sviluppo'],
      actions: [],
    };
  }
}
```

### 1.7 ContactsAgent - Stub

**File:** `backend/src/modules/ai/agents/contacts.agent.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult } from './interfaces/agent-result.interface';

@Injectable()
export class ContactsAgent implements BaseAgent {
  private readonly logger = new Logger(ContactsAgent.name);
  readonly name = 'ContactsAgent';
  readonly description = 'Deduplicate and enrich contacts';

  canHandle(context: AgentContext): boolean {
    const keywords = ['contact', 'contatto', 'rubrica', 'duplicat'];
    return keywords.some((kw) => context.userMessage.toLowerCase().includes(kw));
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    // TODO: implementare logica dedup
    return {
      messages: ['ContactsAgent: funzionalità in sviluppo'],
      actions: [],
    };
  }
}
```

---

## **FASE 2: Orchestratore Conversazionale** (7-10 giorni)

### 2.1 MultiAgentService

**File:** `backend/src/modules/ai/multi-agent/multi-agent.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RouterAgent } from '../agents/router.agent';
import { EmailAgent } from '../agents/email.agent';
import { CalendarAgent } from '../agents/calendar.agent';
import { ContactsAgent } from '../agents/contacts.agent';
import { KnowledgeAgent } from '../agents/knowledge.agent';
import { BaseAgent } from '../agents/interfaces/base-agent.interface';
import { AgentContext } from '../agents/interfaces/agent-context.interface';
import { AgentResult } from '../agents/interfaces/agent-result.interface';

@Injectable()
export class MultiAgentService {
  private readonly logger = new Logger(MultiAgentService.name);
  private readonly agents: BaseAgent[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly routerAgent: RouterAgent,
    private readonly emailAgent: EmailAgent,
    private readonly calendarAgent: CalendarAgent,
    private readonly contactsAgent: ContactsAgent,
    private readonly knowledgeAgent: KnowledgeAgent,
  ) {
    this.agents = [
      emailAgent,
      calendarAgent,
      contactsAgent,
      knowledgeAgent,
    ];
  }

  /**
   * Crea una nuova sessione multi-agente
   */
  async createSession(tenantId: string, userId: string) {
    const session = await this.prisma.chatSession.create({
      data: {
        tenantId,
        userId,
        title: 'Multi-Agent Session',
        messages: [],
      },
    });

    return {
      id: session.id,
      tenantId: session.tenantId,
      userId: session.userId,
      createdAt: session.createdAt,
    };
  }

  /**
   * Recupera una sessione
   */
  async getSession(tenantId: string, userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        tenantId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      id: session.id,
      tenantId: session.tenantId,
      userId: session.userId,
      messages: Array.isArray(session.messages) ? session.messages : [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * Elabora un messaggio dell'utente
   */
  async processMessage(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    message: string;
  }): Promise<AgentResult> {
    const { tenantId, userId, sessionId, message } = params;

    // Recupera la sessione
    const session = await this.getSession(tenantId, userId, sessionId);

    const context: AgentContext = {
      tenantId,
      userId,
      sessionId,
      userMessage: message,
      conversationHistory: session.messages,
    };

    // 1. Router decide quale agente invocare
    const routingResult = await this.routerAgent.handle(context);
    const intent = routingResult.metadata?.intent || 'KNOWLEDGE';

    // 2. Trova l'agente appropriato
    const agent = this.findAgentForIntent(intent);

    if (!agent) {
      this.logger.warn(`No agent found for intent: ${intent}, falling back to Knowledge`);
      return this.knowledgeAgent.handle(context);
    }

    // 3. Esegui l'agente
    this.logger.log(`Routing to ${agent.name} for intent: ${intent}`);
    const result = await agent.handle(context);

    // 4. Salva il risultato nella sessione
    const updatedMessages = [
      ...session.messages,
      { role: 'user', content: message },
      { role: 'assistant', content: result.messages.join('\n') },
    ];

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { messages: updatedMessages },
    });

    return result;
  }

  /**
   * Mappa intent → agente
   */
  private findAgentForIntent(intent: string): BaseAgent | null {
    const mapping: Record<string, BaseAgent> = {
      EMAIL: this.emailAgent,
      CALENDAR: this.calendarAgent,
      CONTACTS: this.contactsAgent,
      KNOWLEDGE: this.knowledgeAgent,
    };

    return mapping[intent] || null;
  }
}
```

### 2.2 MultiAgentController

**File:** `backend/src/modules/ai/multi-agent/multi-agent.controller.ts`

```typescript
import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { MultiAgentService } from './multi-agent.service';

@Controller('ai/multi-agent')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiMultiAgentController {
  constructor(private readonly multiAgentService: MultiAgentService) {}

  /**
   * POST /ai/multi-agent/session - Crea nuova sessione
   */
  @Post('session')
  async createSession(@Request() req: AuthenticatedRequest) {
    const session = await this.multiAgentService.createSession(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      session,
    };
  }

  /**
   * GET /ai/multi-agent/session/:id - Recupera sessione
   */
  @Get('session/:id')
  async getSession(
    @Request() req: AuthenticatedRequest,
    @Param('id') sessionId: string,
  ) {
    const session = await this.multiAgentService.getSession(
      req.user.tenantId,
      req.user.userId,
      sessionId,
    );

    return {
      success: true,
      session,
    };
  }

  /**
   * POST /ai/multi-agent/message - Invia messaggio
   */
  @Post('message')
  async sendMessage(
    @Request() req: AuthenticatedRequest,
    @Body() body: { sessionId: string; message: string },
  ) {
    const result = await this.multiAgentService.processMessage({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      sessionId: body.sessionId,
      message: body.message,
    });

    return {
      success: true,
      messages: result.messages,
      actions: result.actions,
      metadata: result.metadata,
    };
  }
}
```

### 2.3 Aggiornamento AiModule

**File:** `backend/src/modules/ai/ai.module.ts` (aggiornare)

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { MistralService } from './services/mistral.service';
import { AiController } from './controllers/ai.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmbeddingsService } from './services/embeddings.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
import { EmailEmbeddingQueueService } from './services/email-embedding.queue';
import { AgentService } from './services/agent.service';
import { ChatSessionService } from './services/chat-session.service';
import { EmailInsightsService } from './services/email-insights.service';
import { QueryEmbeddingCacheService } from './services/query-embedding-cache.service';
import { AttachmentContentExtractorService } from './services/attachment-content-extractor.service';
import { EmailModule } from '../email/email.module';

// Multi-Agent System
import { RouterAgent } from './agents/router.agent';
import { EmailAgent } from './agents/email.agent';
import { CalendarAgent } from './agents/calendar.agent';
import { ContactsAgent } from './agents/contacts.agent';
import { KnowledgeAgent } from './agents/knowledge.agent';
import { MultiAgentService } from './multi-agent/multi-agent.service';
import { AiMultiAgentController } from './multi-agent/multi-agent.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => EmailModule),
  ],
  providers: [
    MistralService,
    EmbeddingsService,
    KnowledgeBaseService,
    EmailEmbeddingQueueService,
    AgentService,
    ChatSessionService,
    EmailInsightsService,
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    // Multi-Agent
    RouterAgent,
    EmailAgent,
    CalendarAgent,
    ContactsAgent,
    KnowledgeAgent,
    MultiAgentService,
  ],
  controllers: [
    AiController,
    KnowledgeBaseController,
    AiMultiAgentController,
  ],
  exports: [
    MistralService,
    EmbeddingsService,
    KnowledgeBaseService,
    EmailEmbeddingQueueService,
    AgentService,
    ChatSessionService,
    EmailInsightsService,
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    // Multi-Agent
    MultiAgentService,
  ],
})
export class AiModule {}
```

---

## **FASE 3: Sistema HITL** (7-10 giorni)

### 3.1 HitlService

**File:** `backend/src/modules/ai/hitl/hitl.service.ts`

```typescript
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentAction } from '../agents/interfaces/agent-result.interface';
import { shouldRequireApproval } from './policies/default-policies';

@Injectable()
export class HitlService {
  private readonly logger = new Logger(HitlService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un'azione pending da approvare
   */
  async createPendingAction(params: {
    sessionId: string;
    tenantId: string;
    userId: string;
    action: AgentAction;
  }) {
    const { sessionId, tenantId, userId, action } = params;

    const pendingAction = await this.prisma.agentPendingAction.create({
      data: {
        sessionId,
        tenantId,
        userId,
        type: action.type,
        payload: action.payload,
        confidence: action.confidence,
        severity: action.severity,
        reasoningSteps: action.reasoningSteps,
        createdBy: userId,
        status: 'PENDING',
      },
    });

    this.logger.log(
      `Created pending action ${pendingAction.id} of type ${action.type} for user ${userId}`,
    );

    return pendingAction;
  }

  /**
   * Lista azioni pending per un utente
   */
  async listPendingActions(params: {
    tenantId: string;
    userId: string;
    status?: string;
    limit?: number;
  }) {
    const { tenantId, userId, status = 'PENDING', limit = 50 } = params;

    const actions = await this.prisma.agentPendingAction.findMany({
      where: {
        tenantId,
        userId,
        status,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return actions;
  }

  /**
   * Approva un'azione
   */
  async approveAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    modifiedPayload?: Record<string, any>;
  }) {
    const { actionId, tenantId, userId, modifiedPayload } = params;

    const action = await this.prisma.agentPendingAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    if (action.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied');
    }

    if (action.status !== 'PENDING') {
      throw new ForbiddenException(`Action is already ${action.status}`);
    }

    const updatedAction = await this.prisma.agentPendingAction.update({
      where: { id: actionId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: userId,
        ...(modifiedPayload ? { payload: modifiedPayload } : {}),
      },
    });

    this.logger.log(`Action ${actionId} approved by user ${userId}`);

    // TODO: eseguire l'azione (delegare a executor)
    await this.executeAction(updatedAction);

    return updatedAction;
  }

  /**
   * Rifiuta un'azione
   */
  async rejectAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    reason?: string;
  }) {
    const { actionId, tenantId, userId, reason } = params;

    const action = await this.prisma.agentPendingAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    if (action.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied');
    }

    if (action.status !== 'PENDING') {
      throw new ForbiddenException(`Action is already ${action.status}`);
    }

    const updatedAction = await this.prisma.agentPendingAction.update({
      where: { id: actionId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: reason,
      },
    });

    this.logger.log(`Action ${actionId} rejected by user ${userId}`);

    return updatedAction;
  }

  /**
   * Determina se un'azione richiede approvazione
   */
  requiresApproval(action: AgentAction): boolean {
    return shouldRequireApproval(action);
  }

  /**
   * Esegue un'azione approvata
   */
  private async executeAction(action: any) {
    // TODO: implementare executor per ogni tipo di azione
    this.logger.log(`Executing action ${action.id} of type ${action.type}`);

    await this.prisma.agentPendingAction.update({
      where: { id: action.id },
      data: {
        status: 'EXECUTED',
        executedAt: new Date(),
      },
    });
  }
}
```

### 3.2 HITL Policies

**File:** `backend/src/modules/ai/hitl/policies/hitl-policy.interface.ts`

```typescript
import { AgentAction } from '../../agents/interfaces/agent-result.interface';

export interface HitlPolicy {
  actionType: string;
  requiresApproval: (action: AgentAction) => boolean;
}
```

**File:** `backend/src/modules/ai/hitl/policies/default-policies.ts`

```typescript
import { HitlPolicy } from './hitl-policy.interface';
import { AgentAction } from '../../agents/interfaces/agent-result.interface';

const POLICIES: HitlPolicy[] = [
  {
    actionType: 'SEND_EMAIL',
    requiresApproval: (action) => {
      const recipientCount = action.payload.to?.length || 0;
      return action.confidence < 0.85 || recipientCount > 1;
    },
  },
  {
    actionType: 'CREATE_CALENDAR_EVENT',
    requiresApproval: () => true, // Sempre richiede approvazione
  },
  {
    actionType: 'MERGE_CONTACTS',
    requiresApproval: () => true,
  },
  {
    actionType: 'ARCHIVE_EMAIL',
    requiresApproval: (action) => action.confidence < 0.9,
  },
  {
    actionType: 'DELETE_EMAIL',
    requiresApproval: () => true,
  },
];

export function shouldRequireApproval(action: AgentAction): boolean {
  const policy = POLICIES.find((p) => p.actionType === action.type);

  if (!policy) {
    // Se non c'è policy, richiedi approvazione per sicurezza
    return true;
  }

  return policy.requiresApproval(action);
}
```

### 3.3 HitlController

**File:** `backend/src/modules/ai/hitl/hitl.controller.ts`

```typescript
import { Controller, Get, Post, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { HitlService } from './hitl.service';

@Controller('ai/hitl')
@UseGuards(JwtAuthGuard, TenantGuard)
export class HitlController {
  constructor(private readonly hitlService: HitlService) {}

  /**
   * GET /ai/hitl/actions - Lista azioni pending
   */
  @Get('actions')
  async listActions(
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const actions = await this.hitlService.listPendingActions({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      status: status || 'PENDING',
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return {
      success: true,
      actions,
    };
  }

  /**
   * POST /ai/hitl/actions/:id/approve - Approva azione
   */
  @Post('actions/:id/approve')
  async approveAction(
    @Request() req: AuthenticatedRequest,
    @Param('id') actionId: string,
    @Body() body?: { modifiedPayload?: Record<string, any> },
  ) {
    const action = await this.hitlService.approveAction({
      actionId,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      modifiedPayload: body?.modifiedPayload,
    });

    return {
      success: true,
      action,
    };
  }

  /**
   * POST /ai/hitl/actions/:id/reject - Rifiuta azione
   */
  @Post('actions/:id/reject')
  async rejectAction(
    @Request() req: AuthenticatedRequest,
    @Param('id') actionId: string,
    @Body() body?: { reason?: string },
  ) {
    const action = await this.hitlService.rejectAction({
      actionId,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      reason: body?.reason,
    });

    return {
      success: true,
      action,
    };
  }
}
```

### 3.4 Integrazione HITL in MultiAgentService

**File:** `backend/src/modules/ai/multi-agent/multi-agent.service.ts` (aggiornare)

```typescript
// Aggiungere al constructor:
constructor(
  // ... altri servizi
  private readonly hitlService: HitlService,
) {}

// Modificare processMessage:
async processMessage(params: {
  tenantId: string;
  userId: string;
  sessionId: string;
  message: string;
}): Promise<AgentResult & { pendingActions?: any[] }> {
  // ... logica esistente fino a result

  // Gestione HITL per le azioni proposte
  const pendingActions = [];
  for (const action of result.actions) {
    if (this.hitlService.requiresApproval(action)) {
      const pending = await this.hitlService.createPendingAction({
        sessionId,
        tenantId,
        userId,
        action,
      });
      pendingActions.push(pending);
    } else {
      // Auto-esegui azioni low-risk
      this.logger.log(`Auto-executing low-risk action: ${action.type}`);
      // TODO: implementare auto-execution
    }
  }

  // ... salvataggio messaggi

  return {
    ...result,
    pendingActions,
  };
}
```

### 3.5 Aggiornamento AiModule per HITL

**File:** `backend/src/modules/ai/ai.module.ts` (aggiornare)

```typescript
// Aggiungere imports
import { HitlService } from './hitl/hitl.service';
import { HitlController } from './hitl/hitl.controller';

// Aggiungere a providers:
HitlService,

// Aggiungere a controllers:
HitlController,

// Aggiungere a exports:
HitlService,
```

---

## **FASE 4: Implementazione Agenti Specializzati** (10-14 giorni)

**Obiettivi di integrazione dominio**
- EmailAgent: usare i servizi esistenti (`EmailInsightsService`, `EmailSendService`, `AttachmentOnDemandService`, `StorageService`) per smart reply, categorizzazione, archiviazione e invio bozza; notificare via `RealtimeModule` e incanalare le azioni HITL come `SEND_EMAIL_DRAFT`, `ARCHIVE_EMAIL`, `CATEGORIZE_THREAD`.
- CalendarAgent: orchestrare `CalendarService` + `CalendarProviderFactory` per creare eventi in bozza, proporre slot e inviare inviti; agganciare i webhook Google/MS già in `calendar` per riconciliare stato; esporre azioni HITL `CREATE_CALENDAR_EVENT` e `UPDATE_CALENDAR_EVENT`.
- ContactsAgent: riusare `ContactsService`, `ContactsSyncQueueService` e `ContactsSyncSchedulerService` per deduplica ed arricchimento; produrre azioni HITL `MERGE_CONTACTS` e `ENRICH_CONTACT`; mantenere coerenza con i worker di sync e con i webhook Google/MS.
- Tutti gli agenti: rispettare multi-tenant e audit logging, ritornare pending actions con confidence/severity, e riutilizzare storage/attachment/realtime già presenti invece di duplicare logica.

### 4.1 EmailAgent - Implementazione Completa

**File:** `backend/src/modules/ai/agents/email.agent.ts` (sostituire)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult, AgentAction } from './interfaces/agent-result.interface';
import { EmailInsightsService } from '../services/email-insights.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from '../services/mistral.service';

@Injectable()
export class EmailAgent implements BaseAgent {
  private readonly logger = new Logger(EmailAgent.name);
  readonly name = 'EmailAgent';
  readonly description = 'Handle email operations: smart reply, categorize, archive, compose';

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailInsightsService: EmailInsightsService,
    private readonly mistralService: MistralService,
  ) {}

  canHandle(context: AgentContext): boolean {
    const keywords = ['email', 'mail', 'rispondi', 'reply', 'invia', 'send', 'compose'];
    return keywords.some((kw) => context.userMessage.toLowerCase().includes(kw));
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    const intent = await this.detectEmailIntent(context.userMessage);

    switch (intent) {
      case 'SMART_REPLY':
        return this.handleSmartReply(context);
      case 'COMPOSE':
        return this.handleCompose(context);
      case 'ARCHIVE':
        return this.handleArchive(context);
      default:
        return {
          messages: ['Non ho capito cosa vuoi fare con le email. Puoi essere più specifico?'],
          actions: [],
        };
    }
  }

  private async detectEmailIntent(message: string): Promise<string> {
    const prompt = `Classify this email request into: SMART_REPLY, COMPOSE, ARCHIVE, SEARCH
User: ${message}
Intent:`;

    const response = await this.mistralService.completePrompt({
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 16,
    });

    return response.trim().toUpperCase();
  }

  private async handleSmartReply(context: AgentContext): Promise<AgentResult> {
    // Estrai emailId dal messaggio
    const emailIdMatch = context.userMessage.match(/email[:\s]+([a-z0-9]+)/i);
    if (!emailIdMatch) {
      return {
        messages: ['Per generare una smart reply, specifica l\'ID dell\'email.'],
        actions: [],
      };
    }

    const emailId = emailIdMatch[1];

    // Genera suggerimenti
    const suggestions = await this.emailInsightsService.generateSmartReplies(
      context.tenantId,
      emailId,
    );

    // Proponi il primo suggerimento come azione
    const action: AgentAction = {
      type: 'SEND_EMAIL',
      payload: {
        replyToEmailId: emailId,
        body: suggestions[0],
      },
      confidence: 0.75,
      severity: 'MEDIUM',
      reasoningSteps: 'Generated smart reply based on email context',
    };

    return {
      messages: [
        `Ho generato ${suggestions.length} suggerimenti di risposta:`,
        ...suggestions.map((s, i) => `${i + 1}. ${s}`),
      ],
      actions: [action],
    };
  }

  private async handleCompose(context: AgentContext): Promise<AgentResult> {
    // Estrai destinatario e corpo dal messaggio
    const prompt = `Extract recipient and body from this compose request:
"${context.userMessage}"

Format:
TO: [email]
SUBJECT: [subject]
BODY: [body]`;

    const response = await this.mistralService.completePrompt({
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 512,
    });

    const action: AgentAction = {
      type: 'SEND_EMAIL',
      payload: {
        composedEmail: response,
      },
      confidence: 0.65,
      severity: 'HIGH',
      reasoningSteps: 'Composed email from user instruction',
    };

    return {
      messages: [`Ho preparato questa bozza di email:\n\n${response}`],
      actions: [action],
    };
  }

  private async handleArchive(context: AgentContext): Promise<AgentResult> {
    // TODO: implementare logica di archiviazione
    return {
      messages: ['Funzionalità di archiviazione in sviluppo'],
      actions: [],
    };
  }
}
```

### 4.2 CalendarAgent - Implementazione Completa

**File:** `backend/src/modules/ai/agents/calendar.agent.ts` (sostituire)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult, AgentAction } from './interfaces/agent-result.interface';
import { MistralService } from '../services/mistral.service';
import { PrismaService } from '../../../prisma/prisma.service';

interface ParsedEvent {
  title: string;
  startTime: string;
  endTime?: string;
  attendees?: string[];
  location?: string;
  description?: string;
}

@Injectable()
export class CalendarAgent implements BaseAgent {
  private readonly logger = new Logger(CalendarAgent.name);
  readonly name = 'CalendarAgent';
  readonly description = 'Schedule and manage calendar events';

  constructor(
    private readonly mistralService: MistralService,
    private readonly prisma: PrismaService,
  ) {}

  canHandle(context: AgentContext): boolean {
    const keywords = [
      'calendar',
      'meeting',
      'evento',
      'appuntamento',
      'schedule',
      'call',
      'riunione',
    ];
    return keywords.some((kw) => context.userMessage.toLowerCase().includes(kw));
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    // Parse evento dal linguaggio naturale
    const parsedEvent = await this.parseEventFromNaturalLanguage(context.userMessage);

    if (!parsedEvent.title || !parsedEvent.startTime) {
      return {
        messages: [
          'Non sono riuscito a capire tutti i dettagli dell\'evento. Per favore specifica almeno titolo e data/ora.',
        ],
        actions: [],
      };
    }

    // Cerca slot disponibili (mock per ora)
    const availableSlots = await this.findAvailableSlots(
      context.tenantId,
      parsedEvent.startTime,
    );

    const action: AgentAction = {
      type: 'CREATE_CALENDAR_EVENT',
      payload: {
        title: parsedEvent.title,
        startTime: parsedEvent.startTime,
        endTime: parsedEvent.endTime,
        attendees: parsedEvent.attendees,
        location: parsedEvent.location,
        description: parsedEvent.description,
      },
      confidence: 0.8,
      severity: 'MEDIUM',
      reasoningSteps: `Parsed event from natural language. Found ${availableSlots.length} available slots.`,
    };

    return {
      messages: [
        `Ho preparato l'evento:`,
        `• Titolo: ${parsedEvent.title}`,
        `• Data/ora: ${parsedEvent.startTime}`,
        `• Durata: ${parsedEvent.endTime || 'da definire'}`,
        parsedEvent.attendees ? `• Partecipanti: ${parsedEvent.attendees.join(', ')}` : '',
      ].filter(Boolean),
      actions: [action],
    };
  }

  private async parseEventFromNaturalLanguage(message: string): Promise<ParsedEvent> {
    const prompt = `Parse this calendar event request into structured data:
"${message}"

Respond in JSON format:
{
  "title": "event title",
  "startTime": "ISO 8601 datetime",
  "endTime": "ISO 8601 datetime (optional)",
  "attendees": ["email1", "email2"],
  "location": "location (optional)",
  "description": "description (optional)"
}`;

    const response = await this.mistralService.completePrompt({
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: 256,
    });

    try {
      // Estrai JSON dalla risposta
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      this.logger.error('Failed to parse event JSON:', error);
      return { title: '', startTime: '' };
    }
  }

  private async findAvailableSlots(tenantId: string, targetTime: string): Promise<string[]> {
    // TODO: implementare logica di ricerca slot liberi
    // Per ora ritorna mock
    return ['10:00-11:00', '14:00-15:00'];
  }
}
```

### 4.3 ContactsAgent - Implementazione Completa

**File:** `backend/src/modules/ai/agents/contacts.agent.ts` (sostituire)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from './interfaces/base-agent.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { AgentResult, AgentAction } from './interfaces/agent-result.interface';
import { PrismaService } from '../../../prisma/prisma.service';

interface ContactDuplicate {
  contact1: any;
  contact2: any;
  similarityScore: number;
}

@Injectable()
export class ContactsAgent implements BaseAgent {
  private readonly logger = new Logger(ContactsAgent.name);
  readonly name = 'ContactsAgent';
  readonly description = 'Deduplicate and enrich contacts';

  constructor(private readonly prisma: PrismaService) {}

  canHandle(context: AgentContext): boolean {
    const keywords = ['contact', 'contatto', 'rubrica', 'duplicat', 'merge'];
    return keywords.some((kw) => context.userMessage.toLowerCase().includes(kw));
  }

  async handle(context: AgentContext): Promise<AgentResult> {
    // Trova duplicati
    const duplicates = await this.findDuplicates(context.tenantId);

    if (duplicates.length === 0) {
      return {
        messages: ['Non ho trovato contatti duplicati nella rubrica.'],
        actions: [],
      };
    }

    // Proponi merge per i primi 5 duplicati
    const actions: AgentAction[] = duplicates.slice(0, 5).map((dup) => ({
      type: 'MERGE_CONTACTS',
      payload: {
        contactId1: dup.contact1.id,
        contactId2: dup.contact2.id,
        mergedData: this.suggestMergeStrategy(dup.contact1, dup.contact2),
      },
      confidence: dup.similarityScore,
      severity: 'MEDIUM',
      reasoningSteps: `Similarity score: ${dup.similarityScore.toFixed(2)}`,
    }));

    const messages = [
      `Ho trovato ${duplicates.length} possibili duplicati.`,
      'Ecco i primi 5:',
      ...duplicates.slice(0, 5).map((dup, idx) => {
        const c1 = dup.contact1;
        const c2 = dup.contact2;
        return `${idx + 1}. ${c1.displayName || c1.firstName} vs ${c2.displayName || c2.firstName} (score: ${dup.similarityScore.toFixed(2)})`;
      }),
    ];

    return { messages, actions };
  }

  private async findDuplicates(tenantId: string): Promise<ContactDuplicate[]> {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId, isDeleted: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
        emails: true,
      },
    });

    const duplicates: ContactDuplicate[] = [];

    // Algoritmo O(n²) semplice per trovare duplicati
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const score = this.calculateSimilarity(contacts[i], contacts[j]);
        if (score > 0.7) {
          duplicates.push({
            contact1: contacts[i],
            contact2: contacts[j],
            similarityScore: score,
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.similarityScore - a.similarityScore);
  }

  private calculateSimilarity(c1: any, c2: any): number {
    let score = 0;

    // Confronto firstName
    if (c1.firstName && c2.firstName) {
      score += this.stringSimilarity(c1.firstName, c2.firstName) * 0.3;
    }

    // Confronto lastName
    if (c1.lastName && c2.lastName) {
      score += this.stringSimilarity(c1.lastName, c2.lastName) * 0.3;
    }

    // Confronto email
    const emails1 = Array.isArray(c1.emails) ? c1.emails : [];
    const emails2 = Array.isArray(c2.emails) ? c2.emails : [];
    const commonEmails = emails1.filter((e: any) =>
      emails2.some((e2: any) => e.value === e2.value)
    );
    if (commonEmails.length > 0) {
      score += 0.4;
    }

    return score;
  }

  private stringSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  private suggestMergeStrategy(c1: any, c2: any): any {
    // Strategia semplice: preferisci il contatto più completo
    const c1Fields = Object.values(c1).filter((v) => v != null).length;
    const c2Fields = Object.values(c2).filter((v) => v != null).length;

    return c1Fields >= c2Fields ? { ...c2, ...c1 } : { ...c1, ...c2 };
  }
}
```

---

## **FASE 5: Testing e Sicurezza** (7-10 giorni)

### 5.1 Test Unitari - RouterAgent

**File:** `backend/src/modules/ai/agents/router.agent.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { RouterAgent } from './router.agent';
import { MistralService } from '../services/mistral.service';
import { AgentContext } from './interfaces/agent-context.interface';

describe('RouterAgent', () => {
  let agent: RouterAgent;
  let mistralService: jest.Mocked<MistralService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouterAgent,
        {
          provide: MistralService,
          useValue: {
            completePrompt: jest.fn(),
          },
        },
      ],
    }).compile();

    agent = module.get<RouterAgent>(RouterAgent);
    mistralService = module.get(MistralService);
  });

  describe('canHandle', () => {
    it('should always return true', () => {
      const context: AgentContext = {
        tenantId: 'test-tenant',
        userId: 'test-user',
        sessionId: 'test-session',
        userMessage: 'test message',
        conversationHistory: [],
      };

      expect(agent.canHandle(context)).toBe(true);
    });
  });

  describe('handle', () => {
    it('should classify intent as EMAIL', async () => {
      mistralService.completePrompt.mockResolvedValue('EMAIL');

      const context: AgentContext = {
        tenantId: 'test-tenant',
        userId: 'test-user',
        sessionId: 'test-session',
        userMessage: 'Send an email to john@example.com',
        conversationHistory: [],
      };

      const result = await agent.handle(context);

      expect(result.messages).toContain('Intent detected: EMAIL');
      expect(result.metadata?.intent).toBe('EMAIL');
    });
  });
});
```

### 5.2 Test Integrazione - Multi-Agent Flow

**File:** `backend/src/modules/ai/multi-agent/multi-agent.integration.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MultiAgentService } from './multi-agent.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RouterAgent } from '../agents/router.agent';
import { EmailAgent } from '../agents/email.agent';
import { CalendarAgent } from '../agents/calendar.agent';
import { ContactsAgent } from '../agents/contacts.agent';
import { KnowledgeAgent } from '../agents/knowledge.agent';
import { HitlService } from '../hitl/hitl.service';

describe('MultiAgentService Integration', () => {
  let service: MultiAgentService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiAgentService,
        PrismaService,
        RouterAgent,
        EmailAgent,
        CalendarAgent,
        ContactsAgent,
        KnowledgeAgent,
        HitlService,
        // Mock dependencies
      ],
    }).compile();

    service = module.get<MultiAgentService>(MultiAgentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('createSession', () => {
    it('should create a new multi-agent session', async () => {
      const session = await service.createSession('tenant-1', 'user-1');

      expect(session.id).toBeDefined();
      expect(session.tenantId).toBe('tenant-1');
      expect(session.userId).toBe('user-1');
    });
  });

  describe('processMessage', () => {
    it('should route email request to EmailAgent', async () => {
      const session = await service.createSession('tenant-1', 'user-1');

      const result = await service.processMessage({
        tenantId: 'tenant-1',
        userId: 'user-1',
        sessionId: session.id,
        message: 'Send email to john@example.com',
      });

      expect(result.messages.length).toBeGreaterThan(0);
    });
  });
});
```

### 5.3 Validazione Multi-Tenant

**File:** `backend/src/modules/ai/multi-agent/multi-agent.security.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MultiAgentService } from './multi-agent.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('MultiAgent Security', () => {
  let service: MultiAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MultiAgentService, PrismaService],
    }).compile();

    service = module.get<MultiAgentService>(MultiAgentService);
  });

  it('should prevent cross-tenant session access', async () => {
    const session1 = await service.createSession('tenant-1', 'user-1');

    await expect(
      service.getSession('tenant-2', 'user-2', session1.id),
    ).rejects.toThrow('Session not found');
  });

  it('should prevent unauthorized action approval', async () => {
    // TODO: test HITL cross-tenant isolation
  });
});
```

### 5.4 Logging e Audit

**File:** `backend/src/modules/ai/multi-agent/multi-agent.service.ts` (aggiungere)

```typescript
import { AuditService } from '../../audit/services/audit.service';

// Nel constructor:
constructor(
  // ... altri servizi
  private readonly auditService: AuditService,
) {}

// In processMessage, dopo l'esecuzione:
await this.auditService.log({
  tenantId,
  userId,
  action: 'AI_AGENT_EXECUTION',
  entity: 'MultiAgent',
  entityId: sessionId,
  changes: {
    agent: agent.name,
    intent,
    actionsCount: result.actions.length,
  },
});
```

---

## **FASE 6: Rollout Graduale** (5-7 giorni)

### 6.1 Feature Flag

**File:** `backend/src/config/configuration.ts` (aggiungere)

```typescript
export const getConfiguration = () => ({
  // ... existing config
  multiAgent: {
    enabled: process.env.MULTI_AGENT_ENABLED === 'true',
    betaUserIds: (process.env.MULTI_AGENT_BETA_USERS || '').split(','),
    autoExecuteLowRisk: process.env.MULTI_AGENT_AUTO_EXEC === 'true',
  },
});
```

**File:** `.env` (aggiungere)

```bash
MULTI_AGENT_ENABLED=false
MULTI_AGENT_BETA_USERS=user-id-1,user-id-2
MULTI_AGENT_AUTO_EXEC=false
```

### 6.2 Guard per Beta Users

**File:** `backend/src/modules/ai/multi-agent/guards/multi-agent-beta.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MultiAgentBetaGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = this.configService.get<boolean>('multiAgent.enabled');

    if (!enabled) {
      throw new ForbiddenException('Multi-agent system is not enabled');
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    const betaUsers = this.configService.get<string[]>('multiAgent.betaUserIds') || [];

    if (betaUsers.length > 0 && !betaUsers.includes(userId)) {
      throw new ForbiddenException('Multi-agent system is in beta');
    }

    return true;
  }
}
```

**File:** `backend/src/modules/ai/multi-agent/multi-agent.controller.ts` (aggiornare)

```typescript
import { MultiAgentBetaGuard } from './guards/multi-agent-beta.guard';

@Controller('ai/multi-agent')
@UseGuards(JwtAuthGuard, TenantGuard, MultiAgentBetaGuard)
export class AiMultiAgentController {
  // ...
}
```

### 6.3 Metrics e Monitoring

**File:** `backend/src/modules/ai/multi-agent/multi-agent.service.ts` (aggiungere)

```typescript
// Aggiungere dopo ogni processMessage:
private async recordMetrics(params: {
  agent: string;
  duration: number;
  success: boolean;
}) {
  // TODO: integrare con Prometheus/Grafana
  this.logger.log(`Metrics: agent=${params.agent} duration=${params.duration}ms success=${params.success}`);
}
```

---

## **FASE 7: Iterazione Continua** (Ongoing)

### 7.1 Nuovi Agenti

Roadmap futura:
- **FollowUpAgent**: Suggerisce follow-up su email senza risposta
- **DigestAgent**: Genera digest giornalieri/settimanali
- **PriorityAgent**: Assegna priorità automatica alle email
- **SummaryAgent**: Riassunto conversazioni lunghe

### 7.2 Auto-Execution per Low-Risk

**File:** `backend/src/modules/ai/hitl/policies/default-policies.ts` (aggiornare)

```typescript
export function canAutoExecute(action: AgentAction): boolean {
  if (action.confidence < 0.95) return false;
  if (action.severity === 'HIGH') return false;

  const autoExecActions = ['ARCHIVE_EMAIL', 'CATEGORIZE_EMAIL'];
  return autoExecActions.includes(action.type);
}
```

### 7.3 UI Task Inbox

**Frontend (fuori scope backend):**
- Dashboard con pending actions
- Bulk approve/reject
- Timeline esecuzione azioni
- Feedback loop per migliorare confidence

---

## 📊 Checklist Implementazione

### Fase 0: Pianificazione ✅ COMPLETED
- [x] Use cases MVP definiti
- [x] HITL policies documentate
- [x] Branch creato
- [x] Struttura directory creata (`backend/src/modules/ai/multi-agent/`)

### Fase 1: Infrastruttura ✅ COMPLETED
- [x] Migrazione Prisma `AgentPendingAction`
- [x] `BaseAgent` interface con multi-language support
- [x] `RouterAgent` implementato con LangChain/Mistral
- [x] `KnowledgeAgent` implementato
- [x] `EmailAgent` completo con PMS branding
- [x] `CalendarAgent` completo con PMS branding
- [x] `ContactsAgent` completo con PMS branding
- [x] `GeneralAgent` per chat/greetings

### Fase 2: Orchestratore ✅ COMPLETED
- [x] `MultiAgentService` implementato
- [x] `MultiAgentController` implementato
- [x] `MultiAgentModule` separato da AiModule
- [x] Agent registration system
- [x] Intent classification con fast-path detection

### Fase 3: HITL ✅ COMPLETED
- [x] `HitlService` implementato
- [x] Pending actions controller integrato
- [x] HITL policies con severity levels
- [x] Auto-approve based on confidence threshold
- [x] User preferences for auto-approve threshold

### Fase 4: Agenti Specializzati ✅ COMPLETED
- [x] `EmailAgent` completo con multi-language prompts
- [x] `CalendarAgent` completo con timezone support
- [x] `ContactsAgent` completo con search/dedupe
- [x] `GeneralAgent` per conversational AI

### Fase 5: Testing ✅ COMPLETED
- [x] Backend compiles with 0 errors
- [x] Integration test with real providers (Gmail, Microsoft)
- [x] Multi-tenant isolation via guards
- [x] Audit logging ready

### Fase 6: Rollout ✅ COMPLETED
- [x] JwtAuthGuard + TenantGuard on all endpoints
- [x] Swagger API documentation
- [x] Environment config for Mistral API

### Fase 7b: Improvements ✅ COMPLETED (2025-11-25)
- [x] Multi-language support (en, it, es, fr, de, pt) - `LANGUAGE_MAP` in BaseAgent
- [x] PMS branding - Bot identity as "PMS (PMSync)"
- [x] FIFO memory service for conversation history (`MemoryService`)
- [x] User preferences integration from database (language, timezone, AI settings)
- [x] Extended `AgentContext` with `aiSmartRepliesEnabled`, `aiSummarizationEnabled`, `aiSchedulingEnabled`
- [x] Feedback learning loop (`FeedbackService`)
- [x] Action executor service (`ActionExecutorService`)

### Fase 7c: Real-time Notifications ✅ COMPLETED (2025-11-25)

- [x] Integrate RealtimeModule for pending actions notifications
- [x] WebSocket events for action status updates
- [x] AI event types (`AiActionEventPayload`, `AiSessionEventPayload`) in `realtime.types.ts`
- [x] Real-time emit methods in `RealtimeEventsService`:
  - `emitAiActionCreated` - When new pending action is created
  - `emitAiActionApproved` - When action is approved
  - `emitAiActionRejected` - When action is rejected
  - `emitAiActionExecuted` - When action is executed successfully
  - `emitAiActionFailed` - When action execution fails
  - `emitAiSessionUpdate` - For session status updates
- [x] HitlService integration with RealtimeEventsService

### Fase 7d: Personalization System 🔄 DESIGN COMPLETE (2025-11-25)

See [02_PERSONALIZATION_DESIGN.md](./02_PERSONALIZATION_DESIGN.md) for full design.

**Key Components:**

- [ ] Job/Role-based personalization (EXECUTIVE, MANAGER, IC, FREELANCER, STUDENT)
- [ ] Semantic memory with embeddings (UserProfileEmbedding model)
- [ ] Interaction-based learning from approvals/rejections
- [ ] Communication style preferences (FORMAL, CASUAL, TECHNICAL)
- [ ] Working hours and proactivity settings

**Implementation Order:**

1. Schema updates (UserPreferences + UserProfileEmbedding)
2. UserProfileService with role templates
3. SemanticMemoryService for fact/preference extraction
4. Enhanced FeedbackService for pattern learning
5. Frontend profile settings page

### Fase 8: Frontend UI 🔄

- [ ] AI Dashboard with chat interface
- [ ] Pending Actions UI (approve/reject)
- [ ] Action history timeline
- [ ] Settings page for AI preferences
- [ ] Profile/Personalization settings (from Fase 7d)

---

## 📚 Riferimenti

- [Documento Roadmap Originale](./mutiagent.md)
- [Schema Prisma](../../backend/prisma/schema.prisma)
- [AI Module](../../backend/src/modules/ai/)
- [Swagger API Docs](http://localhost:3000/api/docs) (dev env)
- **Postgres graph+RAG references (planning)**:
  - https://github.com/dmcdonald11/postgres-for-rag/blob/master/README.md (Postgres + pgvector + Apache AGE graph)
- https://pgdash.io/blog/rag-with-postgresql.html (pgDash: RAG with Postgres/pgvector)
- https://www.enterprisedb.com/blog/rag-app-postgres-and-pgvector (EDB blog: RAG app with Postgres/pgvector)
- https://www.infoworld.com/article/3516109/using-postgresql-as-a-vector-database-in-rag.html (InfoWorld: RAG on Postgres/pgvector)
- https://medium.com/@levi_stringer/rag-with-pg-vector-with-sql-alchemy-d08d96bfa293 (Medium: RAG with pgvector + SQLAlchemy)
- **External refs by phase/topic**:
  - Multi-agent orchestration: https://blog.langchain.dev/langgraph-multi-agent-workflows/ (LangGraph multi-agent); https://python.langchain.com/docs/modules/agents/ (LangChain agents)
  - HITL patterns: https://aws.amazon.com/what-is/human-in-the-loop/ (HITL basics); https://neptune.ai/blog/human-in-the-loop-machine-learning (best practices)
  - Tool/plan-execute agents: https://microsoft.github.io/autogen/ (AutoGen); https://docs.mistral.ai/guides/function-calling/ (Mistral function calling)
  - Testing AI systems: https://docs.nestjs.com/fundamentals/testing (NestJS); https://github.com/goldbergyoni/javascript-testing-best-practices (JS testing)

### How to use these references (step-by-step)
- Fase 1–2 (infrastruttura/orchestratore): start from LangChain agents + LangGraph multi-agent workflows to shape Router/Tools flow; use Mistral function-calling guide for tool wiring.
- Fase 3 (HITL): follow AWS HITL + Neptune HITL best practices to define approval policies and guardrails.
- Fase 4 (agenti specializzati): keep AutoGen as a reference for tool-calling patterns and error handling; apply domain services from our modules.
- Fase 5 (testing): lean on NestJS testing docs + JS testing best practices for unit/integration/e2e.
- Fase RAG/graph storage: consult pgDash/EDB/InfoWorld/pgvector Medium posts for Postgres vector + (optional) graph via Apache AGE.

### Intelligent Secretary (proactive assistant) references
- Proactive email + scheduling assistants: https://microsoft.github.io/autogen/docs/usecases/assistant (AutoGen assistant patterns)
- Plan-and-execute agents: https://blog.langchain.dev/plan-and-execute-agents/ (planning then tool execution)
- Calendar scheduling examples: https://python.langchain.com/docs/use_cases/agent_simulations/meeting_scheduler (LangChain meeting scheduler)
- Task extraction and reminders: https://blog.langchain.dev/task-extraction-agents/ (turning emails into tasks)
- Persona/tone control: https://docs.mistral.ai/guides/function-calling/ (structured outputs to enforce style/constraints)
- UI/UX for assistant/HITL flows: https://mui.com/material-ui/ (components), https://mui.com/x/react-data-grid/ (tables/inbox), https://notistack.com/ (notifications), https://www.nngroup.com/articles/dialog-design/ (confirmation dialogs)

### Frontend rollout plan (concise)
- AI Dashboard: extend `pages/dashboard/ai.tsx` with action panel (approve/reject/edit proposed actions), confidence/severity chips, citations, quick actions (smart reply/schedule/dedupe), streaming UI.
- HITL Inbox: new page (e.g., `/dashboard/hitl`) with table/cards of `agent_pending_actions`, filters by type/status/severity, payload preview, realtime updates, bulk approve/reject.
- Email UI: smart replies/triage chips, summary sidebar, task extraction; approval banners for send/archive/categorize.
- Calendar UI: scheduling drawer with proposed slots/agenda; reschedule suggestions; approval for event creation.
- Contacts UI: dedupe/enrich list with similarity scores; approve merges individually or bulk.
- Landing: add “Intelligent Secretary” feature block linking to dashboard AI; highlight safety (HITL), proactive suggestions, RAG answers.

---

## 🎯 Success Metrics

### KPI da Monitorare

1. **Adoption Rate**
   - % utenti beta che usano il sistema
   - Numero sessioni multi-agente/giorno

2. **HITL Efficiency**
   - Tempo medio approvazione azioni
   - % azioni approvate vs rifiutate
   - % azioni auto-eseguite (low-risk)

3. **Agent Performance**
   - Accuracy intent classification (RouterAgent)
   - Confidence score medio per agente
   - Tempo risposta medio

4. **User Satisfaction**
   - Feedback qualitativo utenti beta
   - Task completion rate
   - Error rate

---

## 🚀 Quick Start

```bash
# 1. Checkout branch
git checkout -b feature/multi-agent-orchestrator

# 2. Installa dipendenze
cd backend
npm install

# 3. Esegui migrazione DB
npx prisma migrate dev --name add_agent_pending_actions
npx prisma generate

# 4. Configura .env
echo "MULTI_AGENT_ENABLED=true" >> .env
echo "MULTI_AGENT_BETA_USERS=your-user-id" >> .env

# 5. Avvia backend
npm run start:dev

# 6. Test API
curl -X POST http://localhost:3000/ai/multi-agent/session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

---

**Versione:** 1.1
**Ultimo aggiornamento:** 2025-11-25
**Autore:** Claude Code

---

## 📝 Implementation Log (2025-11-25)

### Backend Files Created/Modified

**New Files:**
- `backend/src/modules/ai/multi-agent/services/memory.service.ts` - FIFO conversation memory management
- `backend/src/modules/ai/multi-agent/services/hitl.service.ts` - Human-in-the-Loop approval
- `backend/src/modules/ai/multi-agent/services/feedback.service.ts` - Learning feedback loop
- `backend/src/modules/ai/multi-agent/services/action-executor.service.ts` - Action execution
- `backend/src/modules/ai/multi-agent/agents/base.agent.ts` - Base agent with multi-language support
- `backend/src/modules/ai/multi-agent/agents/router.agent.ts` - Intent classification
- `backend/src/modules/ai/multi-agent/agents/email.agent.ts` - Email operations
- `backend/src/modules/ai/multi-agent/agents/calendar.agent.ts` - Calendar scheduling
- `backend/src/modules/ai/multi-agent/agents/contacts.agent.ts` - Contact management
- `backend/src/modules/ai/multi-agent/agents/general.agent.ts` - General chat/help

**Modified Files:**

- `backend/src/modules/ai/multi-agent/multi-agent.module.ts` - Added MemoryService, RealtimeModule import
- `backend/src/modules/ai/multi-agent/services/multi-agent.service.ts` - Integrated memory and feedback
- `backend/src/modules/ai/multi-agent/services/hitl.service.ts` - Integrated RealtimeEventsService for WebSocket notifications
- `backend/src/modules/ai/multi-agent/controllers/multi-agent.controller.ts` - UserPreferences from DB
- `backend/src/modules/ai/multi-agent/interfaces/agent-context.interface.ts` - Added AI feature flags
- `backend/src/modules/realtime/types/realtime.types.ts` - Added AI event types (AiActionEventPayload, AiSessionEventPayload)
- `backend/src/modules/realtime/services/realtime-events.service.ts` - Added AI emit methods
- `backend/prisma/schema.prisma` - Added AI preferences to UserPreferences model

### API Endpoints Available

```
POST   /ai/multi-agent/process           - Process user message
GET    /ai/multi-agent/agents            - List registered agents
GET    /ai/multi-agent/pending-actions   - Get pending actions
GET    /ai/multi-agent/pending-actions/:id - Get specific action
POST   /ai/multi-agent/pending-actions/:id/approve - Approve action
POST   /ai/multi-agent/pending-actions/:id/reject  - Reject action
GET    /ai/multi-agent/stats/action-counts - Action statistics
GET    /ai/multi-agent/stats/learning    - Learning stats
GET    /ai/multi-agent/stats/aggregate   - Aggregate stats
GET    /ai/multi-agent/feedback          - Feedback history
POST   /ai/multi-agent/learning/reset    - Reset learning profile
```

### Database Schema Updates

```prisma
model UserPreferences {
  // ... existing fields
  timezone                    String?  @default("UTC")
  aiSmartRepliesEnabled       Boolean  @default(true)
  aiSummarizationEnabled      Boolean  @default(true)
  aiSchedulingEnabled         Boolean  @default(true)
  aiAutoApproveThreshold      Float?   @default(0.9)
}
```

### Next Steps

1. **RealtimeModule Integration** - Add WebSocket events for:
   - `ai:action:created` - New pending action
   - `ai:action:approved` - Action approved
   - `ai:action:rejected` - Action rejected
   - `ai:action:executed` - Action completed

2. **Frontend Phase 8** - Build UI components:
   - AI Chat panel with streaming responses
   - Pending Actions inbox with approve/reject
   - Settings page for AI preferences
