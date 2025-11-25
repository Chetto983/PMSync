# Sistema di Memoria Storica e Feedback Loop per Multi-Agent

## 📋 Overview

Il sistema multi-agente deve **imparare dalle decisioni passate** per:
1. ✅ Aumentare la confidence delle previsioni nel tempo
2. ✅ Personalizzare il comportamento per utente/tenant
3. ✅ Ottimizzare le policy HITL automaticamente
4. ✅ Ridurre progressivamente il carico di approvazioni manuali

---

## 🎯 Obiettivi del Sistema di Learning

### Feedback Loop Continuo
```
┌─────────────────────────────────────────────────────────┐
│  Utente Richiesta → Agente Propone Azione → HITL       │
│         ↑                                      ↓         │
│         │                                      │         │
│         │         Feedback Positivo/Negativo  │         │
│         │              ↓                       │         │
│         └──────── Aggiusta Confidence ←───────┘         │
└─────────────────────────────────────────────────────────┘
```

### Metriche di Successo
- **Approval Rate**: % azioni approvate vs proposte
- **Auto-Execution Rate**: % azioni auto-eseguite (high confidence)
- **Precision**: % azioni approvate che erano corrette
- **User Satisfaction**: feedback esplicito utente

---

## 🗄️ Schema Database - Feedback e Memoria

### 1. Tabella AgentActionFeedback

**File:** `backend/prisma/migrations/YYYYMMDDHHMMSS_add_agent_feedback/migration.sql`

```sql
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
    "userRating" INTEGER, -- 1-5 stars
    "executionTimeMs" INTEGER,
    "errorMessage" TEXT,
    "contextSnapshot" JSONB, -- Snapshot del contesto per analisi
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_action_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_action_feedback_tenantId_agentName_idx" ON "agent_action_feedback"("tenantId", "agentName");
CREATE INDEX "agent_action_feedback_userId_actionType_idx" ON "agent_action_feedback"("userId", "actionType");
CREATE INDEX "agent_action_feedback_wasApproved_idx" ON "agent_action_feedback"("wasApproved");
CREATE INDEX "agent_action_feedback_createdAt_idx" ON "agent_action_feedback"("createdAt");
CREATE INDEX "agent_action_feedback_actionId_idx" ON "agent_action_feedback"("actionId");

-- Foreign Key
ALTER TABLE "agent_action_feedback"
ADD CONSTRAINT "agent_action_feedback_actionId_fkey"
FOREIGN KEY ("actionId") REFERENCES "agent_pending_actions"("id") ON DELETE CASCADE;
```

**Schema Prisma:**

```prisma
model AgentActionFeedback {
  id                  String    @id @default(cuid())
  actionId            String
  tenantId            String
  userId              String
  agentName           String
  actionType          String
  wasApproved         Boolean
  wasExecuted         Boolean
  wasSuccessful       Boolean?
  originalConfidence  Float
  adjustedConfidence  Float?
  userFeedback        String?
  userRating          Int?      // 1-5 stars
  executionTimeMs     Int?
  errorMessage        String?
  contextSnapshot     Json?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  action              AgentPendingAction @relation(fields: [actionId], references: [id], onDelete: Cascade)

  @@index([tenantId, agentName])
  @@index([userId, actionType])
  @@index([wasApproved])
  @@index([createdAt])
  @@index([actionId])
  @@map("agent_action_feedback")
}

// Aggiorna anche AgentPendingAction per supportare la relazione
model AgentPendingAction {
  // ... campi esistenti
  feedback            AgentActionFeedback[]
}
```

### 2. Tabella AgentLearningProfile

Profilo di apprendimento per combinazione (tenant, user, agent, actionType):

```sql
-- CreateTable
CREATE TABLE "agent_learning_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,  -- NULL = profilo tenant-wide
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
    "confidenceBoost" DOUBLE PRECISION NOT NULL DEFAULT 0.0, -- Adjustment factor
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_learning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_learning_profiles_unique_idx"
ON "agent_learning_profiles"("tenantId", "userId", "agentName", "actionType");

CREATE INDEX "agent_learning_profiles_tenantId_idx" ON "agent_learning_profiles"("tenantId");
CREATE INDEX "agent_learning_profiles_agentName_actionType_idx" ON "agent_learning_profiles"("agentName", "actionType");
```

**Schema Prisma:**

