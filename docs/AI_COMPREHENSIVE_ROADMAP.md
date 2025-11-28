# AI Comprehensive Roadmap - MailAgent

**Version:** 3.0
**Date:** 2025-11-28
**Status:** Implementation Phase - Enhanced with Industry Best Practices

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Industry Best Practices](#3-industry-best-practices)
4. [Prompt Engineering Excellence](#4-prompt-engineering-excellence)
5. [Hallucination Prevention & Grounding](#5-hallucination-prevention--grounding)
6. [Multi-Agent Architecture Patterns](#6-multi-agent-architecture-patterns)
7. [LLM Orchestration & Observability](#7-llm-orchestration--observability)
8. [Human-in-the-Loop Design](#8-human-in-the-loop-design)
9. [Tenant-User Isolation](#9-tenant-user-isolation)
10. [Backend Implementation Roadmap](#10-backend-implementation-roadmap)
11. [Frontend Implementation Roadmap](#11-frontend-implementation-roadmap)
12. [Testing Strategy](#12-testing-strategy)
13. [Success Metrics & KPIs](#13-success-metrics--kpis)
14. [References](#14-references)

---

## 1. Executive Summary

This document provides a comprehensive roadmap for enhancing the AI capabilities in MailAgent, covering both backend (`backend/src/modules/ai`) and frontend components. It incorporates industry best practices from 2024-2025 research on multi-agent systems, LLM orchestration, and prompt engineering.

### Key Objectives

- **Reliability**: Eliminate fragile behaviors, enforce consistent error handling
- **Observability**: Full telemetry pipeline with correlation IDs, metrics, dashboards
- **Safety**: Idempotency, capability gating, content sanitization, HITL controls
- **Intelligence**: Enhanced memory management, personalization, multi-step coordination
- **User Experience**: AI-assisted email composition with style learning

### Priority Matrix

| Priority | Focus Area | Impact |
|----------|------------|--------|
| P0 | Foundation Hardening | Eliminate placeholder behaviors, consistent summaries |
| P1 | Resilience & Safety | Queue integration, circuit breakers, idempotency |
| P2 | Memory & Context | Token management, summarization, personalization |
| P3 | Advanced Features | Coordinator/Planner, multi-step workflows |

---

## 2. Current State Analysis

### 2.1 Backend AI Module Structure

```text
backend/src/modules/ai/
├── controllers/
│   ├── ai.controller.ts              # Chat, sessions, summarize, smart-reply, compose
│   ├── knowledge-base.controller.ts  # Knowledge base endpoints
│   └── personalization.controller.ts # Personalization endpoints
├── services/
│   ├── mistral.service.ts            # LLM provider wrapper
│   ├── agent.service.ts              # LangChain agent orchestration
│   ├── chat-session.service.ts       # Session management
│   ├── email-insights.service.ts     # Summarize, smart-reply, categorize, compose
│   ├── knowledge-base.service.ts     # RAG/embeddings
│   ├── embeddings.service.ts         # Vector operations
│   ├── llm-telemetry.service.ts      # LLM call tracking (exists, unused)
│   ├── prompt-registry.service.ts    # Prompt templates
│   └── writing-style.service.ts      # Writing style analysis
├── multi-agent/
│   ├── agents/
│   │   ├── base.agent.ts             # Abstract base agent
│   │   ├── router.agent.ts           # Intent classification
│   │   ├── email.agent.ts            # Email operations
│   │   ├── calendar.agent.ts         # Calendar operations
│   │   ├── contacts.agent.ts         # Contacts operations
│   │   ├── knowledge.agent.ts        # RAG knowledge agent
│   │   └── general.agent.ts          # General chat
│   ├── services/
│   │   ├── multi-agent.service.ts    # Main orchestrator
│   │   ├── action-executor.service.ts # Executes approved actions
│   │   ├── hitl.service.ts           # Human-in-the-loop workflow
│   │   ├── feedback.service.ts       # Learning feedback loop
│   │   ├── memory.service.ts         # FIFO conversation memory
│   │   └── ai-queue.service.ts       # BullMQ queue (exists, unused)
│   └── interfaces/                   # Types and contracts
└── dto/                              # Request/response DTOs
```

### 2.2 Current Capabilities

| Component | Status | Maturity |
|-----------|--------|----------|
| Intent Classification | ✅ Working | Production |
| Email Agent | ✅ Working | MVP |
| Calendar Agent | ✅ Working | MVP |
| Contacts Agent | ✅ Working | MVP |
| Knowledge/RAG | ✅ Working | Production |
| HITL Approval | ✅ Working | Production |
| Learning Loop | ✅ Working | MVP |
| Memory Service | ✅ Working | MVP (FIFO only) |
| AI Queue Service | ⚠️ Available | Not wired |
| LLM Telemetry | ⚠️ Available | Not wired |
| AI Compose | ✅ Working | Basic |
| Multi-language | ✅ Working | en, it, es, fr, de, pt |

### 2.3 Critical Gaps

| Gap | Priority | Impact |
|-----|----------|--------|
| Executor Summaries | P0 | Many branches return `success` without user messages |
| Locale Handling | P0 | Inconsistent language resolution, corrupted strings |
| Placeholder Success | P0 | Services return success when dependencies unavailable |
| LLM Calls Unqueued | P1 | Direct Mistral calls without rate limiting/timeouts |
| No Idempotency | P1 | Duplicate actions not suppressed on retries |
| Memory Limitations | P2 | No summarization when token budget exceeded |
| Observability Gaps | P1 | Telemetry not hooked, logs lack correlation IDs |

### 2.4 Comprehensive Issues Found (November 2025 Deep Audit)

This section documents ALL issues found during comprehensive code audit of the AI system.

---

#### 2.4.1 Backend: Action Executor Service (26 Methods Audited)

**File**: `action-executor.service.ts`

| Line | Issue | Severity | Description |
|------|-------|----------|-------------|
| 184-191 | Placeholder Success | **CRITICAL** | `executeSendEmail` returns `success: true` when `EmailSendService` unavailable |
| 223-230 | Placeholder Success | **CRITICAL** | `executeReplyEmail` returns `success: true` when service unavailable |
| 256-263 | Placeholder Success | **CRITICAL** | `executeForwardEmail` returns `success: true` when service unavailable |
| 404-411 | Placeholder Success | **CRITICAL** | `executeArchiveEmail` returns `success: true` when service unavailable |
| 527-534 | Placeholder Success | **CRITICAL** | `executeGetEvents` returns `success: true` when `CalendarService` unavailable |
| 610-617 | Placeholder Success | **CRITICAL** | `executeCreateEvent` returns `success: true` when service unavailable |
| 686-693 | Placeholder Success | **CRITICAL** | `executeUpdateEvent` returns `success: true` when service unavailable |
| ALL | Missing Summary | **HIGH** | Only `executeGetUnread` (line 472) returns `summary` field |
| 309-317 | Hardcoded English | HIGH | Forwarded email template in English only |
| 337-345 | Hardcoded English | HIGH | Email forward success message in English |
| 385-393 | Hardcoded English | HIGH | Archive success message in English |
| 445-453 | Hardcoded English | HIGH | Mark read/unread messages in English |
| 503-511 | Hardcoded English | HIGH | Star email messages in English |
| 567-575 | Hardcoded English | HIGH | Calendar event messages in English |

**Total**: 7 placeholder success returns, 40+ hardcoded English strings, 25/26 methods missing `summary` field.

---

#### 2.4.2 Backend: Multi-Agent Service

**File**: `multi-agent.service.ts`

| Line | Issue | Severity | Description |
|------|-------|----------|-------------|
| 85-90 | Session ID Not in Response | HIGH | `sessionId` added by controller, not in `MultiAgentResponse` type |
| 120-130 | Executor Errors Hidden | HIGH | Executor errors only add to messages, not returned as structured errors |
| 145-155 | No Retry Logic | MEDIUM | LLM failures not retried with backoff |
| 966 | Locale Not Passed | HIGH | Only `executeGetUnread` receives locale parameter |
| 188-195 | Missing Clarification Support | MEDIUM | `clarifyingQuestions` collected but not properly surfaced |

---

#### 2.4.3 Backend: Router Agent

**File**: `router.agent.ts`

| Line | Issue | Severity | Description |
|------|-------|----------|-------------|
| 72-103 | No Language Enforcement | HIGH | Prompt lists intents but doesn't enforce response language |
| N/A | Missing Locale Handling | MEDIUM | Unlike `email.agent.ts`, router doesn't use `getLanguageName()` |

---

#### 2.4.4 Backend: Other Agents

| Agent | Issue | Location | Description |
|-------|-------|----------|-------------|
| `calendar.agent.ts` | Good | - | Uses locale properly with `getLanguageName()` |
| `contacts.agent.ts` | Good | - | Uses locale properly |
| `knowledge.agent.ts` | Missing Summary | Line 156 | Returns `relevantDocs` but no user-friendly summary |
| `general.agent.ts` | Good | - | Uses locale properly |

---

#### 2.4.5 Frontend: AI Page (`ai.tsx`)

**File**: `frontend/pages/dashboard/ai.tsx`

| Line | Issue | Severity | Description |
|------|-------|----------|-------------|
| 476-478 | Memory Leak | **CRITICAL** | Message array grows unbounded, no pagination |
| 740-741 | Session Race Condition | **CRITICAL** | Async `setSessionId()` means next message may use `undefined` |
| 735 | Ignored Fields | HIGH | `clarifyingQuestions` and `needsMoreInfo` from backend not displayed |
| 752-760 | Silent Fallback | HIGH | Falls back to "No response" without showing actual error |
| 774 | Hardcoded Italian | HIGH | `"Si è verificato un errore..."` hardcoded |
| 777 | Hardcoded Italian | HIGH | `"Sessione terminata..."` hardcoded |
| 783 | Hardcoded Italian | HIGH | `"Timeout della richiesta..."` hardcoded |
| 789 | Hardcoded Italian | HIGH | `"Errore sconosciuto..."` hardcoded |
| 826-830 | Missing Error Handling | MEDIUM | Approve/reject callbacks don't handle errors |
| 880-890 | No Rate Limit Handling | MEDIUM | 429 responses not handled with retry |
| 920-930 | WebSocket Disconnect | MEDIUM | No reconnection logic on disconnect |

---

#### 2.4.6 Frontend: API Type Mismatches

**File**: `frontend/lib/api/multi-agent.ts`

| Endpoint | Frontend Expects | Backend Returns | Severity |
|----------|------------------|-----------------|----------|
| `processMessage` | `MultiAgentResponse` | `{ success, sessionId, ...MultiAgentResponse }` | HIGH |
| `getPendingActions` | `PendingAction[]` | `{ actions: [], total, limit, offset }` | **CRITICAL** |
| `getLearningStats` | `{ profiles, summary }` | `{ success, stats: { ... } }` | HIGH |
| `getFeedback` | `ActionFeedback[]` | `{ feedback: [], total, limit, offset }` | HIGH |
| `getAgents` | `{ agents: AgentInfo[] }` | Matches | OK |
| `approveAction` | `{ success, error? }` | Matches | OK |
| `rejectAction` | `{ success }` | Matches | OK |
| `getActionCounts` | `{ success, counts }` | Matches | OK |
| `resetLearning` | `{ success, deleted }` | Matches | OK |

**Total**: 4/9 endpoints have type mismatches.

---

#### 2.4.7 Frontend: WebSocket Hook

**File**: `frontend/hooks/use-websocket.ts`

| Line | Issue | Severity | Description |
|------|-------|----------|-------------|
| 120-140 | Race Condition | **CRITICAL** | Listeners registered AFTER connection established, early events lost |
| 185-195 | Memory Leak | HIGH | Listener re-registration on state changes without cleanup |
| 310-320 | No Reconnection | MEDIUM | Connection drops not auto-recovered |
| 497-499 | Duplicate Unsubscribe | LOW | Folder events unsubscribed twice |
| 350-360 | Missing AI Events | HIGH | AI action status events (`action.approved`, `action.executed`) not handled |
| N/A | Missing Error Handling | MEDIUM | AI event handlers lack try-catch |

---

#### 2.4.8 Frontend: AI Components (18 Files Audited)

**PendingActionsPanel.tsx** (326 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 174 | "Pending Actions" hardcoded | MEDIUM |
| 177 | "All clear" / "awaiting approval" hardcoded | MEDIUM |
| 214 | "No pending actions" hardcoded | MEDIUM |
| 246 | "High severity - requires review" tooltip hardcoded | LOW |
| 300, 311 | "OK"/"Approve" and "No"/"Reject" for mobile hardcoded | LOW |

**AiInsightsWidget.tsx** (369 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 78 | **WRONG API**: Uses `composeEmail()` to generate inbox summary | **CRITICAL** |
| 85-86 | Hardcoded estimates for urgent/action counts | HIGH |
| 89-90 | "Updates" and "Promotions" category names hardcoded | MEDIUM |
| 58 | Reads `response.data?.length` but API returns `{ actions, total }` | HIGH |
| 63 | Uses `profiles` but API may return `stats` | HIGH |

**SmartReplySuggestions.tsx** (315 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 85, 89 | Error messages hardcoded in English | HIGH |
| 181 | "Dismiss" tooltip hardcoded | LOW |
| 212 | "Retry" label hardcoded | LOW |
| 224 | "Generating suggestions..." hardcoded | MEDIUM |

**EmailSummaryPanel.tsx** (481 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 143, 147 | Error messages hardcoded in English | HIGH |
| 287 | "Retry" hardcoded | LOW |
| 471 | "Generate Summary" button hardcoded | MEDIUM |

**SchedulingDrawer.tsx** (607 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 251 | "Failed to generate time slots" hardcoded | HIGH |
| 265 | "Please select a calendar provider" hardcoded | HIGH |
| 309 | "Failed to create event" hardcoded | HIGH |
| 318-319 | Day/month names hardcoded in English | HIGH |
| 551, 564 | Placeholder text hardcoded | LOW |
| 572-574 | "Enter a scheduling request..." hardcoded | MEDIUM |

**AiChatPanel.tsx** (460 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 55-72 | Only EN and IT in `SUGGESTION_PROMPTS` | HIGH |
| 141-156 | Only EN and IT error messages | HIGH |
| Good | Passes locale to API | OK |

**AISearchBar.tsx** (296 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 59 | Placeholder hardcoded in English | MEDIUM |
| 83-86 | **Missing locale** in `searchMemory()` call | HIGH |
| 92 | "Failed to search emails" hardcoded | HIGH |
| 234 | "No Subject" hardcoded | LOW |
| 259 | "Unknown sender" hardcoded | LOW |
| 286 | "No results found..." hardcoded | MEDIUM |

**LearningProgressCard.tsx** (376 lines)
| Line | Issue | Severity |

|------|-------|----------|
| 174 | "AI Learning Progress" hardcoded | HIGH |
| 178 | "{summary.totalAttempts} actions processed" hardcoded | HIGH |
| 226, 241, 259 | "Approval Rate", "Success Rate", "Total Actions" hardcoded | HIGH |
| 270 | "No learning data yet..." hardcoded | HIGH |
| 332 | "{stats.total} actions" hardcoded | MEDIUM |
| 354 | "+{X} more" hardcoded | LOW |

---

#### 2.4.9 Summary Statistics

| Category | Issues Found |
|----------|--------------|
| **Backend Placeholder Returns** | 7 critical |
| **Backend Missing Summaries** | 25/26 methods |
| **Backend Hardcoded Strings** | 40+ |
| **Frontend API Mismatches** | 4 critical |
| **Frontend Hardcoded Strings** | 60+ |
| **WebSocket Issues** | 6 |
| **Memory Leaks** | 2 critical |
| **Race Conditions** | 2 critical |
| **Missing Locale Support** | 15+ components |

---

#### 2.4.10 Root Cause Analysis

**Why "tools not called":**

1. Router agent doesn't enforce response language → LLM confusion
2. Email agent returns `UNKNOWN` action when prompt parsing fails
3. No fallback handling for parse failures

**Why "bad responses":**

1. API type mismatches: frontend expects array, backend returns paginated object
2. `success: true` returned when services unavailable → misleading
3. No `summary` field in execution results → frontend shows nothing

**Why "unconnected data":**

1. WebSocket race condition: listeners registered after events fired
2. Session ID async update: second message loses session context
3. Pending actions API mismatch: frontend can't read `actions` array

**Why "hardcoded English":**

1. Action executor doesn't receive locale context
2. 40+ strings in executor hardcoded
3. Only 1 executor method passes locale
4. Frontend components have 60+ hardcoded strings

### 2.5 Immediate Fixes Required (P0)

```typescript
// 1. Fix placeholder success in action-executor.service.ts
// BEFORE (BAD):
if (!this.emailSendService) {
  return { success: true, data: { message: 'placeholder' }, executionTimeMs: 0 };
}

// AFTER (GOOD):
if (!this.emailSendService) {
  return {
    success: false,
    error: 'Email service not available',
    errorCode: 'SERVICE_UNAVAILABLE',
    executionTimeMs: 0
  };
}

// 2. Add localized summaries to all executors
// BEFORE (BAD):
return { success: true, data: { emailId, deleted: true }, executionTimeMs: 0 };

// AFTER (GOOD):
const locale = context.preferences?.language || 'en';
const summary = locale === 'it'
  ? 'Email eliminata con successo.'
  : 'Email deleted successfully.';
return { success: true, summary, data: { emailId, deleted: true }, executionTimeMs: 0 };

// 3. Fix frontend API types
// BEFORE (BAD):
interface LearningStatsResponse {
  profiles: LearningProfile[];  // Frontend expects this
}
// Backend returns { stats: { ... } }

// AFTER (GOOD):
interface LearningStatsResponse {
  success: boolean;
  stats: {
    totalProfiles: number;
    byAgent: Record<string, AgentStats>;
    // ...
  };
}
```

---

### 2.6 Implementation Todo Checklist

Use this checklist to track progress fixing all issues found in the audit.

---

#### P0 - CRITICAL (Fix Immediately)

**Backend: Placeholder Success Returns** (`action-executor.service.ts`)

- [ ] Fix `executeSendEmail` (line 184-191) - Return error when EmailSendService unavailable
- [ ] Fix `executeReplyEmail` (line 223-230) - Return error when service unavailable
- [ ] Fix `executeForwardEmail` (line 256-263) - Return error when service unavailable
- [ ] Fix `executeArchiveEmail` (line 404-411) - Return error when service unavailable
- [ ] Fix `executeGetEvents` (line 527-534) - Return error when CalendarService unavailable
- [ ] Fix `executeCreateEvent` (line 610-617) - Return error when service unavailable
- [ ] Fix `executeUpdateEvent` (line 686-693) - Return error when service unavailable

**Frontend: API Type Mismatches** (`frontend/lib/api/multi-agent.ts`)

- [ ] Fix `getPendingActions` type - Change from `PendingAction[]` to `{ actions: PendingAction[], total, limit, offset }`
- [ ] Fix `getLearningStats` type - Align with backend `{ success, stats }` structure
- [ ] Fix `getFeedback` type - Change from `ActionFeedback[]` to `{ feedback: [], total, limit, offset }`
- [ ] Fix `processMessage` type - Add `success` and `sessionId` to response type

**Frontend: Critical Bugs** (`frontend/pages/dashboard/ai.tsx`)

- [ ] Fix session ID race condition (line 740-741) - Use ref or callback instead of async setState
- [ ] Fix unbounded message array (line 476-478) - Add pagination or limit (max 100 messages)

**Frontend: Wrong API Usage** (`frontend/components/dashboard/ai/AiInsightsWidget.tsx`)

- [ ] Fix line 78 - Create proper inbox summary endpoint instead of misusing `composeEmail()`
- [ ] Fix line 58 - Handle `{ actions, total }` response format for pending actions
- [ ] Fix line 63 - Handle `{ stats }` response format for learning stats

**Frontend: WebSocket Race Condition** (`frontend/hooks/use-websocket.ts`)

- [ ] Fix line 120-140 - Register listeners BEFORE establishing connection

---

#### P1 - HIGH (Fix This Week)

**Backend: Add Summary Field to All Executors** (`action-executor.service.ts`)

- [ ] Add `summary` to `executeSendEmail`
- [ ] Add `summary` to `executeReplyEmail`
- [ ] Add `summary` to `executeForwardEmail`
- [ ] Add `summary` to `executeSearchEmails`
- [ ] Add `summary` to `executeDeleteEmail`
- [ ] Add `summary` to `executeArchiveEmail`
- [ ] Add `summary` to `executeMarkRead`
- [ ] Add `summary` to `executeMarkUnread`
- [ ] Add `summary` to `executeStarEmail`
- [ ] Add `summary` to `executeUnstarEmail`
- [ ] Add `summary` to `executeGetEvents`
- [ ] Add `summary` to `executeCreateEvent`
- [ ] Add `summary` to `executeUpdateEvent`
- [ ] Add `summary` to `executeDeleteEvent`
- [ ] Add `summary` to `executeGetContact`
- [ ] Add `summary` to `executeCreateContact`
- [ ] Add `summary` to `executeUpdateContact`
- [ ] Add `summary` to `executeDeleteContact`
- [ ] Add `summary` to `executeCreateFolder`
- [ ] Add `summary` to `executeRenameFolder`
- [ ] Add `summary` to `executeDeleteFolder`
- [ ] Add `summary` to `executeMoveEmail`
- [ ] Add `summary` to `executeLabelEmail`
- [ ] Add `summary` to `executeUnlabelEmail`
- [ ] Add `summary` to `executeSearchContacts`

**Backend: Pass Locale to All Executors** (`multi-agent.service.ts`)

- [ ] Pass locale context to all executor method calls (currently only `executeGetUnread` receives it)
- [ ] Create `ExecutorContext` interface with locale field
- [ ] Update all executor methods to accept and use locale

**Backend: Router Agent Locale** (`router.agent.ts`)

- [ ] Add language enforcement to classification prompt (like email.agent.ts)
- [ ] Use `getLanguageName()` helper from base.agent.ts

**Backend: Multi-Agent Service** (`multi-agent.service.ts`)

- [ ] Return executor errors as structured errors, not just messages
- [ ] Surface `clarifyingQuestions` properly in response
- [ ] Add `sessionId` to `MultiAgentResponse` interface

**Frontend: AI Page Issues** (`frontend/pages/dashboard/ai.tsx`)

- [ ] Display `clarifyingQuestions` from backend (line 735)
- [ ] Show actual error messages instead of silent fallback (line 752-760)
- [ ] Add error handling to approve/reject callbacks (line 826-830)

**Frontend: WebSocket Issues** (`frontend/hooks/use-websocket.ts`)

- [ ] Fix memory leak from listener re-registration (line 185-195)
- [ ] Add AI event handlers for `action.approved` and `action.executed` events
- [ ] Add error handling to AI event handlers

---

#### P2 - MEDIUM (Fix This Sprint)

**Backend: Localize Hardcoded Strings** (`action-executor.service.ts`)

- [ ] Create `ExecutorMessages` locale map (en, it)
- [ ] Localize forwarded email template (line 309-317)
- [ ] Localize email forward success message (line 337-345)
- [ ] Localize archive success message (line 385-393)
- [ ] Localize mark read/unread messages (line 445-453)
- [ ] Localize star email messages (line 503-511)
- [ ] Localize calendar event messages (line 567-575)
- [ ] Add locale to all 40+ hardcoded strings

**Frontend: AI Page i18n** (`frontend/pages/dashboard/ai.tsx`)

- [ ] Add i18n key for "Si è verificato un errore..." (line 774)
- [ ] Add i18n key for "Sessione terminata..." (line 777)
- [ ] Add i18n key for "Timeout della richiesta..." (line 783)
- [ ] Add i18n key for "Errore sconosciuto..." (line 789)

**Frontend: Component i18n - PendingActionsPanel.tsx**

- [ ] Add i18n key for "Pending Actions" (line 174)
- [ ] Add i18n key for "All clear" / "awaiting approval" (line 177)
- [ ] Add i18n key for "No pending actions" (line 214)

**Frontend: Component i18n - LearningProgressCard.tsx**

- [ ] Add i18n key for "AI Learning Progress" (line 174)
- [ ] Add i18n key for "actions processed" (line 178)
- [ ] Add i18n key for "Approval Rate" (line 226)
- [ ] Add i18n key for "Success Rate" (line 241)
- [ ] Add i18n key for "Total Actions" (line 259)
- [ ] Add i18n key for "No learning data yet..." (line 270)

**Frontend: Component i18n - SmartReplySuggestions.tsx**

- [ ] Add i18n key for error messages (line 85, 89)
- [ ] Add i18n key for "Generating suggestions..." (line 224)

**Frontend: Component i18n - EmailSummaryPanel.tsx**

- [ ] Add i18n key for error messages (line 143, 147)
- [ ] Add i18n key for "Generate Summary" (line 471)

**Frontend: Component i18n - SchedulingDrawer.tsx**

- [ ] Add i18n key for "Failed to generate time slots" (line 251)
- [ ] Add i18n key for "Please select a calendar provider" (line 265)
- [ ] Add i18n key for "Failed to create event" (line 309)
- [ ] Localize day/month names (line 318-319) - use `toLocaleDateString()`
- [ ] Add i18n key for "Enter a scheduling request..." (line 572-574)

**Frontend: Component i18n - AISearchBar.tsx**

- [ ] Add locale parameter to `searchMemory()` call (line 83-86)
- [ ] Add i18n key for placeholder (line 59)
- [ ] Add i18n key for "Failed to search emails" (line 92)
- [ ] Add i18n key for "No results found..." (line 286)

**Frontend: Component i18n - AiChatPanel.tsx**

- [ ] Add ES, FR, DE, PT to `SUGGESTION_PROMPTS` (line 55-72)
- [ ] Add ES, FR, DE, PT error messages (line 141-156)

**Frontend: WebSocket Improvements** (`frontend/hooks/use-websocket.ts`)

- [ ] Add reconnection logic for dropped connections (line 310-320)
- [ ] Remove duplicate folder event unsubscriptions (line 497-499)

**Frontend: AI Page Improvements** (`frontend/pages/dashboard/ai.tsx`)

- [ ] Add rate limit handling with retry for 429 responses (line 880-890)
- [ ] Add WebSocket reconnection logic (line 920-930)

---

#### P3 - LOW (Backlog)

**Frontend: Minor UI Strings**

- [ ] `PendingActionsPanel.tsx`: Localize "High severity - requires review" tooltip (line 246)
- [ ] `PendingActionsPanel.tsx`: Localize "OK"/"Approve" and "No"/"Reject" mobile labels (line 300, 311)
- [ ] `SmartReplySuggestions.tsx`: Localize "Dismiss" tooltip (line 181)
- [ ] `SmartReplySuggestions.tsx`: Localize "Retry" label (line 212)
- [ ] `EmailSummaryPanel.tsx`: Localize "Retry" (line 287)
- [ ] `AISearchBar.tsx`: Localize "No Subject" (line 234)
- [ ] `AISearchBar.tsx`: Localize "Unknown sender" (line 259)
- [ ] `SchedulingDrawer.tsx`: Localize placeholder texts (line 551, 564)
- [ ] `LearningProgressCard.tsx`: Localize "actions" (line 332)
- [ ] `LearningProgressCard.tsx`: Localize "+X more" (line 354)

**Backend: Knowledge Agent**

- [ ] Add user-friendly summary to `knowledge.agent.ts` (line 156)

---

#### Testing Checklist

After fixing issues, verify with these tests:

**Backend Tests**

- [ ] All 7 placeholder success returns now return errors
- [ ] All 26 executor methods return `summary` field
- [ ] All executor methods receive and use locale
- [ ] Router agent enforces response language

**Frontend Tests**

- [ ] API types match backend responses (no TypeScript errors)
- [ ] Session ID persists across multiple messages
- [ ] Message array doesn't grow beyond 100 items
- [ ] WebSocket events are received on connect
- [ ] Pending actions panel displays correctly
- [ ] Learning stats display correctly
- [ ] All UI strings display in user's locale

**Integration Tests**

- [ ] Multi-agent chat in Italian works end-to-end
- [ ] Action approval flow works without race conditions
- [ ] WebSocket reconnects after disconnect
- [ ] Error messages display correctly in all locales

---

## 3. Industry Best Practices

> **Sources**: [Springs Apps Multi-Agent Guide](https://springsapps.com/knowledge/everything-you-need-to-know-about-multi-ai-agents-in-2024-explanation-examples-and-challenges), [orq.ai Agent Architecture](https://orq.ai/blog/ai-agent-architecture), [Microsoft Multi-Agent Design](https://devblogs.microsoft.com/blog/designing-multi-agent-intelligence)

### 3.1 Multi-Agent Architecture Principles

**Hierarchical Cognitive Pattern** (recommended for 2025):

- **Reactive Layer**: Fast safety-critical logic (input validation, rate limiting)
- **Deliberative Layer**: State estimation and planning (agent selection, action proposal)
- **Meta-Cognitive Layer**: Long-horizon goal management (coordinator/planner)

**Key Benefits**:

- Multi-agent systems can reduce hallucinations by up to 40% through cross-validation
- Parallel processing enables handling multiple tasks simultaneously
- Specialized agents provide better domain expertise than general-purpose models

### 3.2 LLM Orchestration Principles

> **Sources**: [orq.ai LLM Orchestration](https://orq.ai/blog/llm-orchestration), [ZenML Production Guide](https://www.zenml.io/blog/llm-agents-in-production-architectures-challenges-and-best-practices)

**Production Best Practices**:

1. **Task Decomposition**: Isolate key functions into testable modules
2. **Model Routing**: Use cheaper models for simple tasks, premium for complex reasoning
3. **Fallbacks & Guardrails**: Secondary validators, circuit breakers, human handoff
4. **Rate Limiting**: Async task queues with concurrency controls
5. **Consensus Pattern**: Route outputs through validators before proceeding

### 3.3 Email Personalization Best Practices

**Style Learning Strategy**:

- Analyze sent emails to build writing profile
- Track 50+ linguistic metrics (formality, tone, structure)
- Adapt AI output to match user voice
- Regular audits (3-6 month review cycles)

---

## 4. Prompt Engineering Excellence

> **Sources**: [Google Cloud Function Calling](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling), [Prompt Engineering Guide](https://www.promptingguide.ai/applications/function_calling)

### 4.1 Core Principles

#### Specificity Over Vagueness

```typescript
// ❌ BAD: Vague prompt
const badPrompt = "Write an email about the project";

// ✅ GOOD: Specific, structured prompt
const goodPrompt = `
You are writing on behalf of {userName}, a {userRole}.
Compose a professional email with the following requirements:
- Subject: {subject}
- Recipients: {recipients}
- Purpose: {purpose}
- Tone: {tone}
- Maximum length: {maxWords} words
- Include: greeting, main content, call-to-action, sign-off
`;
```

#### Role Assignment Pattern

```typescript
const systemPrompt = `
You are an AI email assistant for a professional email client.
Your role is to help users compose, reply, and manage emails.

CAPABILITIES:
- Draft emails matching user's writing style
- Suggest smart replies based on context
- Summarize email threads
- Categorize and organize emails

CONSTRAINTS:
- Never include information not provided in context
- Always maintain professional tone unless instructed otherwise
- Respect user's locale and cultural preferences
- Do not make assumptions about recipient relationships
`;
```

### 4.2 Structured Output Best Practices

#### JSON Schema Definition

```typescript
// Define strict schemas for agent outputs
const AgentOutputSchema = z.object({
  actionType: z.enum([
    'SEND_EMAIL', 'REPLY_EMAIL', 'FORWARD_EMAIL',
    'CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT',
    'CREATE_CONTACT', 'UPDATE_CONTACT', 'SEARCH'
  ]),
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.unknown()),
  reasoning: z.string().max(200)
});

// Prompt instruction for structured output
const outputInstruction = `
Respond with ONLY a valid JSON object. No markdown, no code fences, no explanations.
Schema:
{
  "actionType": "one of: SEND_EMAIL, REPLY_EMAIL, CREATE_EVENT, ...",
  "confidence": 0.0-1.0,
  "parameters": { ... action-specific parameters ... },
  "reasoning": "brief explanation (max 200 chars)"
}
`;
```

#### Enum Fields for Finite Sets

```typescript
// ❌ BAD: Description-based constraint
const badSchema = {
  tone: { type: 'string', description: 'formal, casual, or technical' }
};

// ✅ GOOD: Enum constraint
const goodSchema = {
  tone: { type: 'string', enum: ['formal', 'casual', 'technical'] }
};
```

### 4.3 Chain-of-Thought Prompting

```typescript
const chainOfThoughtPrompt = `
Before providing your final answer, think through the problem step by step:

1. UNDERSTAND: What is the user asking for?
2. CONTEXT: What relevant information do I have?
3. PLAN: What actions are needed?
4. VALIDATE: Are all required parameters available?
5. EXECUTE: Generate the structured response.

Format your thinking as:
<thinking>
[Your step-by-step reasoning]
</thinking>

<response>
[Your JSON response]
</response>
`;
```

### 4.4 Few-Shot Examples

```typescript
const fewShotPrompt = `
Here are examples of correct responses:

User: "Send a thank you email to john@example.com"
Response: {"actionType":"SEND_EMAIL","confidence":0.95,"parameters":{"to":["john@example.com"],"subject":"Thank You","tone":"formal"},"reasoning":"Clear request with explicit recipient"}

User: "Reply to the last email saying I agree"
Response: {"actionType":"REPLY_EMAIL","confidence":0.90,"parameters":{"message":"I agree with your proposal.","tone":"casual"},"reasoning":"Simple agreement reply to most recent email"}

User: "What's the weather like?"
Response: {"actionType":"CANNOT_HANDLE","confidence":1.0,"parameters":{},"reasoning":"Weather queries are outside my email management capabilities"}

Now respond to the user's request following the same format.
`;
```

### 4.5 Tool/Function Calling Schema Design

> **Source**: [Analytics Vidhya Function Calling](https://www.analyticsvidhya.com/blog/2024/10/function-calling-in-ai-agents-using-mistral-7b/)

```typescript
// Best practices for function definitions
const emailToolDefinition = {
  name: 'send_email',
  description: 'Send a new email to one or more recipients. Use this when the user explicitly wants to send a new email (not reply or forward).',
  parameters: {
    type: 'object',
    required: ['to', 'subject', 'body'],
    properties: {
      to: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'List of recipient email addresses',
        minItems: 1
      },
      cc: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'Optional CC recipients'
      },
      subject: {
        type: 'string',
        maxLength: 200,
        description: 'Email subject line'
      },
      body: {
        type: 'string',
        maxLength: 10000,
        description: 'Email body content in plain text or HTML'
      },
      priority: {
        type: 'string',
        enum: ['high', 'normal', 'low'],
        default: 'normal'
      }
    }
  }
};
```

### 4.6 Locale-Aware Prompting

```typescript
const localeAwarePrompt = (locale: string) => `
LANGUAGE REQUIREMENTS:
- Respond in: ${locale === 'it' ? 'Italian (Italiano)' : locale === 'es' ? 'Spanish (Español)' : 'English'}
- Use culturally appropriate greetings and sign-offs
- Adapt formality level to cultural norms

${locale === 'it' ? `
Examples of Italian greetings:
- Formal: "Gentile [Nome]," / "Egregio/Egregia,"
- Casual: "Ciao [Nome]," / "Salve,"
Sign-offs:
- Formal: "Cordiali saluti," / "Distinti saluti,"
- Casual: "A presto," / "Un saluto,"
` : ''}
`;
```

---

## 5. Hallucination Prevention & Grounding

> **Sources**: [AWS Bedrock Hallucination Reduction](https://aws.amazon.com/blogs/machine-learning/reducing-hallucinations-in-large-language-models-with-custom-intervention-using-amazon-bedrock-agents/), [Voiceflow Prevention Strategies](https://www.voiceflow.com/blog/prevent-llm-hallucinations), [K2View Grounding AI](https://www.k2view.com/blog/grounding-ai/)

### 5.1 Multi-Layered Defense Strategy

A 2024 Stanford study found that combining RAG, RLHF, and guardrails led to a **96% reduction in hallucinations**.

```text
┌─────────────────────────────────────────────────────────┐
│                 HALLUCINATION DEFENSE                    │
├─────────────────────────────────────────────────────────┤
│  Layer 1: INPUT GROUNDING                                │
│  └─ RAG context injection                                │
│  └─ User data enrichment                                 │
│  └─ Verified knowledge base                              │
├─────────────────────────────────────────────────────────┤
│  Layer 2: PROMPT CONSTRAINTS                             │
│  └─ Explicit refusal instructions                        │
│  └─ Source citation requirements                         │
│  └─ Confidence thresholds                                │
├─────────────────────────────────────────────────────────┤
│  Layer 3: OUTPUT VALIDATION                              │
│  └─ Schema validation                                    │
│  └─ Fact-checking against context                        │
│  └─ Secondary LLM verification                           │
├─────────────────────────────────────────────────────────┤
│  Layer 4: RUNTIME GUARDRAILS                             │
│  └─ HITL for high-stakes actions                         │
│  └─ Action execution validation                          │
│  └─ Rollback capabilities                                │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Retrieval-Augmented Generation (RAG)

```typescript
async function groundedCompose(
  tenantId: string,
  userId: string,
  prompt: string
): Promise<string> {
  // 1. Retrieve relevant context from user's data
  const recentEmails = await this.emailService.getRecent(tenantId, userId, 10);
  const contacts = await this.contactsService.getFrequent(tenantId, userId, 20);
  const writingStyle = await this.writingStyleService.getProfile(tenantId, userId);

  // 2. Build grounded context
  const groundingContext = `
GROUNDING DATA (use ONLY this information):

RECENT EMAIL SUBJECTS:
${recentEmails.map(e => `- ${e.subject} (from: ${e.from})`).join('\n')}

KNOWN CONTACTS:
${contacts.map(c => `- ${c.name}: ${c.email}`).join('\n')}

USER'S WRITING STYLE:
- Formality: ${writingStyle.formalityScore > 0.6 ? 'formal' : 'casual'}
- Typical greeting: ${writingStyle.preferredGreetings[0] || 'Hi'}
- Typical sign-off: ${writingStyle.preferredSignOffs[0] || 'Best'}

IMPORTANT: Only reference contacts and emails from the above lists.
If information is not provided, ask the user for clarification.
Do NOT invent email addresses, names, or past conversations.
`;

  // 3. Call LLM with grounded context
  return await this.mistral.complete({
    systemPrompt: groundingContext + this.baseSystemPrompt,
    userPrompt: prompt
  });
}
```

### 5.3 Explicit Refusal Instructions

```typescript
const antiHallucinationPrompt = `
CRITICAL RULES - NEVER VIOLATE:

1. NEVER INVENT:
   - Email addresses not provided in context
   - Contact names not in the contact list
   - Past conversations or emails not shown
   - Meeting times or dates not specified
   - Attachments or files not mentioned

2. WHEN UNCERTAIN:
   - Ask for clarification instead of guessing
   - Respond with: {"actionType":"NEED_CLARIFICATION","parameters":{"question":"..."}}
   - Never assume recipient relationships

3. REQUIRED FIELDS:
   - If a required field is missing, ASK for it
   - Do not fill in placeholders like "[name]" or "TBD"

4. CONFIDENCE REPORTING:
   - Only report confidence > 0.8 if ALL required info is explicitly provided
   - If inferring anything, confidence must be < 0.7

Example of CORRECT uncertainty handling:
User: "Send an email to John"
Response: {"actionType":"NEED_CLARIFICATION","parameters":{"question":"Which John? I found multiple contacts: John Smith (john.s@example.com), John Doe (jdoe@company.com)"}}
`;
```

### 5.4 Output Validation & Fact-Checking

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  hallucinationFlags: string[];
}

async function validateAgentOutput(
  output: AgentOutput,
  context: AgentContext
): Promise<ValidationResult> {
  const errors: string[] = [];
  const hallucinationFlags: string[] = [];

  // 1. Schema validation
  const schemaResult = await this.validateSchema(output);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors);
  }

  // 2. Email address verification
  if (output.parameters.to) {
    for (const email of output.parameters.to) {
      const isKnown = await this.contactsService.exists(context.tenantId, email);
      if (!isKnown) {
        hallucinationFlags.push(`Unknown email: ${email}`);
      }
    }
  }

  // 3. Reference verification
  if (output.parameters.replyToEmailId) {
    const emailExists = await this.emailService.exists(
      context.tenantId,
      context.userId,
      output.parameters.replyToEmailId
    );
    if (!emailExists) {
      hallucinationFlags.push('Referenced email does not exist');
    }
  }

  // 4. Date/time sanity check
  if (output.parameters.scheduledTime) {
    const scheduled = new Date(output.parameters.scheduledTime);
    if (scheduled < new Date()) {
      errors.push('Cannot schedule in the past');
    }
    if (scheduled > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
      hallucinationFlags.push('Suspiciously far future date');
    }
  }

  return { valid: errors.length === 0, errors, hallucinationFlags };
}
```

### 5.5 Guardrails Implementation

```typescript
interface Guardrail {
  name: string;
  check: (output: AgentOutput, context: AgentContext) => Promise<GuardrailResult>;
  severity: 'block' | 'warn' | 'log';
}

const guardrails: Guardrail[] = [
  {
    name: 'email_count_limit',
    severity: 'block',
    check: async (output) => {
      if (output.parameters.to?.length > 50) {
        return { passed: false, reason: 'Too many recipients (max 50)' };
      }
      return { passed: true };
    }
  },
  {
    name: 'sensitive_content_detection',
    severity: 'warn',
    check: async (output) => {
      const sensitivePatterns = [/password/i, /credit.?card/i, /ssn/i];
      const content = JSON.stringify(output.parameters);
      for (const pattern of sensitivePatterns) {
        if (pattern.test(content)) {
          return { passed: false, reason: 'Potentially sensitive content' };
        }
      }
      return { passed: true };
    }
  },
  {
    name: 'external_domain_check',
    severity: 'warn',
    check: async (output, context) => {
      if (!output.parameters.to) return { passed: true };
      const tenantDomain = await this.getTenantDomain(context.tenantId);
      const external = output.parameters.to.filter(
        (email: string) => !email.endsWith(`@${tenantDomain}`)
      );
      if (external.length > 0) {
        return { passed: true, warning: `External recipients: ${external.join(', ')}` };
      }
      return { passed: true };
    }
  }
];
```

---

## 6. Multi-Agent Architecture Patterns

> **Sources**: [Microsoft Multi-Agent Design](https://devblogs.microsoft.com/blog/designing-multi-agent-intelligence), [MarkTechPost Top 5 Architectures](https://www.marktechpost.com/2025/11/15/comparing-the-top-5-ai-agent-architectures-in-2025-hierarchical-swarm-meta-learning-modular-evolutionary/)

### 6.1 Hierarchical Cognitive Agent Pattern

```text
┌─────────────────────────────────────────────────────────┐
│              META-COGNITIVE LAYER                        │
│  (Coordinator/Planner - long-horizon goal management)   │
│  • Multi-step planning                                   │
│  • Cross-agent coordination                              │
│  • Failure recovery & rollback                           │
├─────────────────────────────────────────────────────────┤
│              DELIBERATIVE LAYER                          │
│  (Specialized Agents - state estimation & planning)     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Email   │ │Calendar │ │Contacts │ │Knowledge│       │
│  │ Agent   │ │ Agent   │ │ Agent   │ │ Agent   │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
├─────────────────────────────────────────────────────────┤
│              REACTIVE LAYER                              │
│  (Router Agent - fast real-time control)                │
│  • Intent classification                                 │
│  • Input validation                                      │
│  • Rate limiting                                         │
│  • Fast-path detection                                   │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Agent Communication Protocol

```typescript
interface AgentMessage {
  id: string;
  timestamp: Date;
  fromAgent: string;
  toAgent: string | 'broadcast';
  messageType: 'request' | 'response' | 'event' | 'error';
  correlationId: string;
  payload: unknown;
  metadata: {
    priority: 'high' | 'normal' | 'low';
    ttl?: number;
    requiresAck?: boolean;
  };
}

interface AgentRegistry {
  registerAgent(agent: BaseAgent): void;
  getAgent(name: string): BaseAgent | undefined;
  broadcast(message: AgentMessage): Promise<void>;
  sendTo(agentName: string, message: AgentMessage): Promise<AgentMessage>;
}
```

### 6.3 Cross-Validation for Accuracy

Multi-agent systems can improve accuracy by up to 40% through cross-validation:

```typescript
async function crossValidatedAction(
  primaryResult: AgentResult,
  context: AgentContext
): Promise<AgentResult> {
  // For critical actions, get secondary opinion
  if (primaryResult.proposedActions.some(a => a.severity === 'HIGH')) {
    const validators = [
      this.getAgent('EmailAgent'),
      this.getAgent('GeneralAgent')
    ].filter(a => a.name !== primaryResult.agentUsed);

    const validationResults = await Promise.all(
      validators.map(v => v.validateAction(primaryResult.proposedActions[0]))
    );

    const approvalRate = validationResults.filter(r => r.approved).length / validators.length;

    if (approvalRate < 0.5) {
      return {
        ...primaryResult,
        proposedActions: primaryResult.proposedActions.map(a => ({
          ...a,
          confidence: a.confidence * 0.5,
          validationWarning: 'Cross-validation raised concerns'
        }))
      };
    }
  }

  return primaryResult;
}
```

### 6.4 Memory Architecture

```typescript
interface AgentMemory {
  // Working memory: Current task context (cleared per session)
  working: {
    currentGoal: string;
    conversationHistory: Message[];
    activeContext: Record<string, unknown>;
  };

  // Episodic memory: Recent interactions (FIFO, max N items)
  episodic: {
    recentActions: ActionRecord[];
    recentFeedback: FeedbackRecord[];
    sessionSummaries: SessionSummary[];
  };

  // Semantic memory: Long-term knowledge (RAG embeddings)
  semantic: {
    userPreferences: UserPreferences;
    writingStyle: WritingStyleProfile;
    contactRelationships: ContactGraph;
  };

  // Procedural memory: Learned behaviors
  procedural: {
    learningProfiles: LearningProfile[];
    actionPatterns: ActionPattern[];
  };
}
```

### 6.5 Coordinator/Planner Implementation

```typescript
interface ExecutionPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
  trace: PlanTrace[];
}

interface PlanStep {
  stepId: string;
  agentName: string;
  action: string;
  parameters: Record<string, unknown>;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: AgentResult;
}

class CoordinatorAgent extends BaseAgent {
  async process(context: AgentContext): Promise<AgentResult> {
    // 1. Decompose goal into steps
    const plan = await this.createPlan(context.message);

    // 2. Execute steps in dependency order
    for (const step of this.topologicalSort(plan.steps)) {
      const dependenciesMet = step.dependencies.every(
        depId => plan.steps.find(s => s.stepId === depId)?.status === 'completed'
      );

      if (!dependenciesMet) {
        step.status = 'skipped';
        continue;
      }

      step.status = 'running';
      const agent = this.registry.getAgent(step.agentName);

      try {
        const result = await agent.process(this.buildStepContext(context, step));
        step.result = result;
        step.status = 'completed';

        if (result.proposedActions.some(a => a.severity === 'HIGH')) {
          await this.awaitHumanApproval(step, result);
        }
      } catch (error) {
        step.status = 'failed';
        plan.status = 'failed';
        await this.rollback(plan);
        break;
      }
    }

    return this.aggregateResults(plan);
  }
}
```

---

## 7. LLM Orchestration & Observability

> **Sources**: [orq.ai LLM Orchestration](https://orq.ai/blog/llm-orchestration), [Neptune LLM Observability](https://neptune.ai/blog/llm-observability)

### 7.1 Queue-Based LLM Management

```typescript
interface QueuedLLMJob {
  id: string;
  tenantId: string;
  userId: string;
  operation: 'classify' | 'generate' | 'embed' | 'validate';
  priority: number;
  payload: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  config: {
    timeout: number;
    retries: number;
    retryDelay: number;
  };
  metadata: {
    correlationId: string;
    agent?: string;
    actionType?: string;
  };
}

@Injectable()
export class AIQueueService {
  async enqueue(job: QueuedLLMJob): Promise<Job> {
    return await this.queue.add(job.operation, job, {
      priority: job.priority,
      attempts: job.config.retries,
      backoff: { type: 'exponential', delay: job.config.retryDelay },
      timeout: job.config.timeout
    });
  }

  async processJob(job: Job<QueuedLLMJob>): Promise<LLMResponse> {
    const { data } = job;

    if (this.circuitBreaker.isOpen(data.tenantId)) {
      throw new Error('Circuit breaker open');
    }

    if (!await this.rateLimiter.check(data.tenantId, data.userId)) {
      throw new Error('Rate limit exceeded');
    }

    return await this.telemetry.trackCall(
      data.operation,
      data.metadata.correlationId,
      async () => {
        const response = await this.mistralService.complete(data.payload);
        this.circuitBreaker.recordSuccess(data.tenantId);
        return response;
      }
    );
  }
}
```

### 7.2 Circuit Breaker Pattern

```typescript
interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  lastFailure: Date | null;
  nextAttempt: Date | null;
}

class CircuitBreaker {
  private config = {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    halfOpenLimit: 1
  };

  isOpen(key: string): boolean {
    const state = this.getState(key);
    if (state.status === 'open') {
      if (Date.now() > state.nextAttempt!.getTime()) {
        state.status = 'half-open';
        state.successes = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(key: string): void {
    const state = this.getState(key);
    if (state.status === 'half-open') {
      state.successes++;
      if (state.successes >= this.config.successThreshold) {
        state.status = 'closed';
        state.failures = 0;
      }
    } else {
      state.failures = Math.max(0, state.failures - 1);
    }
  }

  recordFailure(key: string): void {
    const state = this.getState(key);
    state.failures++;
    state.lastFailure = new Date();
    if (state.failures >= this.config.failureThreshold) {
      state.status = 'open';
      state.nextAttempt = new Date(Date.now() + this.config.timeout);
    }
  }
}
```

### 7.3 Model Routing & Cost Optimization

```typescript
interface ModelConfig {
  name: string;
  provider: 'mistral' | 'openai' | 'anthropic';
  costPer1kTokens: { input: number; output: number };
  maxTokens: number;
  latencyMs: { p50: number; p95: number };
  capabilities: string[];
}

const modelConfigs: ModelConfig[] = [
  {
    name: 'mistral-small',
    provider: 'mistral',
    costPer1kTokens: { input: 0.0002, output: 0.0006 },
    maxTokens: 8192,
    latencyMs: { p50: 200, p95: 500 },
    capabilities: ['classification', 'simple-generation']
  },
  {
    name: 'mistral-medium',
    provider: 'mistral',
    costPer1kTokens: { input: 0.0027, output: 0.0081 },
    maxTokens: 32768,
    latencyMs: { p50: 400, p95: 1000 },
    capabilities: ['classification', 'generation', 'reasoning']
  },
  {
    name: 'mistral-large',
    provider: 'mistral',
    costPer1kTokens: { input: 0.008, output: 0.024 },
    maxTokens: 128000,
    latencyMs: { p50: 600, p95: 1500 },
    capabilities: ['classification', 'generation', 'reasoning', 'complex-tasks']
  }
];

class ModelRouter {
  selectModel(operation: string, requirements: ModelRequirements): ModelConfig {
    const candidates = modelConfigs.filter(m =>
      requirements.capabilities.every(c => m.capabilities.includes(c))
    );

    if (operation === 'classify' || operation === 'simple-generate') {
      return candidates.sort((a, b) =>
        a.costPer1kTokens.input - b.costPer1kTokens.input
      )[0];
    }

    return candidates[0];
  }
}
```

### 7.4 Comprehensive Telemetry

```typescript
interface LLMTelemetryEvent {
  correlationId: string;
  traceId: string;
  spanId: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
  operation: string;
  agent?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  success: boolean;
  errorType?: string;
  confidence?: number;
  hallucinationFlags?: string[];
  timestamp: Date;
}

@Injectable()
export class LlmTelemetryService {
  async trackCall<T>(
    operation: string,
    correlationId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const span = this.tracer.startSpan(`llm.${operation}`);
    const startTime = Date.now();

    try {
      const result = await fn();
      const latency = Date.now() - startTime;

      this.latencyHistogram.record(latency, { operation });
      this.requestCounter.add(1, { operation, status: 'success' });

      if (result.usage) {
        this.tokenCounter.add(result.usage.totalTokens, { operation });
        this.costCounter.add(this.calculateCost(result.usage), { operation });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      this.errorCounter.add(1, { operation, errorType: error.constructor.name });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }
}
```

### 7.5 Dashboards & Alerts

**Metrics to Track**:

| Metric | Description |
|--------|-------------|
| `llm.latency.p95` | P95 latency in milliseconds |
| `llm.requests.rate` | Requests per second |
| `llm.tokens.total` | Total tokens used |
| `llm.cost.total` | Total cost in USD |
| `llm.errors.rate` | Error rate percentage |
| `llm.queue.depth` | Current queue depth |
| `llm.circuit.state` | Circuit breaker state |
| `hitl.pending.count` | Pending actions count |
| `hitl.approval.rate` | Approval rate percentage |

**Alert Rules**:

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Latency | `llm.latency.p95 > 3000` | Warning |
| High Error Rate | `llm.errors.rate > 5%` | Critical |
| Circuit Open | `llm.circuit.state == open` | Critical |
| Queue Backlog | `llm.queue.depth > 100` | Warning |
| Cost Budget | `llm.cost.total > budget * 0.8` | Warning |

---

## 8. Human-in-the-Loop Design

> **Sources**: [Google Cloud HITL](https://cloud.google.com/discover/human-in-the-loop), [IBM HITL](https://www.ibm.com/think/topics/human-in-the-loop), [Stanford HAI](https://hai.stanford.edu/news/humans-loop-design-interactive-ai-systems)

### 8.1 HITL Patterns

**Elicitation Middleware (MCP-style)**:

- Agents pause mid-task to request user input
- Structured "wait-for-human" step in execution flow
- Useful for decisions with ambiguity or requiring validation

**Approval Pipelines**:

- AI outputs routed to human for review before finalization
- Common in content generation and decision support systems

**Active Learning & Feedback Loops**:

- Human corrections treated as valuable training data
- Systems improve over time, adapting to user preferences

### 8.2 When to Apply HITL

| Scenario | HITL Required |
|----------|---------------|
| High-stakes decisions | Always |
| Complex judgment needed | Yes |
| Ethical considerations | Yes |
| Final approval for compliance | Yes |
| Routine low-risk actions | Optional (based on confidence) |

### 8.3 Severity-Based Approval

```typescript
enum ActionSeverity {
  LOW = 'LOW',       // Auto-approve eligible
  MEDIUM = 'MEDIUM', // Moderate confidence needed
  HIGH = 'HIGH'      // Always requires approval
}

const severityConfig = {
  [ActionSeverity.LOW]: {
    autoApproveThreshold: 0.7,
    actions: ['SEARCH_EMAILS', 'GET_CONTACTS', 'SUMMARIZE']
  },
  [ActionSeverity.MEDIUM]: {
    autoApproveThreshold: 0.85,
    actions: ['MARK_READ', 'STAR_EMAIL', 'CREATE_FOLDER']
  },
  [ActionSeverity.HIGH]: {
    autoApproveThreshold: null, // Never auto-approve
    actions: ['SEND_EMAIL', 'DELETE_EMAIL', 'FORWARD_EMAIL']
  }
};
```

---

## 9. Tenant-User Isolation

### 9.1 Data Isolation Model

```text
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
│  │              Tenant-Wide Shared Resources              │  │
│  │  • PromptRegistry (tenant-scoped templates)            │  │
│  │  • Embeddings (filtered by tenantId)                   │  │
│  │  • AggregateStats (anonymized, tenant-level)           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Isolation Enforcement

| Layer | Enforcement | Implementation |
|-------|-------------|----------------|
| Controller | TenantGuard | `@UseGuards(JwtAuthGuard, TenantGuard)` |
| Service | Query filter | `WHERE tenantId = $1 AND userId = $2` |
| Database | Index | `@@index([tenantId, userId])` |
| Embeddings | Metadata filter | `filter: { tenantId: 'xxx' }` |
| Logs | Redaction | PII stripped, tenant tagged |

### 9.3 Security Checklist

```typescript
class BaseService {
  protected assertTenantAccess(entity: { tenantId: string }, context: AgentContext) {
    if (entity.tenantId !== context.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  protected assertUserAccess(
    entity: { userId: string },
    context: AgentContext,
    allowAdmin = true
  ) {
    if (entity.userId !== context.userId) {
      if (!allowAdmin || !['admin', 'super-admin'].includes(context.userRole)) {
        throw new ForbiddenException('Cross-user access denied');
      }
    }
  }
}
```

---

## 10. Backend Implementation Roadmap

### Phase B1: Foundation Hardening (P0)

**Duration**: Week 1-2

#### B1.1 Action Execution Result Contract

```typescript
interface ActionExecutionResult {
  success: boolean;
  summary: string;           // REQUIRED: User-facing message
  summaryLocale: string;     // REQUIRED: Locale of summary
  data?: Record<string, any>;
  error?: string;
  errorCode?: string;
  executionTimeMs: number;
  metadata?: {
    itemCount?: number;
    affectedIds?: string[];
    warnings?: string[];
  };
}
```

**Tasks**:

- [ ] Define strict `ActionExecutionResult` interface
- [ ] Create `createExecutionResult()` factory with validation
- [ ] Audit all executor branches and add summaries
- [ ] Remove placeholder success returns
- [ ] Add unit tests for every executor branch

#### B1.2 Locale Centralization

**Tasks**:

- [ ] Create `LocaleService` with centralized string maps
- [ ] Define summary templates for all action types
- [ ] Migrate all agents to use `LocaleService`
- [ ] Add fallback chain: provided locale → user preference → `en`
- [ ] Add locale coverage tests

#### B1.3 Dependency Validation

**Tasks**:

- [ ] Replace `@Optional()` with explicit capability checks
- [ ] Create `CapabilityService` for provider/feature availability
- [ ] Add preflight checks before action execution
- [ ] Return structured errors with suggestions
- [ ] Update HITL to mark FAILED with error summary

### Phase B2: Resilience & Observability (P1)

**Duration**: Week 3-4

#### B2.1 LLM Queue Integration

**Tasks**:

- [ ] Wrap all LLM calls through `AIQueueService`
- [ ] Configure per-tenant rate limits
- [ ] Add timeout handling (default 30s)
- [ ] Implement retry with exponential backoff
- [ ] Add dead-letter queue for failed jobs

#### B2.2 Circuit Breaker & Telemetry

**Tasks**:

- [ ] Implement circuit breaker for Mistral API
- [ ] Wire `LlmTelemetryService.trackCall()` into all LLM operations
- [ ] Add correlation IDs to all log messages
- [ ] Implement token counting
- [ ] Track cost per tenant/user/operation

### Phase B3: Safety & Idempotency (P1)

**Duration**: Week 5-6

**Tasks**:

- [ ] Add `idempotencyKey` field to `AgentPendingAction`
- [ ] Compute hash from normalized payload
- [ ] Check for existing action before creating
- [ ] Create capability registry mapping actions to requirements
- [ ] Implement provider resolution: user → tenant default
- [ ] Create `SanitizationService` with configurable rules

### Phase B4: Memory & Context (P2)

**Duration**: Week 7-8

**Tasks**:

- [ ] Implement token estimation
- [ ] Add budget tracking to `MemoryService`
- [ ] Implement LLM-based conversation summarization
- [ ] Add cron job for session cleanup
- [ ] Implement embedding cache TTL

### Phase B5: Tool Registry (P2)

**Duration**: Week 9-10

**Tasks**:

- [ ] Create `ToolRegistry` class with registration
- [ ] Define Zod schemas for all action types
- [ ] Generate LLM tool specs from registry
- [ ] Replace executor switch with registry dispatch
- [ ] Migrate all agent prompts to prompt registry

---

## 11. Frontend Implementation Roadmap

### Phase F1: AI Compose Enhancement

**Duration**: Week 1-2

**Components**:

- Enhanced `AiComposeDialog` with context awareness
- `AiComposePanel` (collapsible side panel)
- Example prompts based on context

### Phase F2: Dashboard AI Widgets

**Duration**: Week 3-4

**Components**:

- `LearningDashboard` showing AI accuracy trends
- `PendingActionsInline` for email list
- Real-time action status updates

### Phase F3: Localization

**Duration**: Week 5

**New i18n Keys**:

```typescript
{
  dashboard: {
    email: {
      composer: {
        aiComposeTitle: 'Draft with AI',
        aiComposePrompt: 'What would you like to write?',
        aiComposeToneLabel: 'Tone',
        aiComposeUseMyStyle: 'Use my writing style',
        aiComposeGenerate: 'Generate',
        aiComposeInsert: 'Insert into email'
      }
    },
    ai: {
      learningDashboard: {
        title: 'AI Learning Progress',
        approvalRate: 'Approval Rate',
        successRate: 'Success Rate',
        actionsToday: 'Actions Today'
      }
    }
  }
}
```

---

## 12. Testing Strategy

### 12.1 Test Pyramid

```text
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲         (5%)
                 ╱──────╲
                ╱        ╲
               ╱Integration╲     (20%)
              ╱────────────╲
             ╱              ╲
            ╱   Unit Tests   ╲   (75%)
           ╱──────────────────╲
```

### 12.2 Test Categories

**Contract Tests**:

- Executor summaries per locale/action
- HITL approve/reject paths return deterministic messages
- Action idempotency under retries
- Tool registry validation

**Integration Tests**:

- Multi-agent process happy paths
- Missing provider handling
- Locale variations
- Queue-enabled vs direct mode

**Load Tests**:

- Controller throttling under load
- AI queue throughput
- Concurrent action execution

**Chaos Tests**:

- LLM timeout handling
- Circuit breaker activation
- Partial execution failures

### 12.3 Coverage Targets

| Component | Target |
|-----------|--------|
| Prompt Registry Service | 90% |
| Writing Style Service | 85% |
| Multi-Agent Service | 90% |
| HITL Service | 95% |
| Agent Base Classes | 80% |
| Controllers | 85% |

---

## 13. Success Metrics & KPIs

| Metric | Target |
|--------|--------|
| Executor summary coverage | 100% |
| Localized paths success | >99% |
| Duplicate action rate | <0.5% |
| Queue job success | >98% |
| LLM timeout fallback success | >95% |
| P95 end-to-end latency | <3s |
| Intent cache hit rate | >30% |
| Cost tracking accuracy | >95% |
| HITL approval rate tracked | Yes |
| Failed vs executed ratio visible | Yes |

---

## 14. References

### Multi-Agent Architecture

- [Microsoft - Designing Multi-Agent Intelligence](https://devblogs.microsoft.com/blog/designing-multi-agent-intelligence)
- [MarkTechPost - Top 5 AI Agent Architectures 2025](https://www.marktechpost.com/2025/11/15/comparing-the-top-5-ai-agent-architectures-in-2025-hierarchical-swarm-meta-learning-modular-evolutionary/)
- [orq.ai - AI Agent Architecture 2025](https://orq.ai/blog/ai-agent-architecture)
- [Botpress - Guide to Multi-Agent Systems](https://botpress.com/blog/multi-agent-systems)

### LLM Orchestration

- [orq.ai - LLM Orchestration Best Practices](https://orq.ai/blog/llm-orchestration)
- [ZenML - LLM Agents in Production](https://www.zenml.io/blog/llm-agents-in-production-architectures-challenges-and-best-practices)
- [Neptune.ai - LLM Observability](https://neptune.ai/blog/llm-observability)

### Hallucination Prevention

- [AWS - Reducing Hallucinations with Bedrock Agents](https://aws.amazon.com/blogs/machine-learning/reducing-hallucinations-in-large-language-models-with-custom-intervention-using-amazon-bedrock-agents/)
- [Voiceflow - 5 Proven Strategies](https://www.voiceflow.com/blog/prevent-llm-hallucinations)
- [K2View - Grounding AI](https://www.k2view.com/blog/grounding-ai/)

### Human-in-the-Loop

- [Google Cloud - What is HITL](https://cloud.google.com/discover/human-in-the-loop)
- [IBM - Human in the Loop](https://www.ibm.com/think/topics/human-in-the-loop)
- [Stanford HAI - Humans in the Loop Design](https://hai.stanford.edu/news/humans-loop-design-interactive-ai-systems)

### Tool/Function Calling

- [Google Cloud - Function Calling](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling)
- [Prompt Engineering Guide - Function Calling](https://www.promptingguide.ai/applications/function_calling)
- [Analytics Vidhya - Function Calling with Mistral](https://www.analyticsvidhya.com/blog/2024/10/function-calling-in-ai-agents-using-mistral-7b/)

---

**Document Version:** 3.0
**Last Updated:** 2025-11-28
**Author:** Claude Code
**Next Review:** 2025-12-15
