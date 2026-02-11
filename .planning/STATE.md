# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v3.1 GDPR Compliance & Chatbot Enhancement

## Current Position

Phase: Phase 15 (GDPR Core Compliance)
Plan: 4 of 4 complete
Status: Phase complete
Last activity: 2026-02-11 — Plan 15-04 complete (GDPR compliance unit tests)

Progress: v3.1
```
[#########################░░░░░░░░░░░░░░░░░░░░░] 50% (3/6 phases)
```

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed 15-04-PLAN.md (GDPR compliance unit tests)
Resume file: None
Next action: Execute Phase 16 (Data Rights & Legal Documents)

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
| Follow-up type defaults to TODO | v3.0-04-01 | Existing follow-ups remain valid after migration; most are received emails |
| Folder-based type detection | v3.0-04-01 | SENT folder + waitingFor items = WAITING_FOR, else TODO |
| Lightweight followUp select (7 fields) | v3.0-04-01 | Updated from 6 to include followUpType field |
| Use chrono-node for NLP deadlines | v3.0-04-02 | Already installed, handles relative dates, zero new dependencies |
| Smart timing: 2-3 days, Tue-Thu 10 AM | v3.0-04-02 | Research shows single follow-up doubles response rate (16% → 27%) |
| Separate detectedDeadline from dueDate | v3.0-04-02 | Preserves both AI-detected and manual dates |
| Lightweight followUp select (10 fields) | v3.0-04-02 | Updated from 7 to include detectedDeadline + deadlineSource |
| Lucide icons size prop convention | v3.0-10-01 | size={18} for small, size={20} for medium, size={24} for large |
| Skip navigation sr-only pattern | v3.0-10-01 | Tailwind sr-only + focus:not-sr-only for WCAG AA skip link |
| MotionConfig placement | v3.0-10-01 | Wrapped inside MaterialThemeWrapper for proper provider nesting |
| Preserved 3-line email layout | v3.0-10-04 | Outlook-inspired design with snippet preview is superior UX over 2-line spec |
| Hex alpha suffix for theme colors | v3.0-10-04 | `${theme.palette.primary.main}0A` more explicit than alpha() function |
| Code audit sufficient when standards met | v3.0-10-06 | Code review can replace visual testing when patterns are consistent |
| 2-column dashboard grid over 3-column | v3.0-10-06 | Better card proportions at 1440px (~640px per widget) |
| CALENDAR_COLORS hardcoded array acceptable | v3.0-10-06 | Semantic preset values for calendar customization, user-modifiable |
| Animations 0.1-0.25s (SUBTLE) | v3.0-10-08 | Micro-interactions enhance UX without distracting |
| No stagger on virtualized lists | v3.0-10-08 | Performance concern with large email lists |
| Focus-visible 2px offset + 4px radius | v3.0-10-08 | Modern look matching contemporary design systems |
| Re-enabled button-name/label/color-contrast WCAG | v3.0-10-08 | Phases 10-01 and 10-02 fixed these violations |
| Facade pattern for MistralService | v3.0-11-02 | Preserves all existing consumer imports while delegating to focused services |
| Setter-based DI for cross-service wiring | v3.0-11-02 | Avoids NestJS circular dependency errors in extracted services |
| RRF K=60 constant for rank fusion | v3.0-11-02 | Industry standard parameter balancing vector and keyword rankings |
| Extract-then-delegate pattern for large files | v3.0-11-03 | Create new services first, modify originals in follow-up to avoid file conflicts |
| Flexible assertions for external library tests | v3.0-11-04 | Test pattern detection instead of strict blocking for library version compatibility |
| Context-aware validation testing | v3.0-11-04 | Different security levels for USER_PROMPT vs EMAIL_CONTENT vs SYSTEM_INTERNAL |
| OR query for VIP detection | v3.0-03-01 | User-defined VIPs (isVip) + auto-detected (relationshipScore >= 50) |
| VIP take limit 50 | v3.0-03-01 | Accommodate both auto-detected and user-defined VIPs |
| isVip fast-path in scoreSenderImportance | v3.0-03-01 | Cache-miss fallback returns 1.0 for user-defined VIPs |
| Active tenant filtering in backfill | v3.0-03-01 | Prevent processing for inactive/deleted tenants |
| @Optional() injection for AttentionScoreService | v3.0-03-02 | Degrades gracefully in tests without VoltAgentModule |
| Query limit as string with parseInt fallback | v3.0-03-02 | NestJS @Query() returns string; manual parsing needed |
| Redis hash for sender behavior scores | v3.0-03-03 | Zero JSONB queries, fast reads, 30-day TTL auto-expiry |
| EMA blend 0.7 prev weight | v3.0-03-03 | Smooth score evolution, prevents single action from dominating |
| Buffer flush at 5 signals or 5 min | v3.0-03-03 | Balance between responsiveness and write efficiency |
| 100 emails per tenant recalculation | v3.0-03-03 | Prevent overload; oldest emails recalculated first |
| SKIP_FOLDERS extracted constant | v3.0-03-03 | Eliminated 3x folder exclusion duplication |
| Native date input for custom dates | v3.0-04-03 | @mui/x-date-pickers not installed; matches existing patterns |
| Smart timing above presets | v3.0-04-03 | AI recommendation is primary value-add; prominent placement |
| handleSnooze accepts Date object | v3.0-04-03 | Cleaner API for both presets and smart timing |
| editorPlaceholder for RichTextEditor aria-label | v3.0-12-02 | Consistent with placeholder text for accessible name |
| label prop for recipient aria-labels | v3.0-12-02 | To/Cc/Bcc labels map directly to accessibility context |
| PII tokenization as Phase 13 blocker | v3.1-roadmap | All AI features depend on PII protection foundation |
| 6 phases for 27 requirements | v3.1-roadmap | Comprehensive depth (8-12 phases target), natural groupings |
| Sanitize body, NOT subject in embeddings | v3.1-13-01 | Subject is critical for semantic search relevance |
| Sanitize contact emails/phones, NOT name | v3.1-13-01 | Name is primary search target for contact lookups |
| @Optional() @Inject() for PII in embeddings | v3.1-13-01 | Matches codebase convention, graceful degradation |
| Mock CacheService directly for PII tests | v3.1-13-02 | Faster than NestJS TestingModule, sufficient for integration validation |
| Real PiiDetectionService in tests (no mocks) | v3.1-13-02 | Ensures actual regex patterns and hashing work correctly |
| jest.isolateModules for config-dependent tests | v3.1-14-01 | jest.mock singleton prevents per-test config changes |
| isEnabled getter on TenantKeyService | v3.1-14-01 | Downstream code can skip encryption when master key not set |
| Encryption opt-in (empty key = disabled) | v3.1-14-01 | Graceful degradation; encryption activated only after master key configured |
| skip+take pagination over cursor for composite PK | v3.1-14-03 | Composite @@id([id, tenantId]) prevents cursor-based pagination in Prisma |
| Dynamic Prisma model accessor for generic backfill | v3.1-14-03 | Lowercase first char of model name for reusable backfillEncryptModel() |
| Dry-run via CLI flag for migration safety | v3.1-14-03 | --dry-run logs encryption candidates without writing to database |
| Object.assign for PrismaService extension wiring | v3.1-14-02 | Copies interceptor methods onto this, preserving single injectable token |
| Exported helper functions for extension testability | v3.1-14-02 | Prisma.defineExtension returns opaque function; helpers enable unit testing |
| Pure function extension (no NestJS DI) | v3.1-14-02 | Accepts key-getter callbacks, instantiated in constructor for simplicity |
| Direct HKDF derivation in integration tests | v3.1-14-04 | Reproduces TenantKeyService logic without NestJS DI for fast test isolation |
| No DB required for encryption integration tests | v3.1-14-04 | Exported helper functions are the same code the Prisma extension uses internally |
| Dual-write consent-to-preferences pattern | v3.1-15-01 | Immutable consent records + sync to UserPreferences for fast runtime checks |
| Default deny for consent checks | v3.1-15-01 | hasConsent returns false when no record exists, forcing explicit opt-in |
| Feature validation on consent update | v3.1-15-01 | Rejects unknown feature IDs with BadRequestException |
| Wire onAuditToolExecution in voltagent.service.ts | v3.1-15-02 | Follows existing hook pattern (hooks wired in service, not module) |
| Store tool args in context for onToolEnd access | v3.1-15-02 | onToolEnd doesn't receive args; stored via __toolArgs in onToolStart |
| @Optional() AuditService in VoltAgentService | v3.1-15-02 | Graceful degradation matching codebase convention |
| Pure Jest mocks for PrismaService in GDPR tests | v3.1-15-04 | Faster than NestJS TestingModule, sufficient for unit tests |
| Full ExecutionContext mock shape for guard/interceptor tests | v3.1-15-04 | Complete interface avoids runtime type errors |
| Translations under settings.consentPanel | v3.1-15-03 | Nested under settings matching existing panel patterns |
| Optimistic toggle with rollback | v3.1-15-03 | Standard TanStack Query onMutate/onError/onSettled pattern |
| Frontend feature grouping arrays | v3.1-15-03 | AI_FEATURES/DATA_FEATURES hardcoded matching backend constants |

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
- Phase 11 added: AI Module Audit (2026-02-08)
- Phase 12 added: Test Fixes + Minor Gaps (2026-02-08) — gap closure from milestone audit
- Phase 13-18 added: v3.1 GDPR Compliance & Chatbot Enhancement (2026-02-09) — PII tokenization, GDPR core, data rights, artifacts, triage, drafts