```prisma
model AgentLearningProfile {
  id                     String    @id @default(cuid())
  tenantId               String
  userId                 String?   // NULL = tenant-wide profile
  agentName              String
  actionType             String
  totalAttempts          Int       @default(0)
  approvedCount          Int       @default(0)
  rejectedCount          Int       @default(0)
  autoExecutedCount      Int       @default(0)
  avgOriginalConfidence  Float     @default(0.5)
  avgAdjustedConfidence  Float     @default(0.5)
  successRate            Float     @default(0.0)
  lastLearningAt         DateTime?
  confidenceBoost        Float     @default(0.0) // -0.3 to +0.3
  metadata               Json?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  @@unique([tenantId, userId, agentName, actionType])
  @@index([tenantId])
  @@index([agentName, actionType])
  @@map("agent_learning_profiles")
}
```

---

## 🧠 FeedbackService - Raccolta e Analisi

**File:** `backend/src/modules/ai/feedback/feedback.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ActionFeedback {
  actionId: string;
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  wasApproved: boolean;
  wasExecuted: boolean;
  wasSuccessful?: boolean;
  originalConfidence: number;
  userFeedback?: string;
  userRating?: number; // 1-5
  executionTimeMs?: number;
  errorMessage?: string;
  contextSnapshot?: Record<string, any>;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra feedback per un'azione
   */
  async recordFeedback(params: ActionFeedback) {
    const feedback = await this.prisma.agentActionFeedback.create({
      data: {
        actionId: params.actionId,
        tenantId: params.tenantId,
        userId: params.userId,
        agentName: params.agentName,
        actionType: params.actionType,
        wasApproved: params.wasApproved,
        wasExecuted: params.wasExecuted,
        wasSuccessful: params.wasSuccessful,
        originalConfidence: params.originalConfidence,
        userFeedback: params.userFeedback,
        userRating: params.userRating,
        executionTimeMs: params.executionTimeMs,
        errorMessage: params.errorMessage,
        contextSnapshot: params.contextSnapshot,
      },
    });

    this.logger.log(
      `Recorded feedback for action ${params.actionId}: approved=${params.wasApproved}, success=${params.wasSuccessful}`,
    );

    // Trigger learning update
    await this.updateLearningProfile(params);

    return feedback;
  }

  /**
   * Aggiorna il profilo di apprendimento
   */
  private async updateLearningProfile(feedback: ActionFeedback) {
    const { tenantId, userId, agentName, actionType } = feedback;

    // 1. Cerca profilo esistente (user-specific)
    let profile = await this.prisma.agentLearningProfile.findUnique({
      where: {
        tenantId_userId_agentName_actionType: {
          tenantId,
          userId,
          agentName,
          actionType,
        },
      },
    });

    // 2. Se non esiste, crealo
    if (!profile) {
      profile = await this.prisma.agentLearningProfile.create({
        data: {
          tenantId,
          userId,
          agentName,
          actionType,
          totalAttempts: 0,
          approvedCount: 0,
          rejectedCount: 0,
          autoExecutedCount: 0,
          avgOriginalConfidence: 0.5,
          avgAdjustedConfidence: 0.5,
          successRate: 0.0,
          confidenceBoost: 0.0,
        },
      });
    }

    // 3. Calcola nuove metriche
    const totalAttempts = profile.totalAttempts + 1;
    const approvedCount = profile.approvedCount + (feedback.wasApproved ? 1 : 0);
    const rejectedCount = profile.rejectedCount + (feedback.wasApproved ? 0 : 1);
    const autoExecutedCount =
      profile.autoExecutedCount + (feedback.wasExecuted && !feedback.wasApproved ? 1 : 0);

    const approvalRate = approvedCount / totalAttempts;
    const successRate = feedback.wasSuccessful
      ? (profile.successRate * profile.totalAttempts + 1) / totalAttempts
      : (profile.successRate * profile.totalAttempts) / totalAttempts;

    // 4. Calcola confidence boost basato su approval rate
    let confidenceBoost = 0.0;
    if (totalAttempts >= 5) {
      // Serve almeno 5 esempi
      if (approvalRate >= 0.9) {
        confidenceBoost = 0.15; // Boost significativo
      } else if (approvalRate >= 0.8) {
        confidenceBoost = 0.1; // Boost moderato
      } else if (approvalRate >= 0.7) {
        confidenceBoost = 0.05; // Boost leggero
      } else if (approvalRate < 0.4) {
        confidenceBoost = -0.15; // Penalty
      } else if (approvalRate < 0.5) {
        confidenceBoost = -0.1; // Penalty moderato
      }
    }

    // 5. Aggiorna profilo
    await this.prisma.agentLearningProfile.update({
      where: { id: profile.id },
      data: {
        totalAttempts,
        approvedCount,
        rejectedCount,
        autoExecutedCount,
        successRate,
        confidenceBoost,
        lastLearningAt: new Date(),
        avgOriginalConfidence:
          (profile.avgOriginalConfidence * profile.totalAttempts + feedback.originalConfidence) /
          totalAttempts,
      },
    });

    this.logger.log(
      `Updated learning profile for ${agentName}/${actionType}: ` +
        `approvalRate=${approvalRate.toFixed(2)}, boost=${confidenceBoost.toFixed(2)}`,
    );
  }

  /**
   * Recupera il confidence boost per un'azione
   */
  async getConfidenceBoost(params: {
    tenantId: string;
    userId: string;
    agentName: string;
    actionType: string;
  }): Promise<number> {
    // 1. Cerca profilo user-specific
    const userProfile = await this.prisma.agentLearningProfile.findUnique({
      where: {
        tenantId_userId_agentName_actionType: {
          tenantId: params.tenantId,
          userId: params.userId,
          agentName: params.agentName,
          actionType: params.actionType,
        },
      },
    });

    if (userProfile && userProfile.totalAttempts >= 3) {
      return userProfile.confidenceBoost;
    }

    // 2. Fallback: profilo tenant-wide
    const tenantProfile = await this.prisma.agentLearningProfile.findUnique({
      where: {
        tenantId_userId_agentName_actionType: {
          tenantId: params.tenantId,
          userId: null,
          agentName: params.agentName,
          actionType: params.actionType,
        },
      },
    });

    if (tenantProfile && tenantProfile.totalAttempts >= 5) {
      return tenantProfile.confidenceBoost * 0.5; // Peso ridotto per tenant-wide
    }

    return 0.0; // Nessun boost
  }

  /**
   * Statistiche feedback per dashboard
   */
  async getFeedbackStats(params: {
    tenantId: string;
    userId?: string;
    agentName?: string;
    actionType?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {
      tenantId: params.tenantId,
      ...(params.userId && { userId: params.userId }),
      ...(params.agentName && { agentName: params.agentName }),
      ...(params.actionType && { actionType: params.actionType }),
      ...(params.startDate &&
        params.endDate && {
          createdAt: {
            gte: params.startDate,
            lte: params.endDate,
          },
        }),
    };

    const [total, approved, executed, successful] = await Promise.all([
      this.prisma.agentActionFeedback.count({ where }),
      this.prisma.agentActionFeedback.count({ where: { ...where, wasApproved: true } }),
      this.prisma.agentActionFeedback.count({ where: { ...where, wasExecuted: true } }),
      this.prisma.agentActionFeedback.count({ where: { ...where, wasSuccessful: true } }),
    ]);

    const approvalRate = total > 0 ? approved / total : 0;
    const executionRate = total > 0 ? executed / total : 0;
    const successRate = executed > 0 ? successful / executed : 0;

    return {
      total,
      approved,
      rejected: total - approved,
      executed,
      successful,
      approvalRate,
      executionRate,
      successRate,
    };
  }

  /**
   * Top agenti per performance
   */
  async getTopPerformingAgents(tenantId: string, limit: number = 10) {
    const profiles = await this.prisma.agentLearningProfile.findMany({
      where: {
        tenantId,
        totalAttempts: { gte: 5 }, // Minimo 5 tentativi
      },
      orderBy: [{ successRate: 'desc' }, { approvedCount: 'desc' }],
      take: limit,
    });

    return profiles.map((p) => ({
      agentName: p.agentName,
      actionType: p.actionType,
      successRate: p.successRate,
      approvalRate: p.approvedCount / p.totalAttempts,
      totalAttempts: p.totalAttempts,
      confidenceBoost: p.confidenceBoost,
    }));
  }
}
```

