# Architecture Research: AI Rebuild (v3.2)

**Project:** MailAgent
**Researched:** 2026-02-27
**Confidence:** HIGH (codebase verified + official AI SDK docs + assistant-ui docs)

---

## Executive Summary

This document defines the architecture for rebuilding MailAgent's AI layer: dropping `@voltagent/core` in favor of raw AI SDK v6, consolidating 45+ services to ~20, reducing 65+ tools to ~30, and redesigning the chat frontend with `assistant-ui`. The existing system works but carries significant framework overhead (VoltAgent wraps AI SDK, adding an abstraction that provides little value for our single-agent architecture) and accumulated complexity (5 follow-up services, 4 chat pipeline services, duplicate tool definitions).

**Key architectural decisions:**

1. **Backend:** Replace `@voltagent/core` Agent + createTool with AI SDK v6 `streamText` + `tool()` directly in NestJS `@Injectable()` services. Tools get DI access natively via closures.
2. **Frontend:** Replace custom MUI chat components with `assistant-ui` components, bridging via `useChatRuntime` + `AssistantChatTransport` pointing at custom NestJS endpoint.
3. **Non-chat AI:** Replace agent loops with `generateText({ output: Output.object() })` for briefing, follow-up generation, triage -- direct LLM calls with pre-fetched data.
4. **Service consolidation:** Merge by domain affinity, move CRM/calendar/scheduling services out of AI module to their domain modules.
5. **Tool consolidation:** Eliminate duplicates (manage_email x2, bulk_email_actions x2), merge overlapping tools (search_emails + semantic_search_emails), keep ~25 unique tools.

---

## 1. Current Architecture (What Exists)

### Chat Pipeline (6 hops)

```
VoltAgentController.streamChatV3()
  -> VoltAgentService.createStreamContext()
    -> ChatPrepareService.prepare()
      -> ChatRequestProcessorService.process()  [PII, rate limit, model routing]
      -> ChatContextBuilderService.build()        [memory, episodic lessons]
      -> AgentPoolService.getOrCreateAgent()      [creates VoltAgent Agent]
    -> agent.streamText()                          [@voltagent/core wraps AI SDK]
  -> streamResult.toUIMessageStream()
  -> PII transform + SSE to response
```

### Agent Architecture

- `UnifiedAgent` (single agent, intent-based tool loading)
- `AgentPoolService` creates agents on every request (stateless, Redis metadata cache)
- `createUnifiedAgent()` builds `new Agent()` from `@voltagent/core` with dynamic tools
- Tools created via factory functions: `createEmailTools(prisma, emailSendService, locale, tenantId, ...)`

### Tool Architecture

29 tools across 15 files using `createTool()` from `@voltagent/core`:
- Factory functions receive NestJS services as parameters (not via DI)
- Each tool factory returns `Tool[]` (VoltAgent type)
- Tool groups loaded by intent via `getToolGroupsForIntent()`
- **Duplicates found:** `manage_email` in email.tools.ts AND email-write.tools.ts, `bulk_email_actions` same

### Service Count (VoltAgent module)

- **39 services** in `voltagent/services/`
- **6 executors** in `voltagent/services/executors/`
- **24 AI services** in `ai/services/`
- **10 controllers** in `voltagent/controllers/`
- **Total providers in module:** 55+

### Frontend Chat

- `useVoltAgentChat` hook wraps AI SDK v6 `useChat` + `DefaultChatTransport`
- Custom MUI components: ChatArea, ChatInput, ChatMessages, DesktopLayout, MobileLayout
- 45+ files in `frontend/components/ai/`
- `@assistant-ui/react@0.12.9` already installed but unused
- `ai@6.0.77` installed on both frontend and backend

---

## 2. Target Architecture (What We Build)

### 2.1 Backend: NestJS + AI SDK v6 (No VoltAgent)

**Core Pattern: Tools as closures inside @Injectable services.**

The critical insight is that AI SDK v6 `tool()` is just a function that returns an object. You define tools inline where NestJS DI services are in scope. No factory functions needed, no parameter threading.

