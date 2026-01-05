# Prisma Schema Audit

**Date**: 2025-01-05
**Total Models**: 52
**Recommended After Cleanup**: 35 models (~33% reduction)

---

## Schema Summary

| Category | Current | After Cleanup | Notes |
|----------|---------|---------------|-------|
| Core | 12 | 12 | Keep all |
| Auth | 5 | 5 | Security critical |
| Email | 6 | 6 | Keep all |
| Calendar | 4 | 4 | Keep all |
| Contacts | 3 | 3 | Keep all |
| AI Agent (Old) | 15 | 3 | **DELETE 12** |
| AI Refactor (New) | 5 | 5 | New models |
| Misc | 2 | 2 | Keep |

---

## BLOAT: Models to DELETE (12 models)

### 1. AgentPendingAction → Replaced by `ActionQueue`
```prisma
// DELETE - Line 941
model AgentPendingAction { ... }
```
**Reason**: ActionQueue does the same thing with better design

### 2. AgentActionFeedback → Merge into `ActionQueue`
```prisma
// DELETE - Line 981
model AgentActionFeedback { ... }
```
**Reason**: ActionQueue has `executionResult`, `rejectedReason` fields

### 3. AgentLearningProfile → Memory bloat
```prisma
// DELETE - Line 1014
model AgentLearningProfile { ... }
```
**Reason**: Over-engineered "learning" that doesn't work. Use UserPreferences.

### 4. PromptTemplate → Use config file
```prisma
// DELETE - Line 1043
model PromptTemplate { ... }
```
**Reason**: Prompts should be code, not database. Version control prompts in codebase.

### 5. LlmUsageLog → Merge into `EmailAnalysis`
```prisma
// DELETE - Line 1077
model LlmUsageLog { ... }
```
**Reason**: EmailAnalysis has `tokensUsed`, `latencyMs`, `modelUsed`

### 6. UserProfileEmbedding → Memory bloat
```prisma
// DELETE - Line 1120
model UserProfileEmbedding { ... }
```
**Reason**: User profiles should be in UserPreferences, not embeddings

### 7. MemoryChangeLog → Memory bloat
```prisma
// DELETE - Line 1159
model MemoryChangeLog { ... }
```
**Reason**: Audit logs already exist. This is redundant memory tracking.

### 8. ProceduralPattern → Memory bloat
```prisma
// DELETE - Line 1178
model ProceduralPattern { ... }
```
**Reason**: "AI learns patterns" = over-engineering. Static rules work better.

### 9. VoltAgentConversation → Agent bloat
```prisma
// DELETE - Line 1267
model VoltAgentConversation { ... }
```
**Reason**: Don't persist agent conversations. Each email = 1 LLM call.

### 10. VoltAgentMessage → Agent bloat
```prisma
// DELETE - Line 1300
model VoltAgentMessage { ... }
```
**Reason**: Same as above. No multi-turn agent conversations needed.

### 11. ConversationSummary → Memory bloat
```prisma
// DELETE - Line 1337
model ConversationSummary { ... }
```
**Reason**: Part of complex memory system. Not needed.

### 12. AiDeadline → Merge into `EmailAnalysis`
```prisma
// DELETE - Line 1527
model AiDeadline { ... }
```
**Reason**: EmailAnalysis has `hasDeadline`, `deadlineDate` fields

---

## MERGE: Models to Consolidate (2 merges)

### 1. AiTask + AiTaskReminder → `ActionQueue`

**Current (2 models)**:
```prisma
model AiTask { ... }           // Line 1376
model AiTaskReminder { ... }   // Line 1432
```

**Action**: Migrate data to `ActionQueue`, then delete.

`ActionQueue` already has:
- `actionType` (can be `CREATE_TASK`)
- `actionPayload` (can store reminder date)
- `status`, `executedAt`, `expiresAt`

### 2. DashboardPreference → Could merge into `UserPreferences`

**Current**:
```prisma
model DashboardPreference {    // Line 123
  layout Json
}
```

