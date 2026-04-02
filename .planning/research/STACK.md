# Technology Stack: Email Triage & Classification

**Project:** PMSync -- Smart Views & Email Triage Enhancement
**Researched:** 2026-04-02

## Scope

This document covers the technology decisions specifically for enhancing PMSync's email triage/classification system, informed by competitor analysis. No new frameworks or major dependencies are needed -- all enhancements use existing stack components.

## Recommended Stack (No New Dependencies)

### Classification Pipeline

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Mistral Small (`mistralai/mistral-small-2603`) | Current | LLM-based email classification | Already configured as `AI_MODEL_SIMPLE`. Fast, cheap, sufficient for classification tasks. Superhuman uses OpenAI, Shortwave uses Claude -- both more expensive. Mistral Small is the right tradeoff for per-email classification. |
| `EmailAnalysisService` (existing) | N/A | Classification orchestration | Already evaluates emails against per-label `aiPrompt`. Needs batching optimization (single call with all prompts vs. N calls). |
| `TriageOnboardingRules` contract (existing) | v1 | Onboarding input -> prompt generation | Already defines the 7 onboarding fields and prompt builders. Frontend wizard is the missing piece, not backend logic. |
| PostgreSQL + Prisma (existing) | Prisma 7 | Sender override storage | New `SenderLabelOverride` table for deterministic sender-to-label mappings. Standard Prisma model -- no new tech. |
| Redis + ioredis (existing) | N/A | Classification result cache | Cache label assignments per email ID with TTL. Prevents re-classification on re-renders. Already used for triage learning signals. |
| BullMQ (existing) | 5.67.3 | Async classification jobs | Queue email classification as background jobs. Already used for email sync. Add a `CLASSIFICATION` queue with moderate priority. |

### Frontend Components

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| MUI (existing) | v6 | Smart Views UI, wizard, label badges | All UI components use MUI per CLAUDE.md. No Tailwind utilities. Smart Views are filtered DataGrid/List views. |
| TanStack Query (existing) | v5 | Smart View data fetching | `queryOptions()` pattern with `staleTime: 5min`. Smart Views are query-driven: label filter + lane filter -> email list. |
| Zustand (existing) | v5 | Active view state | Track which Smart View is active, filter state, sort order. Lightweight store -- no new state library. |
| React 19 (existing) | 19.x | Component framework | Smart Views, wizard steps, label correction UI. Use `React.lazy` for wizard (non-critical path). |

### No New Dependencies Needed

| What Competitors Use | Why PMSync Does Not Need It |
|---------------------|----------------------------|
| OpenAI API (Superhuman) | Mistral Small is cheaper and sufficient for classification. No model switch needed. |
| Claude API (Shortwave) | Same as above. Would add a second LLM provider dependency. |
| Custom ML model (SaneBox, Spark) | LLM-based classification with per-label prompts is more flexible than a custom ML model. Training data and model ops overhead not justified for solo dev. |
| Drag-and-drop library (SaneBox folder training) | MUI already supports drag interactions. Label correction is a click action, not drag-and-drop. |
| Notification system (Google Inbox) | WebSocket via Socket.IO + Redis adapter already handles real-time updates. |

## Architecture Decisions

### Decision 1: Batch Classification (Single LLM Call Per Email)

**Instead of:** One LLM call per label per email (current naive approach).

**Do:** Combine all active label `aiPrompt` values into a single classification prompt. Ask the LLM to return which labels apply.

**Rationale:** Superhuman caps at 10 custom labels. PMSync has 10 defaults. With batching, one email = one LLM call regardless of label count. Without batching, one email = 10+ calls.

**Template:**