```typescript
// NEW: tools/email.tools.ts
import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';
import { CacheService } from '@/common/services/cache.service';

@Injectable()
export class EmailToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Returns tools scoped to a tenant */
  getTools(tenantId: string, userId: string) {
    return {
      list_emails: tool({
        description: 'List emails from inbox with filters',
        inputSchema: z.object({
          folder: z.string().optional(),
          limit: z.number().default(20),
          unreadOnly: z.boolean().default(false),
        }),
        execute: async ({ folder, limit, unreadOnly }) => {
          // Direct access to this.prisma via closure -- no parameter threading
          return this.prisma.email.findMany({
            where: { tenantId, ...(unreadOnly && { isRead: false }) },
            take: limit,
            orderBy: { receivedAt: 'desc' },
          });
        },
      }),

      manage_email: tool({
        description: 'Send, reply, forward, archive, delete, or move an email',
        inputSchema: z.object({
          action: z.enum(['send', 'reply', 'forward', 'archive', 'delete', 'move', 'star', 'mark_read']),
          emailId: z.string().optional(),
          to: z.array(z.string()).optional(),
          subject: z.string().optional(),
          body: z.string().optional(),
          folderId: z.string().optional(),
        }),
        execute: async (args) => {
          // Dispatch to appropriate service method
          // this.emailSendService, this.prisma, etc. all available via closure
        },
      }),
    };
  }
}
```

**Chat Service (replaces VoltAgentService + ChatPrepare + ChatContextBuilder + AgentPool):**

```typescript
// NEW: ai-chat.service.ts
@Injectable()
export class AiChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTools: EmailToolsService,
    private readonly calendarTools: CalendarToolsService,
    private readonly contactTools: ContactToolsService,
    private readonly memoryTools: MemoryToolsService,
    private readonly chatContext: ChatContextService,
    private readonly pii: PiiService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async streamChat(message: string, options: ChatOptions) {
    // 1. Pre-process (PII, rate limit -- kept, just simplified)
    const processed = await this.pii.process(message, options.sessionId);
    await this.rateLimiter.check(options.tenantId);

    // 2. Build context (memory, episodic -- kept)
    const context = await this.chatContext.build(processed.message, options);

    // 3. Get tools for this request (replaces AgentPool + UnifiedAgent)
    const tools = {
      ...this.emailTools.getTools(options.tenantId, options.userId),
      ...this.calendarTools.getTools(options.tenantId, options.userId),
      ...this.contactTools.getTools(options.tenantId, options.userId),
      ...this.memoryTools.getTools(options.tenantId, options.userId),
    };

    // 4. streamText directly -- no VoltAgent Agent wrapper
    const result = streamText({
      model: this.getModel(options.model),
      system: this.buildSystemPrompt(context, options),
      messages: context.history,
      tools,
      maxSteps: 8,
    });

    return result;
  }
}
```

**Controller (simplified):**

```typescript
@Controller('api/v1/ai')
export class AiChatController {
  constructor(private readonly chatService: AiChatService) {}

  @Post('chat/stream')
  async stream(@Req() req, @Res() res: Response, @Body() body: ChatDto) {
    const result = await this.chatService.streamChat(body.message, {
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      conversationId: body.conversationId,
      locale: body.locale,
      viewContext: body.viewContext,
    });

    // AI SDK v6 native streaming to Express response
    result.pipeUIMessageStreamToResponse(res, {
      sendReasoning: false,
    });
  }
}
```

**Non-chat AI (briefing, follow-ups, triage):**