---

## 🔧 Integrazione nel Flusso Multi-Agent

### 1. Aggiornare AgentAction per includere confidence adjustment

**File:** `backend/src/modules/ai/agents/interfaces/agent-result.interface.ts` (update)

```typescript
export interface AgentAction {
  type: string;
  payload: Record<string, any>;
  confidence: number; // Original confidence
  adjustedConfidence?: number; // Dopo learning boost
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoningSteps?: string;
  learningContext?: {
    // Per tracking
    originalConfidence: number;
    boost: number;
    profileAttempts: number;
  };
}
```

### 2. Modificare MultiAgentService per usare feedback

**File:** `backend/src/modules/ai/multi-agent/multi-agent.service.ts` (update)

```typescript
import { FeedbackService } from '../feedback/feedback.service';

constructor(
  // ... altri servizi
  private readonly feedbackService: FeedbackService,
) {}

async processMessage(params: {
  tenantId: string;
  userId: string;
  sessionId: string;
  message: string;
}): Promise<AgentResult & { pendingActions?: any[] }> {
  // ... logica esistente fino a result

  // Applica confidence boost da learning
  for (const action of result.actions) {
    const boost = await this.feedbackService.getConfidenceBoost({
      tenantId: params.tenantId,
      userId: params.userId,
      agentName: agent.name,
      actionType: action.type,
    });

    action.adjustedConfidence = Math.min(1.0, Math.max(0.0, action.confidence + boost));
    action.learningContext = {
      originalConfidence: action.confidence,
      boost,
      profileAttempts: 0, // TODO: fetch from profile
    };

    this.logger.log(
      `Adjusted confidence for ${action.type}: ${action.confidence.toFixed(2)} → ${action.adjustedConfidence.toFixed(2)} (boost: ${boost.toFixed(2)})`,
    );
  }

  // Gestione HITL con confidence aggiustata
  const pendingActions = [];
  for (const action of result.actions) {
    const confidenceToUse = action.adjustedConfidence ?? action.confidence;

    if (this.hitlService.requiresApprovalWithConfidence(action, confidenceToUse)) {
      const pending = await this.hitlService.createPendingAction({
        sessionId,
        tenantId,
        userId,
        action,
      });
      pendingActions.push(pending);
    } else {
      // Auto-esegui azioni high-confidence
      this.logger.log(`Auto-executing high-confidence action: ${action.type}`);
      await this.autoExecuteAction(action, params);
    }
  }

  return {
    ...result,
    pendingActions,
  };
}

private async autoExecuteAction(
  action: AgentAction,
  context: { tenantId: string; userId: string; sessionId: string },
) {
  try {
    // TODO: implementare esecuzione
    this.logger.log(`Executing action ${action.type}`);

    // Registra feedback positivo
    await this.feedbackService.recordFeedback({
      actionId: 'auto-' + Date.now(), // TODO: creare pending action anche per auto-exec
      tenantId: context.tenantId,
      userId: context.userId,
      agentName: 'MultiAgent',
      actionType: action.type,
      wasApproved: true, // Auto-approved
      wasExecuted: true,
      wasSuccessful: true, // TODO: verificare esito
      originalConfidence: action.confidence,
    });
  } catch (error) {
    this.logger.error(`Auto-execution failed for ${action.type}:`, error);

    // Registra feedback negativo
    await this.feedbackService.recordFeedback({
      actionId: 'auto-' + Date.now(),
      tenantId: context.tenantId,
      userId: context.userId,
      agentName: 'MultiAgent',
      actionType: action.type,
      wasApproved: true,
      wasExecuted: true,
      wasSuccessful: false,
      originalConfidence: action.confidence,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### 3. Aggiornare HitlService per registrare feedback

**File:** `backend/src/modules/ai/hitl/hitl.service.ts` (update)

```typescript
import { FeedbackService } from '../feedback/feedback.service';

