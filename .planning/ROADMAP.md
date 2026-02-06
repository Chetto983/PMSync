# v3.0 Roadmap: AI Intelligence & Scalability

## Overview

**Version:** v3.0
**Goal:** Overhaul AI infrastructure for speed, reliability, and intelligent email management
**Total Phases:** 5
**Total Requirements:** 12

**Key deliverables:**
- Clean VoltAgent integration with modern patterns
- Streaming AI chat with Vercel AI SDK
- Auto-triage with priority scoring and learning
- Refactored follow-ups UI with smart timing
- Nested labels frontend (tree view + drag-drop)

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

## Phase Summary

| Phase | Name | Requirements | Plans | Dependencies |
|-------|------|--------------|-------|--------------|
| 01 | AI Infrastructure Cleanup | INFRA-01/02/03 | 3 | None |
| 02 | AI Chat Overhaul | CHAT-01/02/03 | 3 | Phase 01 |
| 03 | Auto-Triage Core | TRIAGE-01/02/03 | 3 | Phase 01 |
| 04 | Follow-Ups Refactor | FOLLOW-01/02 | 2 | None |
| 05 | Nested Labels Frontend | LABELS-01 | 2 | None (backend done v2.1) |

---

## Phase 01: AI Infrastructure Cleanup

**Goal:** Clean technical foundation before adding new AI features

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
- 01-01: VoltAgent audit against official documentation
- 01-02: Tool consolidation and deduplication
- 01-03: Scalability improvements (caching, connection pooling)

**Deliverables:**
- Audit report with findings and fixes
- Consolidated tool registry (no duplicates)
- Documented scalability improvements
- Performance benchmarks (before/after)

---

## Phase 02: AI Chat Overhaul

**Goal:** Modern streaming chat experience replacing current slow implementation

**Requirements:**
- CHAT-01: Vercel AI SDK streaming integration
- CHAT-02: Contextual suggested prompts based on current view
- CHAT-03: Mobile-responsive chat design (375px+)

**Dependencies:** Phase 01 (clean VoltAgent required)

**Why second:** Chat is the primary AI interface. Fixing it early impacts all subsequent AI features.

**Research findings (from FEATURES.md):**
- First token target: <500ms (Superhuman benchmark)
- Token streaming: 20-50 tokens/second
- Pure chat is losing favor — prefer structured UI + AI suggestions

**Plans:** 3 plans
- 02-01: Vercel AI SDK integration (useChat hook, streaming)
- 02-02: Contextual prompts + command palette enhancement
- 02-03: Mobile-responsive design + error handling

**Deliverables:**
- Streaming chat with <500ms first token
- Context-aware suggested prompts per view
- Mobile-optimized full-screen chat modal
- Graceful error handling with retry

---

## Phase 03: Auto-Triage Core

**Goal:** AI-powered email prioritization and importance scoring

**Requirements:**
- TRIAGE-01: Priority scoring model (0-100 scale)
- TRIAGE-02: VIP lists (user-defined + AI-suggested)
- TRIAGE-03: Learning from user actions (open/reply patterns)

**Dependencies:** Phase 01 (scalable RAG required for scoring)

**Why third:** Auto-triage is the core v3.0 value proposition. Priority scoring enables all future triage features.

**Research findings (from FEATURES.md):**
- Superhuman reports 150% faster email processing with auto-triage
- Target: 90% accuracy after 1 week learning (94% at 2 weeks)
- Score calculation: <50ms per email (batch during sync)

**Technical approach:**
- New `priority_score` field on Email model (0-100 int)
- New `importance_level` enum: HIGH, MEDIUM, LOW
- Background BullMQ job for nightly score recalculation
- RAG query: "Is this email urgent based on historical context?"

**Plans:** 3 plans
- 03-01: Priority scoring model + database schema
- 03-02: VIP lists management (user + AI suggestions)
- 03-03: Learning engine (track actions, update weights)

**Deliverables:**
- Priority score on every email
- VIP list management UI
- Weekly learning cycle updating scores
- Email list showing importance indicators

---

## Phase 04: Follow-Ups Refactor

**Goal:** Complete redesign of follow-ups UI with smart features

**Requirements:**
- FOLLOW-01: Follow-ups UI refactor with two types (Waiting For / To Do)
- FOLLOW-02: Smart timing suggestions + NLP deadline detection

**Dependencies:** None (independent module)

**Why fourth:** Follow-ups is broken/underused. High user value with moderate complexity.

**Research findings (from FEATURES.md):**
- Single follow-up doubles response rate (16% → 27%)
- Sweet spot: 2-3 days after initial send
- Automatic detection of "Please respond by Friday" patterns

**Plans:** 2 plans
- 04-01: UI refactor (tabs, kanban view, bulk actions)
- 04-02: Smart timing + NLP deadline extraction

**Deliverables:**
- Follow-up types: Waiting For / To Do
- Dashboard with tabs: Today / This Week / Overdue
- One-click follow-up from email hover
- Automatic deadline detection during sync

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

**Plans:** 2 plans
- 05-01: Tree view component with expand/collapse
- 05-02: Drag-drop nesting + hierarchical search

**Deliverables:**
- Tree view in sidebar with visual hierarchy
- Drag-drop to nest/reorder labels
- Search includes child labels automatically

---

## Execution Order

```
Wave 1: Phase 01 (Infrastructure) ─────────────────────────────┐
                                                               │
Wave 2: Phase 02 (Chat) ───────────┐                           │
        Phase 03 (Auto-Triage) ────┼─ parallel after 01 ──────>│
                                   │                           │
Wave 3: Phase 04 (Follow-Ups) ─────┤                           ├──> v3.0 Complete
        Phase 05 (Nested Labels) ──┘── can run anytime ────────┘
```

**Estimated timeline:** 13 plans total (3 + 3 + 3 + 2 + 2)

---

## Deferred to v3.1

| Feature | Reason |
|---------|--------|
| AI category assignment | Complex NLP, requires training dataset |
| Predicted response templates | High complexity, needs fine-tuning |
| Bulk triage mode | Power user feature, lower priority |
| Rich responses in chat | Structured JSON → UI components |
| Milestone markers in AI responses | UX polish |

---

## Success Criteria

- [ ] 12/12 requirements satisfied
- [ ] AI chat first token <500ms
- [ ] Priority scoring 90%+ accuracy after 1 week
- [ ] Follow-ups dashboard functional with two types
- [ ] Nested labels drag-drop working
- [ ] No regressions in existing functionality

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
