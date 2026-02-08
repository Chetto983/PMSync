# v3.0 Roadmap: AI Intelligence & Scalability

## Overview

**Version:** v3.0
**Goal:** Overhaul AI infrastructure for speed, reliability, and intelligent email management
**Total Phases:** 12
**Total Requirements:** 19

**Key deliverables:**
- Clean VoltAgent integration with modern patterns
- Streaming AI chat with Vercel AI SDK
- Auto-triage with priority scoring and learning
- Refactored follow-ups UI with smart timing
- Nested labels frontend (tree view + drag-drop)
- Email tool triage data exposure (priority, labels, sentiment, follow-ups)

## Requirements Summary

| ID | Requirement | Phase |
|----|-------------|-------|
| INFRA-01 | VoltAgent audit and alignment with official patterns | 01 |
| INFRA-02 | Tool consolidation (remove duplicates) | 01 |
| INFRA-03 | AI scalability improvements for concurrent requests | 01 |
| CHAT-01 | Vercel AI SDK streaming integration | 02 |
| CHAT-02 | Contextual suggested prompts | 02 |
| CHAT-03 | Mobile-responsive chat design | 02 |
| TRIAGE-01 | Priority scoring model (0-100) | 03 |
| TRIAGE-02 | VIP lists (user-defined + AI-suggested) | 03 |
| TRIAGE-03 | Learning from user actions | 03 |
| FOLLOW-01 | Follow-ups UI refactor with two types | 04 |
| FOLLOW-02 | Smart timing suggestions + NLP detection | 04 |
| LABELS-01 | Nested labels tree view with drag-drop | 05 |
| CHATUI-01 | Chat UI improvements and agent tool on mail | 06 |
| CHAT-04 | Chat improvement features | 07 |
| TOOL-01 | Email tool triage data exposure (priority, labels, sentiment, follow-ups) | 08 |
| ARTIFACT-01 | Smart tool result renderers replacing raw JSON in chat UI | 09 |
| REVIEW-01 | UI review and visual polish pass | 10 |
| AUDIT-01 | AI module audit (dead code, file splits, tests, perf fixes) | 11 |
| FIX-01 | Fix failing ActionExecutor tests + emailType display | 12 |
| FIX-02 | WCAG aria-input-field-name fix for ComposeDialog | 12 |

## Phase Summary

| Phase | Name | Requirements | Plans | Status |
|-------|------|--------------|-------|--------|
| 01 | AI Infrastructure Cleanup | INFRA-01/02/03 | 3/3 | ✅ COMPLETE |
| 02 | AI Chat Overhaul | CHAT-01/02/03 | 4/4 | ✅ COMPLETE |
| 03 | Auto-Triage Core | TRIAGE-01/02/03 | 3/3 | ✅ COMPLETE |
| 04 | Follow-Ups Refactor | FOLLOW-01/02 | 2/3 | ⏳ GAP CLOSURE |
| 05 | Nested Labels Frontend | LABELS-01 | 2/2 | ✅ COMPLETE |
| 06 | Chat UI and Agent Tool on Mail | CHATUI-01 | 5/5 | ✅ COMPLETE |
| 07 | Chat Improvement | CHAT-04 | 6/6 | ✅ COMPLETE |
| 08 | Email Tool Triage Exposure | TOOL-01 | 2/2 | ✅ COMPLETE |
| 09 | Chat Artifact Smart Renderers | ARTIFACT-01 | informal | ✅ COMPLETE |
| 10 | UI Review | REVIEW-01 | 8/8 | ✅ COMPLETE |
| 11 | AI Module Audit | AUDIT-01 | 5/5 | ✅ COMPLETE |
| 12 | Test Fixes + Minor Gaps | FIX-01/02 | 0/2 | ⏳ GAP CLOSURE |

---

## Phase 01: AI Infrastructure Cleanup

**Goal:** Clean technical foundation before adding new AI features

**Status:** COMPLETE

**Requirements:**
- INFRA-01: VoltAgent audit and alignment with official patterns
- INFRA-02: Tool consolidation (remove duplicates)
- INFRA-03: AI scalability improvements for concurrent requests

**Why first:** Technical debt cleanup prevents accumulation. Chat and auto-triage depend on clean VoltAgent integration.