constructor(
  private readonly prisma: PrismaService,
  private readonly feedbackService: FeedbackService,
) {}

async approveAction(params: {
  actionId: string;
  tenantId: string;
  userId: string;
  modifiedPayload?: Record<string, any>;
}) {
  // ... logica esistente

  // Registra feedback
  await this.feedbackService.recordFeedback({
    actionId,
    tenantId,
    userId,
    agentName: action.type.split('_')[0], // Es: SEND_EMAIL → SEND
    actionType: action.type,
    wasApproved: true,
    wasExecuted: true,
    wasSuccessful: true, // TODO: verificare dopo esecuzione
    originalConfidence: action.confidence,
  });

  return updatedAction;
}

async rejectAction(params: {
  actionId: string;
  tenantId: string;
  userId: string;
  reason?: string;
}) {
  // ... logica esistente

  // Registra feedback negativo
  await this.feedbackService.recordFeedback({
    actionId,
    tenantId,
    userId,
    agentName: action.type.split('_')[0],
    actionType: action.type,
    wasApproved: false,
    wasExecuted: false,
    wasSuccessful: false,
    originalConfidence: action.confidence,
    userFeedback: reason,
  });

  return updatedAction;
}

/**
 * Determina se richiede approvazione considerando confidence aggiustata
 */
