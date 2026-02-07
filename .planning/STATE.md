# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v3.0 AI Intelligence & Scalability

## Current Position

Phase: 2 of 9 — AI Chat Overhaul
Plan: 04 of 4
Status: COMPLETE (verified)
Last activity: 2026-02-07 — Phase 02 complete, all plans executed and verified

Progress: v3.0
```
[███████████████████████████████████████████] 96% (23/24 plans)
```

## Session Continuity

Last session: 2026-02-07
Stopped at: Completed Phase 02 (AI Chat Overhaul) — 12/12 must-haves verified
Resume file: None
Next action: Plan Phase 03 (Auto-Triage Core) or Phase 04 (Follow-Ups Refactor)

## Accumulated Decisions

| Decision | Phase | Rationale |
|----------|-------|-----------|
| Standalone Prisma in benchmarks | v2.0-01-01 | CI/CD portability without NestJS startup |
| Partial indexes for filtered queries | v2.0-01-01 | 80% index size reduction for common patterns |
| CONCURRENTLY index creation | v2.0-01-01 | Avoid table locks in production |
| Promise.all for folder counts | v2.0-01-02 | Each provider independent, no cross-provider state |
| Weekly orphan cleanup at 2 AM Sunday | v2.0-01-02 | Avoid peak usage, batch processing with limits |
| 300ms debounce for prefetch | v2.0-03-01 | Prevents API flood on fast mouse movements |
| Mobile header with Send, no Schedule | v2.0-04-03 | Simplify mobile UX; schedule send available on desktop |
| 5 primary actions on mobile toolbar | v2.0-04-02 | AI, Bold, Italic, Link, Attach - most used |
| 16px indentation per nesting level | v2.0-05-03 | Clean visual hierarchy with MUI spacing |
| Regex tokenization for search filters | v2.0-06-03 | Handles quoted strings and space-separated tokens |
| Kanban columns LOCAL ONLY | v2.0-06-02 | Backend API out of scope v2.0; localStorage via Zustand |
| AES256 (SSE-S3) over SSE-KMS | v2.0-07-01 | Simpler, cheaper, sufficient for attachments |
| csrf-csrf package | v2.0-07-04 | Maintained SPA-focused package, replaces deprecated csurf |
| Pixel 7/iPhone 14 device profiles | v2.0-08-01 | Current mainstream devices for mobile E2E testing |
| fail-fast: false in CI matrix | v2.0-08-05 | Complete browser coverage even if one fails |
| ssr: false for TipTap dynamic import | v2.1-01-01 | TipTap uses browser APIs (window, document) |
| ssr: false for @dnd-kit dynamic import | v2.1-01-01 | @dnd-kit uses browser APIs (window, document) |
| Reuse KanbanSkeleton for lazy load | v2.1-01-01 | Already exists with configurable columns/cards |
| continue-on-error: true for Lighthouse CI | v2.1-01-02 | Don't block PRs until budgets verified achievable |
| Separate lighthouse job in CI | v2.1-01-02 | Clearer separation, parallel execution, easy toggle |
| 3 URLs tested by Lighthouse | v2.1-01-02 | Email, compose, follow-ups - key performance pages |
| 0px fallback for safe area insets | v2.1-02-01 | Non-iOS devices automatically get 0px |
| Landscape safe area (left/right) | v2.1-02-01 | Support iPhone landscape mode on all mobile components |
| calc() for Desktop FAB safe area | v2.1-02-01 | Preserve 24px base spacing while adding safe area |
| Serial execution for search E2E | v2.1-02-02 | Prevents tenant data race conditions |
| test.beforeEach for E2E mock setup | v2.1-02-02 | Ensures mocks set before each test |
| URL navigation for filter tests | v2.1-02-02 | /dashboard/email?search=filter:value pattern |
| Bidirectional URL-store sync | v2.1-02-02 | email.tsx syncs URL ?search= to Zustand store and vice versa |
| aria-label chip selectors | v2.1-02-02 | Use /Remove filter:.*/ pattern to avoid matching email list items |
| Prioritize Redis locks and retry first | v3.0-01-01 | Small effort, high impact on reliability (VOLT-02, VOLT-03) |
| No tool consolidation needed | v3.0-01-01 | Tools already well-consolidated, no duplicates found |
| @willsoto/nestjs-prometheus for metrics | v3.0-01-03 | NestJS-native integration with makeHistogramProvider helpers |
| Optional @InjectMetric for graceful degradation | v3.0-01-03 | Services work without PrometheusModule loaded |
| onToolMetrics callback for hooks | v3.0-01-03 | Avoids injecting services into pure function factory |
| Separate /suggested-prompts endpoint | v3.0-02-02 | Cleaner separation of concerns vs embedding in streaming response |
| ViewContext ref pattern for transport | v3.0-02-02 | Fresh values in AI SDK transport body (same as conversationId) |
| Icon mapping for dynamic prompts | v3.0-02-02 | Explicit object maps string icon names to Lucide components |
| Use existing LlmCircuitBreaker | v3.0-02-01 | Leverage MistralService class, no new dependencies |
| Error categorization in hook | v3.0-02-01 | parseError in use-voltagent-chat.ts for reusability |
| Inline retry banner | v3.0-02-01 | Visible retry action path, not just toast |
| expandedIds tracks expanded labels | v3.0-05-01 | Collapsed by default matches context decision |
| Aggregate counts in buildTree | v3.0-05-01 | Avoids cascading re-renders (precomputed once) |
| Preset-only color picker | v3.0-05-01 | Context: no custom hex input |
| Variable indent (16px L0-1, 8px L2+) | v3.0-05-01 | Keep sidebar tight at deeper nesting levels |
| Panel width 380px desktop, 100vw mobile | v3.0-06-02 | Consistent with typical chat sidebars, full width on mobile |
| Fixed overlay panel (not pushing content) | v3.0-06-02 | Does not disturb email reading flow |
| Context banner with subject + sender | v3.0-06-02 | User always knows which email the AI is discussing |
| Loader2Icon for tool spinners | v3.0-06-03 | Animated spinning vs static pulsing for clearer active state |
| TOOL_NAME_MAP in tool.tsx | v3.0-06-03 | Human-readable tool names for better UX |
| EmailContext after BASE prompt | v3.0-06-03 | Contextual AI prompt section when viewing specific email |
| Async agent creation | v3.0-06-04 | Required to fetch email context from database before building prompt |
| Use from field (not fromAddress) | v3.0-06-04 | Prisma Email schema uses 'from' as sender address field |
| viewContext optional at all layers | v3.0-06-05 | Backward compatibility with existing API calls |
| Type narrowing for currentView | v3.0-06-05 | Cast to specific union type when passing to createUnifiedAgent |
| Separate DndContext for labels | v3.0-05-02 | Avoid collision with EmailLayout folder DnD |
| Toggle deselect on all sidebar filters | v3.0-05-02 | Clicking active filter clears it (labels, folders, provider folders) |
| 6 files for AiDashboard refactor | v3.0-07-01 | ChatInput extracted separately for mobile reuse |
| Controller hook returns typed interface | v3.0-07-01 | Clear contract for consumers, easier to extend |
| hideQuickActions on ChatInput | v3.0-07-01 | Mobile dialog has less space for quick actions |
| IntersectionObserver for scroll detection | v3.0-07-02 | Works with any scrollable ancestor without needing containerRef |
| User messages: 8% secondary alpha | v3.0-07-02 | Subtle modern look matching Claude/ChatGPT UX |
| Assistant messages: no container | v3.0-07-02 | Clean typography focus, reduces visual noise |
| Tailwind group/group-hover for hover actions | v3.0-07-04 | Reveals action bar on message hover with opacity transition |
| Theme palette for semantic colors | v3.0-07-04 | Always use theme.palette.* not hardcoded hex |
| Exclude followUp from bulk listing tools | v3.0-08-01 | Token bloat risk; only get_email_content (max 5) includes it |
| Lightweight followUp select (6 fields) | v3.0-08-01 | Excludes commitments/waitingFor/actionItems JSON blobs |
| count_emails unchanged | v3.0-08-01 | Only counts rows, no email select to modify |
| Triage filters on listing tools only | v3.0-08-02 | Search tools have RAG/text filtering; mixing creates confusing semantics |
| list_follow_ups uses select not include | v3.0-08-02 | Lightweight responses, excludes bodyText/bodyHtml |
| Excluded JSON blobs from list_follow_ups | v3.0-08-02 | commitments/waitingFor/actionItems cause token bloat |
| Compact header 48-56px | v3.0-07-06 | Reduced from 80px for cleaner UI, inline status chip |