**Known issues to address:**
- Chat is slow (context loading, RAG queries)
- Lost messages (conversation persistence issues)
- Duplicate tools across VoltAgent and AI services
- Scalability bottlenecks under concurrent requests

**Plans:** 3 plans
- [x] 02-01-PLAN.md - VoltAgent audit against official documentation
- [x] 02-02-PLAN.md - Tool consolidation and deduplication
- [x] 02-03-PLAN.md - Scalability improvements (caching, connection pooling)

**Deliverables:**
- Audit report with findings and fixes
- Consolidated tool registry (no duplicates)
- Documented scalability improvements
- Performance benchmarks (before/after)

---

## Phase 02: AI Chat Overhaul

**Goal:** Modern streaming chat experience with graceful error handling

**Status:** COMPLETE

**Requirements:**
- CHAT-01: Vercel AI SDK streaming integration (already working, needs circuit breaker)
- CHAT-02: Contextual suggested prompts based on current view
- CHAT-03: Mobile-responsive chat design (375px+)

**Dependencies:** Phase 01 (clean VoltAgent required)

**Why second:** Chat is the primary AI interface. Fixing it early impacts all subsequent AI features.

**Research findings (from FEATURES.md):**
- First token target: <500ms (Superhuman benchmark)
- Token streaming: 20-50 tokens/second
- Pure chat is losing favor - prefer structured UI + AI suggestions

**Plans:** 4 plans
- [x] 02-01-PLAN.md - Circuit breaker integration + retry UI (VOLT-01)
- [x] 02-02-PLAN.md - Contextual prompts + view context passing
- [x] 02-03-PLAN.md - Mobile full-screen chat + iOS viewport fixes
- [x] 02-04 - AI SDK v6 fixes (tool rendering, mobile close button)

**Wave Structure:**
- Wave 1: 02-01, 02-02 (parallel - no file conflicts) ✓
- Wave 2: 02-03 (depends on 02-01 for error handling) ✓

**Deliverables:**
- Streaming chat with <500ms first token ✓
- Context-aware suggested prompts per view ✓
- Mobile-optimized full-screen chat modal ✓
- Graceful error handling with retry ✓

---

## Phase 03: Auto-Triage Core

**Goal:** AI-powered email prioritization and importance scoring

**Status:** COMPLETE

**Requirements:**
- TRIAGE-01: Priority scoring model (0-100 scale)
- TRIAGE-02: VIP lists (user-defined + AI-suggested)
- TRIAGE-03: Learning from user actions (open/reply patterns)

**Dependencies:** Phase 01 (scalable RAG required for scoring) ✓

**Why third:** Auto-triage is the core v3.0 value proposition. Priority scoring enables all future triage features.

**Research findings (from FEATURES.md):**
- Superhuman reports 150% faster email processing with auto-triage
- Target: 90% accuracy after 1 week learning (94% at 2 weeks)
- Score calculation: <50ms per email (batch during sync)

**Technical approach:**
- Use existing aiPriority (1-5) field — no new schema fields needed
- AttentionScoreService (0.0-1.0) maps to aiPriority (1-5) internally
- Contact.isVip integrated into attention scoring
- Background BullMQ nightly recalculation using learned weights
- Implicit signal tracking (reply, archive, flag patterns) for sender importance

**Plans:** 3 plans

- [x] 03-01-PLAN.md — Priority scoring activation: VIP boost in AttentionScoreService + backfill hardening
- [x] 03-02-PLAN.md — VIP lists management: cache invalidation on toggle + AI-suggested VIPs endpoint
- [x] 03-03-PLAN.md — Learning engine: implicit signal tracking service + nightly recalculation mode

**Wave Structure:**

- Wave 1: 03-01 (foundation — scoring pipeline active with VIP integration) ✓
- Wave 2: 03-02, 03-03 (parallel — VIP management and learning engine) ✓

**Deliverables:**

- Priority score on every email (via existing aiPriority field) ✓
- VIP boost in triage scoring ✓
- AI-suggested VIP contacts endpoint ✓
- Implicit learning from user actions (reply/archive/flag) ✓
- Nightly recalculation updating stale priorities ✓
- Email list showing importance indicators ✓

---

## Phase 04: Follow-Ups Refactor

**Goal:** Complete redesign of follow-ups UI with smart features

**Status:** COMPLETE

**Requirements:**
- FOLLOW-01: Follow-ups UI refactor with two types (Waiting For / To Do)
- FOLLOW-02: Smart timing suggestions + NLP deadline detection