requiresApprovalWithConfidence(action: AgentAction, adjustedConfidence: number): boolean {
  // Soglia dinamica: se confidence >= 0.95, auto-esegui LOW risk
  if (adjustedConfidence >= 0.95 && action.severity === 'LOW') {
    return false;
  }

  // Soglia alta per MEDIUM severity
  if (adjustedConfidence >= 0.92 && action.severity === 'MEDIUM') {
    return false;
  }

  // HIGH severity richiede sempre approvazione
  if (action.severity === 'HIGH') {
    return true;
  }

  // Policy standard
  return shouldRequireApproval(action);
}
```

---

## 📊 FeedbackController - API per Statistiche

**File:** `backend/src/modules/ai/feedback/feedback.controller.ts`

```typescript
import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { FeedbackService } from './feedback.service';

@Controller('ai/feedback')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * GET /ai/feedback/stats - Statistiche feedback
   */
  @Get('stats')
  async getStats(
    @Request() req: AuthenticatedRequest,
    @Query('agentName') agentName?: string,
    @Query('actionType') actionType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const stats = await this.feedbackService.getFeedbackStats({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      agentName,
      actionType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return {
      success: true,
      stats,
    };
  }

  /**
   * GET /ai/feedback/top-agents - Top performing agents
   */
  @Get('top-agents')
  async getTopAgents(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const agents = await this.feedbackService.getTopPerformingAgents(
      req.user.tenantId,
      limit ? parseInt(limit, 10) : 10,
    );

    return {
      success: true,
      agents,
    };
  }

  /**
   * POST /ai/feedback/rate - Rate manual feedback
   */
  @Post('rate')
  async rateAction(
    @Request() req: AuthenticatedRequest,
    @Body() body: { actionId: string; rating: number; feedback?: string },
  ) {
    // Trova l'azione
    const action = await this.feedbackService.recordFeedback({
      actionId: body.actionId,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      agentName: 'UserRated',
      actionType: 'MANUAL_RATING',
      wasApproved: body.rating >= 3,
      wasExecuted: true,
      wasSuccessful: body.rating >= 3,
      originalConfidence: 1.0,
      userRating: body.rating,
      userFeedback: body.feedback,
    });

    return {
      success: true,
      feedback: action,
    };
  }
}
```

---

## 🎨 Dashboard Analytics - Visualizzazione Trend

### Endpoint per dati dashboard

**File:** `backend/src/modules/ai/feedback/feedback.service.ts` (aggiungere)

```typescript
/**
 * Trend confidence nel tempo
 */
async getConfidenceTrend(params: {
  tenantId: string;
  agentName?: string;
  actionType?: string;
  days?: number;
}) {
  const days = params.days || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const feedbacks = await this.prisma.agentActionFeedback.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.agentName && { agentName: params.agentName }),
      ...(params.actionType && { actionType: params.actionType }),
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      createdAt: true,
      originalConfidence: true,
      adjustedConfidence: true,
      wasApproved: true,
    },
  });

  // Raggruppa per giorno
  const trendByDay: Record<string, { date: string; avgConfidence: number; approvalRate: number; count: number }> = {};

  feedbacks.forEach((f) => {
    const dateKey = f.createdAt.toISOString().split('T')[0];
    if (!trendByDay[dateKey]) {
      trendByDay[dateKey] = { date: dateKey, avgConfidence: 0, approvalRate: 0, count: 0 };
    }
    trendByDay[dateKey].avgConfidence += f.adjustedConfidence || f.originalConfidence;
    trendByDay[dateKey].approvalRate += f.wasApproved ? 1 : 0;
    trendByDay[dateKey].count += 1;
  });

  // Calcola medie
  const trend = Object.values(trendByDay).map((day) => ({
    date: day.date,
    avgConfidence: day.avgConfidence / day.count,
    approvalRate: day.approvalRate / day.count,
    count: day.count,
  }));

  return trend;
}