## Blockers & Concerns

| Issue | Severity | Phase | Notes |
|-------|----------|-------|-------|
| LCP exceeds budget (4.12s vs 2.5s) | High | v2.1-01 | Primary v2.1 target |
| TTI exceeds budget (4.13s vs 3.5s) | High | v2.1-01 | Primary v2.1 target |
| E2E chip interaction tests | Medium | v2.1-02 | 5/7 search tests pass; chip removal click needs debugging |

## Roadmap Evolution

- Phase 06 added: Chat UI and Agent Tool on Mail (2026-02-07)
- Phase 07 added: Chat Improvement (2026-02-07)
- Phase 08 added: Email Tool Triage Exposure (2026-02-07) — audit found all listing tools blind to aiPriority/aiSentiment/aiLabels/followUp
- Phase 09 added: Chat Artifact Smart Renderers (2026-02-07) — raw JSON tool results replaced with semantic UI renderers per tool type
- Phase 10 added: UI Review (2026-02-07) — visual polish pass for design consistency and modern standards

## Milestones

See: .planning/MILESTONES.md

**v2.0 Professional Email Client** -- SHIPPED 2026-02-04
- 8 phases, 21 plans
- 24/24 requirements satisfied
- 200 E2E tests across 5 browsers

**v1 Stability & Code Quality Refactor** -- SHIPPED 2026-02-02
- 8 phases, 40 plans
- 77% reduction in large service files