```typescript
// NEW: daily-briefing.service.ts (simplified)
@Injectable()
export class DailyBriefingService {
  async generate(tenantId: string, userId: string) {
    // 1. Pre-fetch all data (no tools needed -- direct queries)
    const [emails, followUps, events] = await Promise.all([
      this.prisma.email.findMany({ where: { tenantId, isRead: false }, take: 50 }),
      this.prisma.emailFollowUp.findMany({ where: { tenantId, status: 'PENDING' } }),
      this.calendarService.getEventsForToday(tenantId, userId),
    ]);

    // 2. Single LLM call with structured output (replaces agent loop)
    const result = await generateText({
      model: mistral('mistral-small-latest'),
      system: 'Generate a daily briefing summary...',
      prompt: `Emails: ${JSON.stringify(emails)}\nFollow-ups: ${JSON.stringify(followUps)}\nEvents: ${JSON.stringify(events)}`,
      output: Output.object({
        schema: z.object({
          summary: z.string(),
          highlights: z.array(z.string()),
          urgent: z.array(z.string()),
          stats: z.object({ totalUnread: z.number(), requiresResponse: z.number() }),
        }),
      }),
    });

    return result.output;
  }
}
```

**NOTE on generateObject deprecation:** AI SDK v6 deprecates `generateObject()`. Use `generateText({ output: Output.object({ schema }) })` instead. This also allows combining structured output with tool calling in the same call.

### 2.2 Frontend: assistant-ui + AI SDK v6

**Current state:** `@assistant-ui/react@0.12.9` is already installed. It is NOT currently used -- the chat UI is custom MUI components using `useChat` from `@ai-sdk/react` directly.

**Target:** Replace custom chat components with `assistant-ui` primitives, keeping the existing NestJS backend endpoint.

**Integration approach: `useChatRuntime` + `AssistantChatTransport`**

This is the recommended pattern for connecting assistant-ui to a custom backend. It wraps AI SDK v6's `useChat` internally but provides the assistant-ui component tree (Thread, ThreadList, ThreadMessages, etc.).

```typescript
// NEW: app/ai/AiChatRuntime.tsx
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';

export function AiChatRuntime({ children }: { children: ReactNode }) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${API_BASE_URL}/api/v1/ai/chat/stream`,
      headers: () => ({
        Authorization: `Bearer ${getAuthToken()}`,
        'X-CSRF-Token': getCsrfToken(),
      }),
      credentials: 'include',
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**Requires adding:** `@assistant-ui/react-ai-sdk` package (not currently installed).

**Pages Router compatibility:** assistant-ui components use `'use client'` directive but work in Pages Router via dynamic imports with `ssr: false`. The runtime provider wraps the chat section, not the entire app.

```typescript
// pages/dashboard/ai/index.tsx (Pages Router)
import dynamic from 'next/dynamic';

const AiChatPage = dynamic(() => import('@/components/ai/AiChatPage'), {
  ssr: false,
});

export default function AiDashboardPage() {
  return <AiChatPage />;
}
```

**Existing shadcn/ui compatibility:** assistant-ui is BUILT ON shadcn/ui + Tailwind CSS. It uses the same `cn()` utility, same CSS variables, same Radix primitives. The existing shadcn setup (`frontend/components/ui/`) is fully compatible. You can override assistant-ui styles via the same Tailwind theme.

**What replaces what:**

| Current (Custom MUI) | New (assistant-ui) |
|---|---|
| `ChatArea.tsx` | `<Thread>` component |
| `ChatMessages.tsx` | `<ThreadMessages>` |
| `ChatInput.tsx` | `<Composer>` |
| `TypingIndicator.tsx` | Built-in streaming indicator |
| `AskUserModal.tsx` | Custom tool renderer via `makeAssistantToolUI` |
| `InlineActionCard.tsx` | `makeAssistantToolUI` for HITL tools |
| `DesktopLayout.tsx` | Custom layout wrapping `<Thread>` |
| `MobileLayout.tsx` | Same `<Thread>` with responsive CSS |
| `ChatSessionList.tsx` | `<ThreadList>` (multi-thread support built-in) |
| `useChatController.ts` | Replaced by runtime internals |
| `use-voltagent-chat.ts` | Replaced by `useChatRuntime` |

### 2.3 Conversation Memory (Replacing VoltAgent Memory)

**Current:** `@voltagent/postgres` `PostgreSQLMemoryAdapter` stores conversation history.