/**
 * Matrice confusione per agent performance
 */
async getConfusionMatrix(params: {
  tenantId: string;
  agentName: string;
  actionType?: string;
}) {
  const feedbacks = await this.prisma.agentActionFeedback.findMany({
    where: {
      tenantId: params.tenantId,
      agentName: params.agentName,
      ...(params.actionType && { actionType: params.actionType }),
    },
    select: {
      wasApproved: true,
      wasSuccessful: true,
      originalConfidence: true,
    },
  });

  const matrix = {
    truePositive: 0, // Alta confidence + approved
    falsePositive: 0, // Alta confidence + rejected
    trueNegative: 0, // Bassa confidence + rejected
    falseNegative: 0, // Bassa confidence + approved
  };

  feedbacks.forEach((f) => {
    const highConfidence = f.originalConfidence >= 0.7;
    if (highConfidence && f.wasApproved) matrix.truePositive++;
    else if (highConfidence && !f.wasApproved) matrix.falsePositive++;
    else if (!highConfidence && !f.wasApproved) matrix.trueNegative++;
    else if (!highConfidence && f.wasApproved) matrix.falseNegative++;
  });

  const total = Object.values(matrix).reduce((a, b) => a + b, 0);
  const precision = matrix.truePositive / (matrix.truePositive + matrix.falsePositive) || 0;
  const recall = matrix.truePositive / (matrix.truePositive + matrix.falseNegative) || 0;
  const f1Score = (2 * precision * recall) / (precision + recall) || 0;

  return {
    matrix,
    metrics: {
      precision,
      recall,
      f1Score,
      accuracy: (matrix.truePositive + matrix.trueNegative) / total || 0,
    },
  };
}
```

---

## 🔄 Processo di Learning Continuo

### Batch Learning Job (opzionale)

Per ricalcolare i profili in batch periodicamente:

**File:** `backend/src/modules/ai/feedback/learning-batch.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class LearningBatchService {
  private readonly logger = new Logger(LearningBatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ricalcola profili learning ogni notte
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async recalculateLearningProfiles() {
    this.logger.log('Starting batch learning recalculation...');

    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    let totalUpdated = 0;

    for (const tenant of tenants) {
      const updated = await this.recalculateForTenant(tenant.id);
      totalUpdated += updated;
    }

    this.logger.log(`Batch learning completed: ${totalUpdated} profiles updated`);
  }

  private async recalculateForTenant(tenantId: string): Promise<number> {
    // TODO: implementare logica di ricalcolo
    // - Ricalcola boost in base a feedback recenti
    // - Decay dei boost vecchi (>30 giorni)
    // - Rimuovi profili con pochi dati (<3 tentativi)
    return 0;
  }
}
```

---

## 🧪 Test del Sistema di Learning

**File:** `backend/src/modules/ai/feedback/feedback.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedbackService, PrismaService],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('recordFeedback', () => {
    it('should create feedback and update learning profile', async () => {
      const feedback = await service.recordFeedback({
        actionId: 'test-action',
        tenantId: 'test-tenant',
        userId: 'test-user',
        agentName: 'EmailAgent',
        actionType: 'SEND_EMAIL',
        wasApproved: true,
        wasExecuted: true,
        wasSuccessful: true,
        originalConfidence: 0.8,
      });

      expect(feedback).toBeDefined();
      expect(feedback.wasApproved).toBe(true);
    });
  });

  describe('getConfidenceBoost', () => {
    it('should return boost for high-performing profile', async () => {
      // Setup: crea profilo con high approval rate
      await prisma.agentLearningProfile.create({
        data: {
          tenantId: 'test-tenant',
          userId: 'test-user',
          agentName: 'EmailAgent',
          actionType: 'SEND_EMAIL',
          totalAttempts: 10,
          approvedCount: 9,
          rejectedCount: 1,
          successRate: 0.9,
          confidenceBoost: 0.15,
        },
      });

      const boost = await service.getConfidenceBoost({
        tenantId: 'test-tenant',
        userId: 'test-user',
        agentName: 'EmailAgent',
        actionType: 'SEND_EMAIL',
      });

      expect(boost).toBe(0.15);
    });
  });
});
```

---

## 📈 Esempio di Evoluzione nel Tempo

### Scenario: EmailAgent Smart Reply

```typescript
// GIORNO 1: Prime 5 azioni
// Confidence iniziale: 0.75, Boost: 0.0
// Risultato: 3 approvate, 2 rifiutate (60% approval)
// → Boost aggiornato: 0.0 (serve più dati)