**Dependencies:** None (independent module)

**Why fourth:** Follow-ups is broken/underused. High user value with moderate complexity.

**Research findings (from FEATURES.md):**
- Single follow-up doubles response rate (16% -> 27%)
- Sweet spot: 2-3 days after initial send
- Automatic detection of "Please respond by Friday" patterns

**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — UI refactor: FollowUpType enum (WAITING_FOR/TODO), type detection, filter toggle, type badges
- [x] 04-02-PLAN.md — Smart timing + NLP deadline: chrono-node extraction, deadline display, smart timing API
- [ ] 04-03-PLAN.md — SnoozeDialog UI: wire useSmartTiming hook, custom date picker (gap closure)

**Wave Structure:**
- Wave 1: 04-01 (schema + backend + frontend types) ✓
- Wave 2: 04-02 (NLP + smart timing, depends on 04-01) ✓
- Wave 3: 04-03 (SnoozeDialog UI, depends on 04-02)

**Deliverables:**
- Follow-up types: Waiting For / To Do ✓
- Type filter toggle in Kanban header ✓
- Type badges on follow-up cards ✓
- Auto-detected deadlines from email text (chrono-node NLP) ✓
- Smart timing recommendation in snooze dialog

---

## Phase 05: Nested Labels Frontend

**Goal:** Tree view UI for label hierarchy management

**Requirements:**
- LABELS-01: Nested labels tree view with drag-drop and hierarchical search

**Dependencies:** None (backend API shipped in v2.1 API-01)

**Why fifth:** Backend already done. Frontend completes the feature.

**Research findings (from FEATURES.md):**
- Users expect folder-like behavior with nested search
- Max depth: 5 levels (prevent over-complexity)
- MUI X Rich Tree View recommended (already using MUI)

**Status:** COMPLETE

**Plans:** 2 plans

- [x] 05-01-PLAN.md — Tree view foundation: utils, store, components, dialog updates, backend subtree delete
- [x] 05-02-PLAN.md — Drag-drop nesting/reordering, context menu enhancements, label search

**Wave Structure:**

- Wave 1: 05-01 (tree rendering foundation)
- Wave 2: 05-02 (DnD + interactions, depends on 05-01)

**Deliverables:**
- Tree view in sidebar with visual hierarchy
- Drag-drop to nest/reorder labels
- Search includes child labels automatically

---

## Phase 06: Chat UI and Agent Tool on Mail

**Goal:** Enhanced chat interface with agent tool integration for email actions

**Status:** COMPLETE

**Requirements:**
- CHATUI-01: Chat UI improvements and agent tool on mail

**Dependencies:** Phase 02 (AI Chat Overhaul)

**Why sixth:** Builds on chat infrastructure from Phase 02. Extends chat with actionable email tools.

**Plans:** 5 plans

- [x] 06-01-PLAN.md — Context-aware email quick actions in AI chat
- [x] 06-02-PLAN.md — Slide-in chat panel with FAB for email threads
- [x] 06-03-PLAN.md — Tool rendering improvements and email context in prompts
- [x] 06-04-PLAN.md — Email context wiring to unified prompt
- [x] 06-05-PLAN.md — ViewContext parameter chain completion (gap closure)

**Wave Structure:**
- Wave 1: 06-01, 06-02 (parallel - no file conflicts)
- Wave 2: 06-03, 06-04 (tool rendering + email context)
- Wave 3: 06-05 (gap closure - parameter chain)

**Deliverables:**
- Email-specific quick actions when viewing threads ✓
- Floating AI button (FAB) on email thread pages ✓
- Slide-in chat panel with email context ✓
- Improved tool execution visual feedback ✓
- AI understands "this email" context ✓

---

## Phase 07: Chat Improvement

**Goal:** Modernize AiDashboard architecture and enhance visual design to match 2025 AI chat standards (Claude, ChatGPT)

**Status:** COMPLETE

**Requirements:**
- CHAT-04: Chat improvement features
  - AiDashboard monolith split (954 lines → 5 files <500 lines)
  - Modern message bubble design (borderless, Claude-style)
  - Wire unused ai-elements components (Reasoning, Shimmer, MessageActions, Artifact, ChainOfThought)
  - Smart scroll behavior (stop auto-scroll when user scrolls up)
  - Theme-compliant colors (fix hardcoded hex in QuickActions)
  - Compact header (80px → 48-56px)