**Target:** Prisma-based conversation storage. The existing `Conversation` and `Message` tables in Prisma schema already exist (created by VoltAgent postgres adapter). We keep the tables, replace the adapter with direct Prisma queries.

```typescript
@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(conversationId: string, limit = 20): Promise<CoreMessage[]> {
    const messages = await this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return messages.reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  async saveMessage(conversationId: string, message: CoreMessage) {
    await this.prisma.agentMessage.create({
      data: { conversationId, role: message.role, content: JSON.stringify(message.content) },
    });
  }
}
```

---

## 3. Service Consolidation Plan

### Services to KEEP (core AI functionality)

| Service | Reason | Changes |
|---|---|---|
| `AiChatService` (NEW) | Replaces VoltAgentService + ChatPrepare + AgentPool | Merge 4 services into 1 |
| `ChatContextService` (renamed) | Context builder -- memory + episodic injection | Rename from ChatContextBuilderService |
| `ChatRequestProcessorService` | PII + rate limit + validation | Keep as-is, remove model routing (unnecessary without multi-agent) |
| `DailyBriefingService` | Daily briefing generation | Simplify: remove agent loop, use generateText directly |
| `FollowUpService` | Follow-up tracking orchestration | Keep as facade |
| `FollowUpCrudService` | Follow-up CRUD | Keep |
| `AIMemoryService` | User memory CRUD | Keep |
| `EpisodicMemoryService` | Rejection learning | Keep |
| `MemoryIntelligenceService` | Semantic memory search | Keep |
| `ConversationManagementService` | Conversation CRUD | Simplify: drop VoltAgent memory dependency |
| `WritingStyleService` | Writing style learning | Keep |
| `HitlService` | Human-in-the-loop approval | Keep |
| `ActionExecutorService` | Action execution dispatch | Keep |
| `DraftGenerationService` | AI draft generation | Simplify: use generateText |
| `LearningService` | Feedback learning | Keep |
| `SuggestedPromptsService` | Context-aware prompts | Keep |
| `RateLimiterService` | Rate limiting | Keep |

### Services to MERGE

| From | Into | Rationale |
|---|---|---|
| `VoltAgentService` | `AiChatService` (new) | Core chat orchestration |
| `ChatPrepareService` | `AiChatService` | Was just a dedup helper |
| `AgentPoolService` | DELETE | No agents to pool |
| `AgentMetricsService` | `AiChatService` (inline metrics) | Simple histogram, not a service |
| `FollowUpQueueService` | `FollowUpService` | Queue is implementation detail |
| `FollowUpScannerService` | `FollowUpService` | Scanner is implementation detail |
| `FollowUpExtractionService` | `FollowUpService` | Extraction is implementation detail |
| `ConversationAtomicityService` | `ConversationManagementService` | Atomicity is part of conversation management |
| `DraftFeedbackService` | `DraftGenerationService` | Feedback is part of draft generation |

### Services to MOVE (out of AI module)

| Service | Move to | Rationale |
|---|---|---|
| `RelationshipIntelligenceService` | `contacts/` module | CRM is a contacts concern |
| `RelationshipScoringService` | `contacts/` module | Scoring is a contacts concern |
| `AttentionScoreService` | `contacts/` module | Contact prioritization |
| `CalendarConflictService` | `calendar/` module | Calendar concern |
| `FocusTimeService` | `calendar/` module | Calendar concern |
| `MeetingPrepService` | `calendar/` module | Calendar concern |
| `AnalyticsService` | `email/` module or new `analytics/` module | Email analytics |
| `DocumentLibraryService` | New `documents/` module | Separate domain |

### Services to DELETE

| Service | Reason |
|---|---|
| `AgentPoolService` | No VoltAgent agents to pool |
| `AgentMetricsService` | Replace with inline Prometheus counters |
| `TaskComplexityClassifierService` | Model routing unnecessary with single model strategy |
| `NlpIntentClassifierService` | Intent classification moves to simpler pattern matching in tools selection |
| `ApprovalWorkflowService` | Simplify: inline in HitlService |
| `MistralBatchService` | Unused/legacy |
| `AiQueueService` | Replace with direct BullMQ in services that need it |
| `UnifiedKnowledgeService` | Merge into RAG retriever |