**Recommendation**: Keep separate for now (layout is complex JSON)

---

## KEEP: Core Models (35 total)

### Core Business (12)
| Model | Lines | Purpose |
|-------|-------|---------|
| Tenant | 9-38 | Multi-tenancy |
| User | 40-76 | User accounts |
| UserPreferences | 78-121 | AI & UI settings |
| ProviderConfig | 267-330 | OAuth providers |
| Email | 332-414 | Email storage |
| EmailAttachment | 533-549 | Attachments |
| Folder | 445-490 | Email folders |
| Contact | 719-797 | Unified contacts |
| ProviderContact | 799-854 | Provider contacts |
| CalendarEvent | 595-639 | Calendar events |
| CalendarPreference | 663-684 | Calendar settings |
| Embedding | 574-593 | RAG vectors |

### Auth (5)
| Model | Purpose |
|-------|---------|
| Session | Login sessions |
| MfaSecret | TOTP secrets |
| MfaBackupCode | Recovery codes |
| TrustedDevice | Remember me |
| WebAuthnCredential | Passkeys |

### Email Features (6)
| Model | Purpose |
|-------|---------|
| EmailLabel | Custom labels |
| UserLabel | Label definitions |
| EmailCrossProviderLink | Multi-provider threading |
| ScheduledEmail | Send later |
| EmailFollowUp | CRM follow-ups |
| ContactInteraction | CRM interactions |

### AI Refactor v2.0 (5) - NEW
| Model | Purpose |
|-------|---------|
| EmailAnalysis | Unified classifier output |
| ActionQueue | HITL action queue |
| Deal | CRM deals |
| DealActivity | Deal history |
| Subscription | Billing |

### Misc (7)
| Model | Purpose |
|-------|---------|
| DashboardPreference | Widget layout |
| CalendarEventAttachment | Calendar attachments |
| CalendarSyncState | Sync state |
| AuditLog | Compliance |
| JobQueue | Background jobs |
| WebhookSubscription | Webhooks |
| HealthCheck | System health |

### Optional Keep (3)
| Model | Purpose | Decision |
|-------|---------|----------|
| WritingStyleProfile | Style matching | KEEP if smart-reply used |
| DocumentLibrary | Knowledge base | KEEP if RAG used |
| LibraryDocument | KB documents | KEEP if RAG used |

---

## Migration Script

```typescript
// scripts/migrate-ai-models.ts

async function migrateAiModels() {
  // 1. Migrate AgentPendingAction → ActionQueue
  const pendingActions = await prisma.agentPendingAction.findMany();
  for (const action of pendingActions) {
    await prisma.actionQueue.create({
      data: {
        tenantId: action.tenantId,
        userId: action.userId,
        emailId: action.emailId,
        actionType: mapActionType(action.actionType),
        actionPayload: action.actionPayload,
        confidence: action.confidence,
        status: mapStatus(action.status),
        createdAt: action.createdAt,
      },
    });
  }

  // 2. Migrate AiTask → ActionQueue
  const tasks = await prisma.aiTask.findMany();
  for (const task of tasks) {
    await prisma.actionQueue.create({
      data: {
        tenantId: task.tenantId,
        userId: task.userId,
        emailId: task.emailId,
        actionType: 'CREATE_TASK',
        actionPayload: { title: task.title, dueDate: task.dueDate },
        confidence: task.confidence || 0,
        status: task.status === 'completed' ? 'EXECUTED' : 'PENDING_APPROVAL',
        createdAt: task.createdAt,
      },
    });
  }

  // 3. Migrate AiDeadline → EmailAnalysis
  const deadlines = await prisma.aiDeadline.findMany();
  for (const deadline of deadlines) {
    await prisma.emailAnalysis.upsert({
      where: { emailId: deadline.emailId },
      create: {
        emailId: deadline.emailId,
        tenantId: deadline.tenantId,
        hasDeadline: true,
        deadlineDate: deadline.deadlineDate,
        priority: 'HIGH',
        category: 'OTHER',
        sentiment: 'NEUTRAL',
      },
      update: {
        hasDeadline: true,
        deadlineDate: deadline.deadlineDate,
      },
    });
  }

  console.log('Migration complete');
}
```