**Dependencies:** Phase 06 (Chat UI and Agent Tool on Mail)

**Why seventh:** Builds on completed chat infrastructure from Phases 02 and 06. Addresses 954-line monolith violation and dated UI patterns.

**Plans:** 6 plans

- [x] 07-01-PLAN.md — AiDashboard monolith split: useChatController, ChatArea, DesktopLayout, MobileLayout
- [x] 07-02-PLAN.md — Modern message bubbles + useChatScroll hook + scroll-to-bottom button
- [x] 07-03-PLAN.md — Wire Reasoning/Shimmer components, replace TypingIndicator
- [x] 07-04-PLAN.md — Wire MessageActions hover bar, fix QuickActions hardcoded colors
- [x] 07-05-PLAN.md — Wire Artifact, ChainOfThought, Sources for structured output
- [x] 07-06-PLAN.md — Compact header + human verification checkpoint

**Wave Structure:**
- Wave 1: 07-01, 07-02 (parallel - different files: index.tsx vs ChatMessages.tsx)
- Wave 2: 07-03, 07-04, 07-05 (parallel - all modify ChatMessages.tsx, depend on 07-02)
- Wave 3: 07-06 (depends on all previous, has human verification gate)

**Deliverables:**
- AiDashboard split into 5 maintainable files (<500 lines each)
- Modern Claude/ChatGPT-style message bubbles
- Smart scroll with scroll-to-bottom button
- Shimmer typing indicator (replace bouncing dots)
- MessageActions hover bar (Copy, Regenerate, Feedback)
- Artifact panels for drafts and code blocks
- ChainOfThought for multi-tool sequences
- Compact header (~48-56px)
- Theme-compliant colors throughout

---

## Phase 08: Email Tool Triage Exposure

**Goal:** Fix the write-but-never-read antipattern: all VoltAgent email listing tools are blind to AI triage data (priority, sentiment, labels, follow-ups) that is already computed and stored in the database.

**Status:** COMPLETE

**Requirements:**
- TOOL-01: Email tool triage data exposure — add aiPriority, aiSentiment, aiLabels, labels, followUp to all email listing/content select statements; add filter parameters (priority, label, needsFollowUp) to listing tools; create a follow-up listing tool

**Dependencies:** Phase 01 (clean VoltAgent tools required)

**Why eighth:** Audit revealed every email listing tool ignores saved triage fields. The system does expensive AI analysis, persists to DB, and then every tool that lists emails pretends the data doesn't exist. Critical blocker for Phases 03 (Auto-Triage) and 04 (Follow-Ups).

**Audit findings (2026-02-07):**
- 6 email listing tools tested, ALL missing aiPriority/aiSentiment/aiLabels/followUp
- Only `analyze_email` returns triage data (on-demand LLM call, not DB read)
- `EmailFollowUp` model never queried by any tool
- Agent cannot answer "show me urgent emails" or "what needs follow-up"

**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md — Triage fields in all email tool selects + DB index
- [x] 08-02-PLAN.md — Filter params on listing tools + list_follow_ups tool

**Deliverables:**
- All email listing tools include triage fields in select
- Filter by priority/label/followUp in list_emails and list_email_index
- New follow-up listing tool (or mode) querying EmailFollowUp
- Agent can answer priority/label/sentiment/follow-up questions from DB reads

---

## Phase 09: Chat Artifact Smart Renderers

**Goal:** Replace raw JSON tool result rendering in chat with semantic, tool-specific UI components. Each tool type gets a custom renderer (email lists, follow-ups, contacts, events, etc.) instead of dumping JSON code blocks.

**Status:** COMPLETE (built informally — no formal plans, needs verification)

**Requirements:**
- ARTIFACT-01: Smart tool result renderers — registry-based system mapping toolName to custom React components; renderers for email list, email content, follow-ups, contacts, events, counts, folders, analysis, memory; improved fallback for unknown tools; hidden parameters; collapsible raw JSON debug

**Dependencies:** Phase 07 (Chat Improvement — ai-elements components wired)

**Why ninth:** Current tool cards dump raw JSON for parameters and results — looks like a developer debug panel. Users see `{"message": "No pending follow-ups found.", "followUps": []}` instead of a clean empty state. Directly impacts perceived quality of the AI chat experience.