### Executors to INLINE

All 6 executors (`email-executor.ts`, `calendar-executor.ts`, `contact-executor.ts`, `folder-executor.ts`, `bulk-email-executor.ts`, `bulk-label-executor.ts`) are thin dispatchers that should be inlined into tool `execute` functions or into ActionExecutorService.

### Service count after consolidation

- **Before:** 39 voltagent services + 6 executors + 24 AI services = 69 total
- **After:** ~17 voltagent services + 0 executors + ~20 AI services = ~37 total
- **Net reduction:** ~32 services eliminated or moved

---

## 4. Tool Consolidation Plan

### Current Tools (29 via createTool)

| Tool | File | Group |
|---|---|---|
| `list_emails` | email.tools.ts | email |
| `manage_email` | email.tools.ts | email |
| `search_emails` | email.tools.ts | email |
| `count_emails` | email.tools.ts | email |
| `bulk_email_actions` | email.tools.ts | email |
| `manage_email` (DUPE) | email-write.tools.ts | email |
| `bulk_email_actions` (DUPE) | email-write.tools.ts | email |
| `list_email_index` | email-rlm.tools.ts | email |
| `get_email_content` | email-rlm.tools.ts | email |
| `list_follow_ups` | email-rlm.tools.ts | email |
| `get_events` | calendar.tools.ts | calendar |
| `manage_event` | calendar.tools.ts | calendar |
| `search_contacts` | contacts.tools.ts | contacts |
| `manage_contact` | contacts.tools.ts | contacts |
| `list_folders` | folder.tools.ts | folders |
| `manage_folder` | folder.tools.ts | folders |
| `compose_reply` | insights.tools.ts | insights |
| `analyze_email` | insights.tools.ts | insights |
| `semantic_search_emails` | insights.tools.ts | insights |
| `web_search` | web-search.tools.ts | websearch |
| `analyze_data` | analytics.tools.ts | analytics |
| `manage_document_library` | document-library.tools.ts | documents |
| `get_daily_briefing` | briefing.tools.ts | briefing |
| `get_relationship_stats` | crm.tools.ts | crm |
| `search_memory` | memory.tools.ts | memory |
| `store_memory` | memory.tools.ts | memory |
| `list_email_attachments` | attachment.tools.ts | attachments |
| `get_attachment_content` | attachment.tools.ts | attachments |
| `ask_user_clarification` | ask-user.tool.ts | core |

### Consolidation Actions

| Action | Tools | Result |
|---|---|---|
| **DELETE duplicates** | `manage_email` (email-write), `bulk_email_actions` (email-write) | -2 |
| **MERGE** search | `search_emails` + `semantic_search_emails` -> `search_emails` (hybrid) | -1 |
| **MERGE** email index | `list_email_index` + `list_emails` -> `list_emails` (with index mode) | -1 |
| **DELETE** count_emails | Rarely used, list_emails returns count | -1 |
| **MERGE** attachments | `list_email_attachments` + `get_attachment_content` -> `manage_attachments` | -1 |
| **DELETE** analyze_data | Overlaps with analyze_email; low usage | -1 |
| **DELETE** manage_document_library | Feature not fully implemented | -1 |

### Target Tools (~22)