**v2.1 Optimization & Polish** -- IN PROGRESS
- 3 phases, 5 plans
- 5 requirements (OPT-01/02, POLISH-01/02, API-01)

## v3.0 Roadmap -- 7 Phases, 22 Plans

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 01 | AI Infrastructure Cleanup | INFRA-01/02/03 | COMPLETE (3/3 plans) |
| 02 | AI Chat Overhaul | CHAT-01/02/03 | COMPLETE (4/4 plans) |
| 03 | Auto-Triage Core | TRIAGE-01/02/03 | Ready to plan |
| 04 | Follow-Ups Refactor | FOLLOW-01/02 | Ready to plan |
| 05 | Nested Labels Frontend | LABELS-01 | COMPLETE (2/2 plans) |
| 06 | Chat UI and Agent Tool on Mail | CHATUI-01 | COMPLETE (5/5 plans) |
| 07 | Chat Improvement | CHAT-04 | PENDING VERIFICATION (6/6 plans) |
| 08 | Email Tool Triage Exposure | TOOL-01 | COMPLETE (2/2 plans) |
| 09 | Chat Artifact Smart Renderers | ARTIFACT-01 | NOT PLANNED |

**Deferred to v3.1:** Category assignment, predicted responses, bulk triage, rich chat responses

## Next Steps

**Currently:** Phase 02 complete, verified.

**Completed phases:**
- Phase 01: AI Infrastructure Cleanup (3/3 plans)
- Phase 02: AI Chat Overhaul (4/4 plans) ✓
- Phase 05: Nested Labels Frontend (2/2 plans)
- Phase 06: Chat UI and Agent Tool on Mail (5/5 plans)
- Phase 07: Chat Improvement (6/6 plans)
- Phase 08: Email Tool Triage Exposure (2/2 plans)

**Remaining phases:**
- Phase 03: Auto-Triage Core (0/3 plans — NOT PLANNED)
- Phase 04: Follow-Ups Refactor (0/2 plans — NOT PLANNED)
- Phase 09: Chat Artifact Smart Renderers (NOT PLANNED)

**Known issues carried forward:**
- LCP/TTI targets monitored but not yet met (continue-on-error in CI)
- E2E auth mock infrastructure bug (pre-existing, affects all E2E tests)
- Pre-existing lint error in LabelTreeDndWrapper.tsx (resetState accessed before declaration)
- @@index([tenantId, aiPriority]) needs Prisma migration before production use

---
*State updated: 2026-02-07 -- Phase 02 (AI Chat Overhaul) complete — 12/12 must-haves verified*