**Inspiration:** [assistant-ui](https://github.com/assistant-ui/assistant-ui) `makeAssistantToolUI` pattern — custom React renderers per tool type.

**Plans:** Built informally (no formal plan files)

Implementation:
- [x] Tool renderer registry at `frontend/src/components/ai-elements/tool-renderers/index.ts`
- [x] 10 custom renderers + FallbackRenderer
- [x] SmartToolOutput integrated in ChatMessages.tsx

**Deliverables:**
- Tool renderer registry mapping toolName -> React component
- 10+ custom renderers (email list, content, search, follow-ups, contacts, events, counts, folders, analysis, memory)
- Improved fallback renderer (summary + collapsible JSON instead of raw dump)
- Hidden parameters (only shown on error)
- Consistent empty states per tool type
- Raw JSON toggle for debugging

---

## Phase 10: UI Review

**Goal:** Visual polish pass across the entire frontend — ensure all pages, components, and tool renderers meet 2026 design standards with consistent theming, spacing, and responsive behavior.

**Status:** COMPLETE

**Requirements:**
- REVIEW-01: UI review and visual polish pass

**Dependencies:** Phase 09 (Chat Artifact Smart Renderers)

**Why tenth:** After all functional features are built, a dedicated visual review pass catches inconsistencies, dated patterns, and accessibility gaps across the full UI.

**Plans:** 8 plans

Plans:

- [x] 10-01-PLAN.md — Global foundations: Lucide icon migration + skip nav + reduced motion
- [x] 10-02-PLAN.md — Theme parity: light theme overrides + hardcoded color cleanup
- [x] 10-03-PLAN.md — Shell audit + fix: Layout, Header, Sidebar, ThemeToggle
- [x] 10-04-PLAN.md — Email pages audit + fix: Email List, Thread, Compose
- [x] 10-05-PLAN.md — AI pages audit + fix: AI Chat, Memories, Follow-ups
- [x] 10-06-PLAN.md — Dashboard + Contacts + Calendar audit + fix
- [x] 10-07-PLAN.md — Settings + Auth + Landing + Static pages audit + fix
- [x] 10-08-PLAN.md — Micro-interactions + accessibility verification

**Wave Structure:**

- Wave 1: 10-01, 10-02 (parallel — global foundations, no file conflicts)
- Wave 2: 10-03 (shell audit — depends on global foundations)
- Wave 3: 10-04, 10-05, 10-06, 10-07 (parallel — page audits, depends on shell)
- Wave 4: 10-08 (micro-interactions + a11y verification — depends on all page audits)

**Deliverables:**

- Zero @mui/icons-material imports (all Lucide)
- Light/dark theme parity (matching component overrides)
- Skip navigation + prefers-reduced-motion support
- Before/after screenshots for every page at 4 breakpoints x 2 themes
- Framer-motion micro-interactions on key elements
- WCAG AA accessibility improvements (fewer axe-core exclusions)
- Consistent focus indicators across all interactive elements

---

## Phase 11: AI Module Audit

**Goal:** Clean, maintainable AI module — zero dead code, all files under 500 lines, safety-critical services tested, performance gaps fixed

**Status:** COMPLETE

**Requirements:**
- AUDIT-01: AI module audit — dead code removal, dependency cleanup, file splitting (500-line limit), test coverage for safety-critical services, performance fixes

**Dependencies:** Phase 10 (UI Review)

**Why eleventh:** After all feature work and UI polish, audit the AI backend to eliminate accumulated dead code, enforce file size limits, and add tests for safety-critical services that currently have zero coverage.

**Plans:** 5 plans

Plans:

- [x] 11-01-PLAN.md — Dead code removal + unused dependency cleanup (~1,876 lines deleted)
- [x] 11-02-PLAN.md — File splitting: follow-up.service, mistral.service, unified-retriever
- [x] 11-03-PLAN.md — File splitting: relationship-intelligence, email-insights, email.tools
- [x] 11-04-PLAN.md — Tests for safety-critical services (HITL, PII detection, prompt guard)
- [x] 11-05-PLAN.md — Tests for action executor + performance/reliability fixes

**Wave Structure:**

- Wave 1: 11-01 (dead code removal — no dependencies)
- Wave 2: 11-02 (file splits: follow-up, mistral, unified-retriever — depends on 11-01)
- Wave 3: 11-03 (file splits: relationship-intel, email-insights, email.tools — serialized after 11-02 to avoid ai.module.ts conflicts)
- Wave 4: 11-04, 11-05 (parallel tests + perf fixes — depends on all splits)

**Deliverables:**

- ~1,600 lines of dead code removed
- 2 unused NestJS providers deleted (FeedbackQueueService, EmbeddingIntentClassifierService)
- 2 unused npm packages removed (@anthropic-ai/sdk, @voltagent/logger)
- 7 files over 1,000 lines split to under 500 lines each
- Tests for HITL, PII detection, prompt guard, action executor
- Tool agent pool TTL + max size limits
- RAG query timeout protection
- MISTRAL_API_KEY startup validation

---

## Phase 12: Test Fixes + Minor Gaps

**Goal:** Close remaining tech debt — fix failing tests, wire orphaned UI elements, fix WCAG gap

**Status:** GAP CLOSURE (identified by milestone audit 2026-02-08)

**Requirements:**

- FIX-01: Fix ActionExecutor tests (16/25 failing due to incomplete Prisma mocks) + display emailType in FollowUpCard
- FIX-02: WCAG aria-input-field-name fix for ComposeDialog

**Dependencies:** Phase 11 (AI Module Audit — ActionExecutor tests created in 11-05)

**Why twelfth:** Audit found 16 failing tests from Phase 11-05 (incomplete Prisma mocks) and minor UI gaps (emailType computed but never displayed, WCAG exclusion for ComposeDialog).

**Plans:** 2 plans (NOT CREATED)

- [ ] 12-01-PLAN.md — Fix ActionExecutor test Prisma mocks + emailType display in FollowUpCard/FollowUpRenderer
- [ ] 12-02-PLAN.md — WCAG aria-input-field-name fix for ComposeDialog

**Wave Structure:**

- Wave 1: 12-01, 12-02 (parallel — no file conflicts)

**Deliverables:**

- ActionExecutor tests: 25/25 passing
- emailType badge visible on follow-up cards
- ComposeDialog passes aria-input-field-name WCAG rule
- Zero remaining axe-core exclusions for tested rules

---

## Execution Order

```
Completed:
  Phase 01 (Infrastructure) ✅
  Phase 02 (Chat Overhaul) ✅
  Phase 03 (Auto-Triage) ✅
  Phase 05 (Nested Labels) ✅
  Phase 06 (Chat UI + Email Tools) ✅
  Phase 07 (Chat Improvement) ✅
  Phase 08 (Triage Exposure) ✅
  Phase 09 (Smart Renderers) ✅
  Phase 10 (UI Review) ✅
  Phase 11 (AI Module Audit) ✅

Gap Closure (remaining):
  Phase 04-03 (SnoozeDialog) ┬── parallel, no dependencies ──> v3.0 Complete
  Phase 12 (Test Fixes) ─────┘
```

**Total plans:** 35 (35 complete + 2 gap closure phases remaining)

---

## Deferred to v3.1

| Feature | Reason |
|---------|--------|
| AI category assignment | Complex NLP, requires training dataset |
| Predicted response templates | High complexity, needs fine-tuning |
| Bulk triage mode | Power user feature, lower priority |
| Rich responses in chat | Structured JSON -> UI components |
| Milestone markers in AI responses | UX polish |

---

## Success Criteria

- [x] AI chat first token <500ms
- [x] Follow-ups dashboard functional with two types
- [x] Nested labels drag-drop working
- [x] No regressions in existing functionality
- [ ] 19/19 requirements satisfied (currently 16/19)
- [x] Priority scoring implemented and functional
- [ ] SnoozeDialog UI wires useSmartTiming hook
- [ ] ActionExecutor tests passing (currently 9/25)
- [ ] Formal verification on phases 05, 07, 09, 10, 11

---

## Performance Targets

| Feature | Metric | Target |
|---------|--------|--------|
| Priority Scoring | Calculation per email | <50ms |
| AI Chat Streaming | First token latency | <500ms |
| AI Chat Streaming | Tokens per second | 20-50 |
| Follow-Up Detection | NLP extraction | <100ms per email |
| Nested Labels | Tree render time | <16ms (60fps) |

---
*Roadmap created: 2026-02-06*
*Based on research: .planning/research/FEATURES.md*