| Tool | Service | Purpose |
|---|---|---|
| `list_emails` | EmailToolsService | List/filter/search emails (hybrid RAG) |
| `get_email_content` | EmailToolsService | Get full email body |
| `manage_email` | EmailToolsService | Send/reply/forward/archive/delete/move/star |
| `bulk_email_actions` | EmailToolsService | Bulk operations on multiple emails |
| `list_follow_ups` | EmailToolsService | Get pending follow-ups |
| `manage_attachments` | EmailToolsService | List + get attachment content |
| `get_events` | CalendarToolsService | List calendar events |
| `manage_event` | CalendarToolsService | Create/update/delete events |
| `search_contacts` | ContactToolsService | Search contacts |
| `manage_contact` | ContactToolsService | Create/update/delete contacts |
| `list_folders` | FolderToolsService | List email folders |
| `manage_folder` | FolderToolsService | Create/rename/delete folders |
| `compose_reply` | InsightToolsService | AI-powered reply composition |
| `analyze_email` | InsightToolsService | Email analysis/summary |
| `web_search` | WebSearchToolsService | Web search via Mistral |
| `get_daily_briefing` | BriefingToolsService | Daily briefing |
| `get_relationship_stats` | CrmToolsService | CRM relationship data |
| `search_memory` | MemoryToolsService | Search user memories |
| `store_memory` | MemoryToolsService | Store user memory |
| `ask_user_clarification` | CoreToolsService | Request user input |

**Intent-based loading preserved:** Tool groups still loaded by intent. The `getToolsForIntent()` pattern moves from the UnifiedAgent prompt file to the AiChatService.

---

## 5. Component Boundaries

### Backend Module Structure (After)

```
backend/src/modules/ai/
  ai.module.ts                    # Root AI module
  ai-chat.controller.ts           # Chat streaming endpoint
  ai-chat.service.ts              # Chat orchestration (replaces VoltAgent)

  services/
    chat-context.service.ts        # Memory + episodic context builder
    chat-request-processor.service.ts  # PII + rate limit
    conversation.service.ts        # Conversation CRUD (Prisma-based)
    daily-briefing.service.ts      # Briefing generation (generateText)
    follow-up.service.ts           # Follow-up orchestration
    follow-up-crud.service.ts      # Follow-up CRUD
    ai-memory.service.ts           # User memory CRUD
    episodic-memory.service.ts     # Rejection learning
    memory-intelligence.service.ts # Semantic memory search
    hitl.service.ts                # Human-in-the-loop
    action-executor.service.ts     # Action dispatch
    draft-generation.service.ts    # AI draft (generateText)
    writing-style.service.ts       # Writing style
    learning.service.ts            # Feedback learning
    suggested-prompts.service.ts   # Context prompts
    rate-limiter.service.ts        # Rate limiting

  tools/                           # @Injectable tool services
    email-tools.service.ts
    calendar-tools.service.ts
    contact-tools.service.ts
    folder-tools.service.ts
    insight-tools.service.ts
    web-search-tools.service.ts
    memory-tools.service.ts
    briefing-tools.service.ts
    crm-tools.service.ts
    core-tools.service.ts          # ask_user, etc.

  rag/
    unified-retriever.ts           # RRF fusion search
    vector-search.service.ts
    keyword-search.service.ts
    query-analyzer.service.ts

  prompts/
    system.prompt.ts               # System prompt builder
    intent.ts                      # Intent detection + tool group mapping

  guards/
    pii-detection.service.ts
    pii-resolution.service.ts
    prompt-guard.service.ts
```

### Frontend Component Structure (After)

```
frontend/components/ai/
  AiChatRuntime.tsx               # AssistantRuntimeProvider wrapper
  AiChatPage.tsx                  # Main page component

  thread/                          # assistant-ui Thread customizations
    Thread.tsx                     # Customized Thread with theme
    ThreadMessages.tsx             # Custom message renderer
    Composer.tsx                   # Custom input with mentions

  tool-renderers/                  # makeAssistantToolUI components
    EmailToolRenderer.tsx
    CalendarToolRenderer.tsx
    ContactToolRenderer.tsx
    HitlActionRenderer.tsx
    AskUserRenderer.tsx
    FallbackRenderer.tsx
    index.ts                       # Registry

  widgets/                         # Sidebar widgets
    ChatSessionList.tsx            # ThreadList customization
    QuickActions.tsx
    SuggestedQuestions.tsx

  layouts/
    DesktopLayout.tsx              # Grid with Thread + sidebar
    MobileLayout.tsx               # FAB + dialog
```