// GIORNO 3: 10 azioni totali
// Confidence: 0.75, Boost: 0.0
// Risultato: 8 approvate, 2 rifiutate (80% approval)
// → Boost aggiornato: +0.10

// GIORNO 7: 20 azioni totali
// Confidence: 0.75, Boost: +0.10 → Adjusted: 0.85
// Risultato: 18 approvate, 2 rifiutate (90% approval)
// → Boost aggiornato: +0.15

// GIORNO 14: 40 azioni totali
// Confidence: 0.75, Boost: +0.15 → Adjusted: 0.90
// Risultato: 38 approvate (95% approval)
// → Boost aggiornato: +0.20 (max soglia)
// → Ora molte azioni vengono auto-eseguite!
```

---

## 🎯 Checklist Implementazione

### Fase 8: Sistema di Memoria Storica (5-7 giorni)

- [ ] **Schema DB**
  - [ ] Migrazione `AgentActionFeedback`
  - [ ] Migrazione `AgentLearningProfile`
  - [ ] Relazioni foreign keys

- [ ] **FeedbackService**
  - [ ] `recordFeedback()`
  - [ ] `updateLearningProfile()`
  - [ ] `getConfidenceBoost()`
  - [ ] `getFeedbackStats()`
  - [ ] `getTopPerformingAgents()`
  - [ ] `getConfidenceTrend()`
  - [ ] `getConfusionMatrix()`

- [ ] **Integrazione Multi-Agent**
  - [ ] Applicare boost in `MultiAgentService.processMessage()`
  - [ ] Auto-execution per high confidence
  - [ ] Feedback su approve/reject in `HitlService`

- [ ] **FeedbackController**
  - [ ] GET `/ai/feedback/stats`
  - [ ] GET `/ai/feedback/top-agents`
  - [ ] POST `/ai/feedback/rate`
  - [ ] GET `/ai/feedback/trend`

- [ ] **Testing**
  - [ ] Unit test `FeedbackService`
  - [ ] Integration test learning loop
  - [ ] Performance test profili con molti dati

- [ ] **Monitoring**
  - [ ] Dashboard analytics
  - [ ] Alert su performance degradation
  - [ ] Export dati per ML avanzato (futuro)

---

## 🚀 Quick Start

```bash
# 1. Esegui migrazioni
npx prisma migrate dev --name add_agent_feedback
npx prisma migrate dev --name add_agent_learning_profiles
npx prisma generate

# 2. Crea i servizi
mkdir -p backend/src/modules/ai/feedback
touch backend/src/modules/ai/feedback/feedback.service.ts
touch backend/src/modules/ai/feedback/feedback.controller.ts

# 3. Registra nel modulo
# Aggiorna backend/src/modules/ai/ai.module.ts

# 4. Test API
curl -X GET http://localhost:3000/ai/feedback/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 💡 Vantaggi del Sistema

1. **Apprendimento Continuo**: Il sistema migliora automaticamente con l'uso
2. **Personalizzazione**: Ogni utente/tenant ha profili dedicati
3. **Trasparenza**: Tutte le decisioni sono tracciabili
4. **Scalabilità**: Auto-execution riduce il carico HITL nel tempo
5. **Feedback Loop**: Circolo virtuoso confidence → approvazione → boost

---

**Versione:** 1.0
**Integrazione con:** [ROADMAP_MULTIAGENT_DETTAGLIATA.md](./ROADMAP_MULTIAGENT_DETTAGLIATA.md)
**Ultimo aggiornamento:** 2025-11-20

## External References (planning)
- RLHF overview: https://arxiv.org/abs/2203.02155
- Human-in-the-loop patterns: https://aws.amazon.com/what-is/human-in-the-loop/
- Active learning guide: https://modal-python.readthedocs.io/en/latest/content/overview/active_learning.html
- Reward modeling for language: https://arxiv.org/abs/2009.01325
- Metrics for AI systems: https://opentelemetry.io/docs/instrumentation/js/


- Proactive assistant patterns: https://blog.langchain.dev/plan-and-execute-agents/ (plan+execute); https://python.langchain.com/docs/use_cases/agent_simulations/meeting_scheduler (meeting scheduler)