---

## Cleanup Prisma Migration

After migration script runs:

```bash
# Create migration to delete bloat tables
npx prisma migrate dev --name remove-ai-bloat
```

Migration SQL:
```sql
-- Drop old AI agent tables
DROP TABLE IF EXISTS "agent_pending_actions" CASCADE;
DROP TABLE IF EXISTS "agent_action_feedback" CASCADE;
DROP TABLE IF EXISTS "agent_learning_profiles" CASCADE;
DROP TABLE IF EXISTS "prompt_templates" CASCADE;
DROP TABLE IF EXISTS "llm_usage_logs" CASCADE;
DROP TABLE IF EXISTS "user_profile_embeddings" CASCADE;
DROP TABLE IF EXISTS "memory_change_logs" CASCADE;
DROP TABLE IF EXISTS "procedural_patterns" CASCADE;
DROP TABLE IF EXISTS "volt_agent_conversations" CASCADE;
DROP TABLE IF EXISTS "volt_agent_messages" CASCADE;
DROP TABLE IF EXISTS "conversation_summaries" CASCADE;
DROP TABLE IF EXISTS "ai_deadlines" CASCADE;
DROP TABLE IF EXISTS "ai_tasks" CASCADE;
DROP TABLE IF EXISTS "ai_task_reminders" CASCADE;
```

---

## LLM-Friendly Schema Organization

For easier LLM navigation, reorganize schema by domain:

```prisma
// ========================================
// SECTION 1: MULTI-TENANCY
// ========================================
model Tenant { ... }

// ========================================
// SECTION 2: USERS & AUTH
// ========================================
model User { ... }
model UserPreferences { ... }
model Session { ... }
model MfaSecret { ... }
model MfaBackupCode { ... }
model TrustedDevice { ... }
model WebAuthnCredential { ... }
model PasswordResetToken { ... }

// ========================================
// SECTION 3: EMAIL PROVIDERS
// ========================================
model ProviderConfig { ... }

// ========================================
// SECTION 4: EMAILS
// ========================================
model Email { ... }
model EmailAttachment { ... }
model Folder { ... }
model EmailLabel { ... }
model UserLabel { ... }
model EmailCrossProviderLink { ... }
model ScheduledEmail { ... }
model Embedding { ... }

// ========================================
// SECTION 5: CONTACTS & CRM
// ========================================
model Contact { ... }
model ProviderContact { ... }
model ContactInteraction { ... }
model Deal { ... }
model DealActivity { ... }

// ========================================
// SECTION 6: CALENDAR
// ========================================
model CalendarEvent { ... }
model CalendarEventAttachment { ... }
model CalendarPreference { ... }
model CalendarSyncState { ... }

// ========================================
// SECTION 7: AI CLASSIFICATION
// ========================================
model EmailAnalysis { ... }
model EmailFollowUp { ... }
model ActionQueue { ... }
model WritingStyleProfile { ... }

// ========================================
// SECTION 8: BILLING
// ========================================
model Subscription { ... }

// ========================================
// SECTION 9: SYSTEM
// ========================================
model AuditLog { ... }
model JobQueue { ... }
model WebhookSubscription { ... }
model HealthCheck { ... }
model DashboardPreference { ... }

// ========================================
// SECTION 10: KNOWLEDGE BASE (Optional)
// ========================================
model DocumentLibrary { ... }
model LibraryDocument { ... }
```

---

## Summary

| Action | Models | Impact |
|--------|--------|--------|
| DELETE | 12 | -3,500 lines of code |
| MERGE | 2 → 0 | Simpler architecture |
| KEEP | 35 | Clean, focused schema |
| NEW | 5 | AI Refactor v2.0 |

**Total reduction**: 52 → 40 models (23% reduction)