## Milestones

See: .planning/MILESTONES.md

**v2.0 Professional Email Client** -- SHIPPED 2026-02-04
- 8 phases, 21 plans
- 24/24 requirements satisfied
- 200 E2E tests across 5 browsers

**v1 Stability & Code Quality Refactor** -- SHIPPED 2026-02-02
- 8 phases, 40 plans
- 77% reduction in large service files

**v2.1 Optimization & Polish** -- SHIPPED 2026-02-05
- 3 phases, 5 plans
- 5 requirements (OPT-01/02, POLISH-01/02, API-01)

**v3.0 AI Intelligence & Scalability** -- SHIPPED 2026-02-09
- 12 phases, 42 plans
- 19/19 requirements satisfied

## v3.1 Roadmap

**Phases:**
- Phase 13: PII Tokenization Foundation (4 requirements)
- Phase 14: GDPR Core Compliance (6 requirements)
- Phase 15: Data Rights & Legal Documents (5 requirements)
- Phase 16: Rich Artifacts UI (6 requirements)
- Phase 17: AI Triage & Bulk Operations (4 requirements)
- Phase 18: AI Draft Generation (2 requirements)

**Coverage:** 27/27 requirements mapped (100%)

## Next Steps

**Currently:** Phase 15 complete (4 of 4 plans done)