### Data Flow (After)

```
Frontend                          Backend
--------                          -------
useChatRuntime                    AiChatController
  -> AssistantChatTransport         -> AiChatService.streamChat()
    -> POST /api/v1/ai/chat/stream     -> ChatRequestProcessor (PII, rate limit)
                                       -> ChatContextService (memory, episodic)
                                       -> streamText({ tools, messages })
    <- pipeUIMessageStreamToResponse      -> tool execution via closures
  <- UIMessageStream                     -> response streaming
<- Thread renders messages
```

---

## 6. Migration Order

### Phase 1: Foundation (Zero breakage)

**Create new services alongside old ones. No existing code touched.**

1. Create `EmailToolsService`, `CalendarToolsService`, etc. with `tool()` definitions
2. Create `AiChatService` with `streamText()` call
3. Create new controller endpoint `POST /api/v1/ai/chat/stream` (v4, alongside existing v3)
4. Create `ConversationService` with Prisma-based history

**Test:** New endpoint works end-to-end with a simple tool call.

### Phase 2: Backend Switchover

**Wire new services into the module. Old services still exist but new endpoint is primary.**

1. Register all new tool services in AI module
2. Wire AiChatService with all tool services
3. Port chat context building (memory, episodic) to new ChatContextService
4. Port PII/rate-limit to new pipeline
5. Update frontend to point at new endpoint

**Test:** Full chat flow works through new pipeline. Old endpoint still works.

### Phase 3: Non-Chat AI Migration

**Replace agent loops with generateText for non-chat features.**

1. Simplify DailyBriefingService (generateText + Output.object)
2. Simplify DraftGenerationService (generateText + Output.object)
3. Simplify FollowUpService (merge queue/scanner/extraction)
4. Move CRM services to contacts module
5. Move calendar services to calendar module

**Test:** Briefing, drafts, follow-ups all work without VoltAgent.

### Phase 4: Frontend Redesign

**Replace MUI chat with assistant-ui components.**

1. Install `@assistant-ui/react-ai-sdk`
2. Create `AiChatRuntime` with `useChatRuntime` + `AssistantChatTransport`
3. Build custom Thread component with existing theme
4. Port tool renderers to `makeAssistantToolUI`
5. Port HITL/AskUser to tool renderer pattern
6. Build ThreadList for conversation management
7. Build mobile layout

**Test:** Full chat experience works with new UI.

### Phase 5: Cleanup

**Remove old code. This is where VoltAgent dependency dies.**

1. Delete `@voltagent/core`, `@voltagent/postgres` dependencies
2. Delete `voltagent/agents/` directory
3. Delete old tool factory files
4. Delete merged/moved services
5. Delete old chat components
6. Delete old voltagent controller endpoints (v3)
7. Update module registrations

**Test:** `npm ls @voltagent` returns empty. All tests pass.

### Phase ordering rationale

- **Phase 1 first** because it creates the new foundation without touching existing code. Zero risk of regression.
- **Phase 2 before Phase 4** because the backend must be stable before the frontend switches. Frontend can point at new endpoint while still using old UI.
- **Phase 3 parallel with Phase 2** because non-chat AI (briefing, drafts) is independent of the chat pipeline.
- **Phase 4 after Phase 2** because assistant-ui needs the new backend endpoint format.
- **Phase 5 last** because cleanup is only safe after everything is verified working.

---

## 7. Integration Points

### New Components

| Component | Type | Depends On |
|---|---|---|
| `AiChatService` | NestJS Injectable | All tool services, ChatContextService, ConversationService |
| `AiChatController` | NestJS Controller | AiChatService |
| `EmailToolsService` | NestJS Injectable | PrismaService, CacheService, EmailSendService |
| `CalendarToolsService` | NestJS Injectable | PrismaService, CalendarService |
| `ContactToolsService` | NestJS Injectable | PrismaService |
| `FolderToolsService` | NestJS Injectable | PrismaService |
| `InsightToolsService` | NestJS Injectable | MistralService, EmbeddingsService |
| `MemoryToolsService` | NestJS Injectable | AIMemoryService |
| `CoreToolsService` | NestJS Injectable | (none) |
| `ConversationService` | NestJS Injectable | PrismaService |
| `AiChatRuntime` | React Component | @assistant-ui/react-ai-sdk |