```
Given this email, classify it into the applicable labels.
Return ONLY a JSON array of matching label slugs.

Email:
From: {from}
Subject: {subject}
Body (first 500 chars): {body}

Labels:
- "important": {aiPrompt for Important}
- "follow-up": {aiPrompt for Follow-up}
- "action-items": {aiPrompt for Action Items}
... (all active labels)

Rules:
- Maximum 3 labels per email
- These labels are mutually exclusive: {exclusivity rules}
- Labels with suppressUrgency=true should not appear with priority labels

Response format: ["label-slug-1", "label-slug-2"]
```

### Decision 2: Sender Override Table (L1 Cache)

**Instead of:** Running LLM classification on every email including known senders.

**Do:** Check `SenderLabelOverride` table first. If sender has an override, skip LLM entirely.

**Schema:**

```prisma
model SenderLabelOverride {
  id        String   @id @default(cuid())
  tenantId  String
  sender    String   // email address or domain
  labelId   String
  source    String   // 'user_correction' | 'onboarding' | 'auto_learned'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  label     UserLabel @relation(fields: [labelId], references: [id])

  @@unique([tenantId, sender, labelId])
  @@index([tenantId, sender])
}
```

**Rationale:** SaneBox and Shortwave both use sender memory as their primary classification mechanism. It is fast (DB lookup vs. LLM call), deterministic (no model variance), and trainable (user corrections feed it). LLM classification is the fallback for unknown senders.

### Decision 3: Classification Queue (BullMQ)

**Instead of:** Synchronous classification during email sync.

**Do:** Queue classification as a separate BullMQ job after sync completes. Priority: below email sync, above analytics.

**Rationale:** Email sync must be fast (user sees new emails immediately). Classification can follow 1-3 seconds later. If classification blocks sync, new email delivery latency increases. Shortwave and Superhuman both classify asynchronously.

**Exception:** Sender override lookups are synchronous (fast DB query). Only LLM classification is queued.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Classification model | Mistral Small (existing) | OpenAI GPT-4o-mini | Adds second LLM provider. Mistral Small is comparable for classification. Cost and latency similar. |
| Sender memory | PostgreSQL table | Redis sorted set | Sender overrides need persistence across restarts. Redis is volatile by default. PostgreSQL is the durable store. Redis is used only as read cache. |
| Onboarding UX | Wizard (2-field quick + 7-field full) | Auto-detect from email scan | Auto-detect requires scanning user's existing emails which may be slow and raises privacy concerns. Wizard gives user explicit control. |
| Classification trigger | BullMQ async job | Synchronous in sync pipeline | Sync must be fast. Classification adds 1-5 seconds of LLM latency per email. Queue decouples the two. |
| Smart Views backend | Query-based (label + lane filter) | Materialized views | Materialized views add cache invalidation complexity. Query-based with proper indexes is sufficient at PMSync's scale. |
| Label correction UX | Click-to-change label | Drag-to-folder (SaneBox-style) | PMSync is not folder-based. Labels are metadata on emails, not folder destinations. Click-to-change is more natural in a label-based system. |

## Installation

```bash
# No new packages needed.
# All enhancements use existing stack.

# Verify existing dependencies:
cd backend && npm ls @prisma/client bullmq ioredis
cd frontend && npm ls @tanstack/react-query zustand @mui/material
```

## Sources

- [Superhuman Auto Labels](https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels) -- Max 10 custom labels, AI prompt criteria
- [Shortwave Magic Labels](https://www.shortwave.com/blog/magic-labels-custom-bundles/) -- Sender memory approach
- [SaneBox Training](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox) -- Header-only ML, drag-to-train
- [Shortwave vs Superhuman (Zapier)](https://zapier.com/blog/shortwave-vs-superhuman/) -- LLM model choices (Shortwave uses Claude)
- [Superhuman AI feature showcase](https://blog.superhuman.com/superhuman-ai-feature-showcase/) -- Auto Labels + Auto Drafts architecture
- PMSync codebase: `email-analysis.service.ts`, `triage-onboarding.contract.ts`, `default-user-labels.ts`, `triage-learning.service.ts`