**Phase 15 progress (GDPR Core Compliance):**
- Plan 15-01: Consent management backend (UserConsent model, ConsentService, ConsentGuard, REST API) -- COMPLETE
- Plan 15-02: Audit logging system (AuditLogInterceptor, VoltAgent hook, retention cron) -- COMPLETE
- Plan 15-03: Consent management frontend UI (ConsentSettings, TanStack Query hooks, EN/IT translations) -- COMPLETE
- Plan 15-04: GDPR compliance unit tests (29 tests, 5 files) -- COMPLETE

**Known issues carried forward from v3.0:**
- LCP/TTI targets monitored but not yet met (continue-on-error in CI)
- E2E auth mock infrastructure bug (pre-existing, affects all E2E tests)
- Pre-existing lint error in LabelTreeDndWrapper.tsx (resetState accessed before declaration)
- @@index([tenantId, aiPriority]) needs Prisma migration before production use

---
*State updated: 2026-02-11 — Phase 15 complete (GDPR Core Compliance - 4/4 plans done)*

## Previous Milestone (v3.0) Highlights

- 12 phases, 42 plans completed
- Modern AI chat (Vercel AI SDK streaming)
- Auto-triage priority scoring (VIP-aware)
- Nested labels with drag-drop
- 10 custom tool renderers
- 1,618 lines dead code removed
- WCAG accessibility polish