### Modified Components

| Component | Change |
|---|---|
| `ai.module.ts` | Add new providers, remove VoltAgent providers |
| `DailyBriefingService` | Replace agent loop with generateText |
| `FollowUpService` | Merge queue/scanner/extraction |
| `DraftGenerationService` | Replace agent loop with generateText |
| `ChatContextBuilderService` | Rename to ChatContextService, simplify |
| `ChatRequestProcessorService` | Remove model routing, keep PII + rate limit |

### Deleted Components

| Component | Replacement |
|---|---|
| `VoltAgentService` | AiChatService |
| `ChatPrepareService` | AiChatService |
| `AgentPoolService` | None (tools are stateless) |
| `UnifiedAgent` | streamText() call |
| `createEmailTools()` factories | EmailToolsService.getTools() |
| `voltagent.controller.ts` (v3 endpoint) | AiChatController |
| `@voltagent/core` | AI SDK v6 `tool()` + `streamText()` |
| `@voltagent/postgres` | ConversationService (Prisma) |
| Custom MUI chat components | assistant-ui Thread/Composer |

### API Endpoint Changes

| Old | New | Notes |
|---|---|---|
| `POST /api/v1/voltagent/chat/stream/v3` | `POST /api/v1/ai/chat/stream` | New endpoint, old kept during migration |
| `POST /api/v1/voltagent/chat` | DELETE | Non-streaming chat unused |
| `GET /api/v1/voltagent/briefing` | `GET /api/v1/ai/briefing` | Same behavior, simplified internals |
| `GET /api/v1/voltagent/suggested-prompts` | `GET /api/v1/ai/suggested-prompts` | Move to new controller |
| Action approval endpoints | Keep path, move to separate controller | No functional change |

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Conversation history loss during migration | HIGH | Keep VoltAgent postgres tables, read via Prisma. No schema change needed. |
| Tool behavior regression | HIGH | Port tool tests first. Each tool's execute logic is copy-paste from factory function. |
| assistant-ui Pages Router issues | MEDIUM | Already proven: `dynamic()` with `ssr: false`. The `'use client'` components work. |
| PII transform breaking in new pipeline | MEDIUM | Keep ChatRequestProcessorService almost unchanged. Test PII flow first. |
| Performance regression (no agent caching) | LOW | Agents were stateless anyway (recreated every request). Tool services are singleton DI. |
| generateObject deprecation | LOW | Use `generateText({ output: Output.object() })` from day one. |

---

## Sources

- [AI SDK v6: NestJS Cookbook](https://ai-sdk.dev/cookbook/api-servers/nest) -- MEDIUM confidence (official docs)
- [AI SDK v6: Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) -- HIGH confidence (official docs)
- [AI SDK v6: tool() Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool) -- HIGH confidence (official docs)
- [AI SDK 6 Blog Post](https://vercel.com/blog/ai-sdk-6) -- HIGH confidence (official announcement)
- [AI SDK v6: Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) -- HIGH confidence (official docs)
- [assistant-ui: LocalRuntime](https://www.assistant-ui.com/docs/runtimes/custom/local) -- HIGH confidence (official docs)
- [assistant-ui: ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) -- HIGH confidence (official docs)
- [@assistant-ui/react-ai-sdk API](https://www.assistant-ui.com/docs/api-reference/integrations/vercel-ai-sdk) -- HIGH confidence (official docs)
- [assistant-ui GitHub: AI SDK v6 example](https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-ai-sdk-v6) -- MEDIUM confidence (example, not verified running)
- Codebase analysis: `D:/MailAgent/backend/src/modules/ai/voltagent/` -- HIGH confidence (direct source)
