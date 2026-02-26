# Roadmap: v3.1 GDPR Compliance & Chatbot Enhancement

## Overview

v3.1 transforms MailAgent into a GDPR-compliant AI email platform with enhanced chatbot capabilities. The milestone centers on PII protection for AI (Phase 13), database encryption at rest with per-tenant key isolation (Phase 14), complete GDPR compliance infrastructure (Phases 15-16), advanced AI features including rich artifacts, smart triage, and draft generation (Phases 17-19), and gap closure phases for guard mounting and prompt quality (Phases 20-21). 31 requirements map to 9 phases starting at Phase 13 (ENC-03 deferred to v3.2).

## Milestones

- v3.0 AI Intelligence & Scalability - Phases 1-12 (shipped 2026-02-09)
- v3.1 GDPR Compliance & Chatbot Enhancement - Phases 13-21 (in progress)

## Phases

<details>
<summary>v3.0 AI Intelligence & Scalability (Phases 1-12) - SHIPPED 2026-02-09</summary>

### Phase 1: VoltAgent Infrastructure Audit
**Goal**: Reliable AI infrastructure with tool consolidation
**Plans**: 3 plans
- [x] 01-01: VoltAgent audit and Redis lock fix
- [x] 01-02: Tool consolidation analysis
- [x] 01-03: Prometheus metrics integration

### Phase 2: Modern Chat UI
**Goal**: Vercel AI SDK streaming with contextual prompts
**Plans**: 4 plans
- [x] 02-01: Circuit breaker implementation
- [x] 02-02: Context-aware prompts
- [x] 02-03: Suggested prompts endpoint
- [x] 02-04: Error recovery UI

### Phase 3: Priority Scoring
**Goal**: VIP-aware auto-triage
**Plans**: 3 plans
- [x] 03-01: VIP detection and scoring
- [x] 03-02: Attention score service
- [x] 03-03: Sender behavior tracking

### Phase 4: Follow-ups Refactor
**Goal**: Two-type follow-ups with smart timing
**Plans**: 3 plans
- [x] 04-01: Follow-up types migration
- [x] 04-02: Smart timing with NLP
- [x] 04-03: Snooze UI

### Phase 5: Nested Labels
**Goal**: Hierarchical label tree with drag-drop
**Plans**: 3 plans
- [x] 05-01: Tree view implementation
- [x] 05-02: Drag-drop reordering
- [x] 05-03: Color picker UI

### Phase 6: Chat UI on Mail
**Goal**: Contextual AI panel on email view
**Plans**: 5 plans
- [x] 06-01: Chat layout with sliding panel
- [x] 06-02: Context banner
- [x] 06-03: Tool execution UI
- [x] 06-04: Async agent creation
- [x] 06-05: View context routing

### Phase 7: Chat Improvements
**Goal**: Modern chat UX patterns
**Plans**: 6 plans
- [x] 07-01: AiDashboard refactor
- [x] 07-02: Modern message styling
- [x] 07-03: Scroll detection
- [x] 07-04: Hover actions
- [x] 07-05: Markdown rendering
- [x] 07-06: Compact header

### Phase 8: Email Tool Triage Exposure
**Goal**: AI tools see triage data
**Plans**: 2 plans
- [x] 08-01: Follow-up exposure in listing tools
- [x] 08-02: Triage filters on tools

### Phase 9: Chat Artifact Renderers
**Goal**: Semantic UI for tool results
**Plans**: 1 plan
- [x] 09-01: Ten custom tool renderers

### Phase 10: UI Review
**Goal**: Visual polish and modern standards
**Plans**: 8 plans
- [x] 10-01: Accessibility audit
- [x] 10-02: Button styling consistency
- [x] 10-03: Icon consistency
- [x] 10-04: Email list modern design
- [x] 10-05: Typography review
- [x] 10-06: Dashboard widgets
- [x] 10-07: Color consistency
- [x] 10-08: Animations polish

### Phase 11: AI Module Audit
**Goal**: Clean, performant AI codebase
**Plans**: 4 plans
- [x] 11-01: Dead code removal
- [x] 11-02: MistralService facade
- [x] 11-03: Service extraction
- [x] 11-04: Test improvements

### Phase 12: Test Fixes + Minor Gaps
**Goal**: Gap closure from milestone audit
**Plans**: 2 plans
- [x] 12-01: ActionExecutor tests
- [x] 12-02: WCAG accessibility fixes

</details>

---

## v3.1 GDPR Compliance & Chatbot Enhancement (In Progress)

**Milestone Goal:** Full GDPR compliance with database encryption at rest, enhanced AI chatbot artifacts, and advanced triage features.

### Phase 13: PII Tokenization Foundation

**Goal**: All AI interactions use tokenized PII (emails, names, phones) with automatic restoration

**Depends on**: Nothing (first phase, CRITICAL BLOCKER)

**Requirements**: PII-01, PII-02, PII-03, PII-04

**Success Criteria** (what must be TRUE):
1. System extracts PII from all text before sending to LLM APIs
2. User sees real names/emails/phones when viewing AI responses (tokens restored)
3. AI tool calls execute with real PII values (tokens restored for execution)
4. RAG embeddings are generated from PII-sanitized content (no PII in vector DB)
5. System maintains bidirectional token mapping (token <-> original value)

**Plans**: 2 plans

Plans:
- [x] 13-01-PLAN.md - Wire PII sanitization into EmbeddingComposerService (PII-04)
- [x] 13-02-PLAN.md - PII integration tests (PII-01, PII-02, PII-03 verification)

---

### Phase 14: Database Encryption at Rest

**Goal**: Tier 1 PII fields encrypted at rest with per-tenant key isolation via custom Prisma extension

**Depends on**: Phase 13 (PII tokenization must work before layering DB encryption)

**Requirements**: ENC-01, ENC-02, ENC-04, ENC-05 (ENC-03 hash indexes deferred to Tier 2 field encryption)

**Success Criteria** (what must be TRUE):
1. Tier 1 PII fields (bodyText, bodyHtml, snippet) are encrypted at rest in PostgreSQL
2. Each tenant's data is encrypted with a derived key unique to that tenant (HKDF from master key + tenant ID)
3. All existing data is migrated (backfill encrypted) without downtime
4. Key rotation works: new key encrypts new data, old keys in keychain still decrypt old data
5. Encryption is opt-in via env var (zero breaking change when disabled)

**Technology**: Custom Prisma client extension using Node.js built-in `crypto` (AES-256-GCM + HKDF). `prisma-field-encryption` library rejected — broken on Prisma 7 (issue #143), no composite @@id support, no per-tenant keys.

**Key Design Decisions**:
- Custom `$extends()` Prisma extension for transparent encrypt/decrypt (NOT prisma-field-encryption)
- `enc:` prefix marker for detecting encrypted vs plaintext values during migration
- `TenantKeyService` using HKDF to derive per-tenant keys from a master secret
- Two-tier strategy: Tier 1 (body fields) encrypted now, Tier 2 (from, subject, displayName) deferred — fuzzy search on encrypted fields requires search redesign
- Skip+take pagination for composite PK batch migration
- Keychain pattern for key rotation (try current key first, then old keys)

**Plans**: 4 plans

Plans:
- [x] 14-01-PLAN.md — TenantKeyService + AES-256-GCM encryption primitives + config (ENC-02 foundation)
- [x] 14-02-PLAN.md — Custom Prisma client extension + PrismaService wiring (ENC-01 core)
- [x] 14-03-PLAN.md — Backfill migration script for existing data (ENC-04)
- [x] 14-04-PLAN.md — Integration tests + key rotation verification (ENC-05)

---

### Phase 15: GDPR Core Compliance

**Goal**: Consent management and audit logging operational

**Depends on**: Phase 14 (encryption at rest must protect data before consent workflows process it)

**Requirements**: CONS-01, CONS-02, CONS-03, AUDIT-01, AUDIT-02, AUDIT-03

**Success Criteria** (what must be TRUE):
1. User can view granular consent settings page (per-feature toggles)
2. User can modify consent settings at any time
3. System blocks data processing when required consent is missing
4. System logs all data access events with user/tenant/timestamp context
5. System logs all AI tool executions with input/output summaries
6. Audit logs are retained for 3 years per GDPR Article 30

**Plans**: 4 plans

Plans:
- [x] 15-01-PLAN.md -- Consent backend: Prisma model, service, guard, decorator, controller (CONS-01/02/03)
- [x] 15-02-PLAN.md -- Audit backend: AuditService expansion, interceptor, VoltAgent hook, retention cron (AUDIT-01/02/03)
- [x] 15-03-PLAN.md -- Consent frontend: translations, API module, query hooks, consent settings UI (CONS-01)
- [x] 15-04-PLAN.md -- TDD: Unit tests for consent and audit (all 6 requirements)

---

### Phase 16: Data Rights & Legal Documents

**Goal**: Users can export data, request deletion, and accept legal terms

**Depends on**: Phase 15 (consent management must exist before enforcing legal acceptance)

**Requirements**: DATA-01, DATA-02, DATA-03, LEGAL-01, LEGAL-02

**Success Criteria** (what must be TRUE):
1. User can request complete data export (emails, contacts, calendar, AI history)
2. User receives data export in machine-readable format (GDPR Article 20)
3. User can request account deletion (right to erasure)
4. System performs hard delete after 30-day grace period
5. New users must accept Terms of Service before using app
6. New users must accept Privacy Policy before using app

**Plans**: 4 plans

Plans:
- [x] 16-01-PLAN.md -- Prisma models (LegalAcceptance, DataExportRequest) + legal acceptance backend (LEGAL-01, LEGAL-02)
- [x] 16-02-PLAN.md -- Data export backend: assembler, ZIP generation, download endpoint (DATA-01)
- [x] 16-03-PLAN.md -- Account deletion backend: soft-delete, 30-day grace period, purge cron (DATA-02, DATA-03)
- [x] 16-04-PLAN.md -- Frontend: translations, API module, query hooks, export/deletion panels, registration integration

---

### Phase 17: Rich Artifacts UI

**Goal**: AI chat renders interactive artifacts for all domains

**Depends on**: Phase 13 (artifacts must show tokenized data properly)

**Requirements**: ARTIFACT-01, ARTIFACT-02, ARTIFACT-03, ARTIFACT-04, ARTIFACT-05, ARTIFACT-06

**Success Criteria** (what must be TRUE):
1. AI chat renders email artifacts with interactive UI (open, reply, archive buttons)
2. AI chat renders calendar event artifacts with interactive UI (accept, decline, view)
3. AI chat renders contact artifacts with interactive UI (view profile, send email)
4. AI chat renders follow-up artifacts with interactive UI (complete, snooze, view)
5. AI chat renders daily briefing artifacts with structured sections (priorities, deadlines)
6. AI chat renders CRM/relationship artifacts with interactive UI (relationship score, history)

**Plans**: 4 plans

Plans:
- [x] 17-01-PLAN.md -- Infrastructure: extend ToolRendererProps with onAction, create ActionBar shared component, wire callback plumbing through SmartToolOutput and ChatMessages
- [x] 17-02-PLAN.md -- Backend: create get_daily_briefing and get_relationship_stats VoltAgent tools
- [x] 17-03-PLAN.md -- Upgrade email and follow-up renderers with interactive action buttons (ARTIFACT-01, ARTIFACT-04)
- [x] 17-04-PLAN.md -- Upgrade contact/event renderers, create BriefingRenderer and CrmRenderer (ARTIFACT-02, ARTIFACT-03, ARTIFACT-05, ARTIFACT-06)

---

### Phase 18: AI Triage & Bulk Operations

**Goal**: Users can triage emails with AI assistance at scale

**Depends on**: Phase 13 (triage needs tokenized PII for AI analysis)

**Requirements**: TRIAGE-01, TRIAGE-02, BULK-01, BULK-02

**Success Criteria** (what must be TRUE):
1. AI analyzes email content and assigns to appropriate nested label
2. User sees AI triage suggestions in email list
3. User can bulk-apply AI triage suggestions to multiple selected emails
4. User can batch-apply labels to selected emails via AI assistant
5. User can batch-create follow-ups for selected emails via AI assistant

**Plans**: 4 plans

Plans:
- [x] 18-01-PLAN.md -- Backend: TriageSuggestionService, bulk_email_actions tool extension, action types + executors, module wiring (TRIAGE-01, BULK-01, BULK-02)
- [x] 18-02-PLAN.md -- Frontend email list: AI triage chips in ThreadListItem, Apply AI Suggestions button in ThreadListHeader, translations (TRIAGE-02)
- [x] 18-03-PLAN.md -- Frontend chat: TriageRenderer for bulk action results, tool registry registration (TRIAGE-02, BULK-01)
- [x] 18-04-PLAN.md -- Gap closure: Wire onApplyAiSuggestions handler in ThreadList.tsx, bridge email selection to AI chat via Zustand store (TRIAGE-02)

---

### Phase 19: AI Draft Generation

**Goal**: AI generates full reply drafts in user's writing style

**Depends on**: Phase 13 (drafts need tokenized PII), Phase 18 (uses triage context)

**Requirements**: DRAFT-01, DRAFT-02

**Success Criteria** (what must be TRUE):
1. AI generates full reply drafts based on email context and conversation history
2. AI drafts match user's writing style (learned from sent emails)
3. User can accept, edit, or regenerate AI drafts
4. System learns from user edits to improve future drafts

**Plans**: 4 plans

Plans:
- [ ] 19-01-PLAN.md -- Backend: Prisma schema (AiDraftFeedback, WritingStyleProfile extension), DraftGenerationService, DraftFeedbackService, AiDraftController (DRAFT-01)
- [ ] 19-02-PLAN.md -- Backend: Per-provider writing style profiles, manual samples, draft corrections, weekly refresh cron (DRAFT-02)
- [ ] 19-03-PLAN.md -- Frontend: Translations, API module, TanStack Query hooks, AiDraftBadge, ToneSelector, ComposeDialog auto-draft wiring (DRAFT-01)
- [ ] 19-04-PLAN.md -- Frontend: WritingStyleSettings panel with style summary, manual samples, draft stats + visual checkpoint (DRAFT-02)

---

### Phase 20: Mount GDPR Guards

**Goal**: Wire existing ConsentGuard and LegalAcceptanceGuard into runtime enforcement

**Depends on**: Phase 15 (ConsentGuard), Phase 16 (LegalAcceptanceGuard)

**Requirements**: CONS-02, LEGAL-01, LEGAL-02

**Gap Closure**: Closes CONS-02, LEGAL-01, LEGAL-02 from v3.1 audit

**Success Criteria** (what must be TRUE):
1. `LegalAcceptanceGuard` registered as `APP_GUARD` in `app.module.ts` — users without TOS/Privacy acceptance are blocked from non-exempt routes
2. `ConsentGuard` enforces `ai_email_processing` consent on VoltAgent chat and embedding endpoints
3. Exempt routes (auth, health, compliance) are decorated with `@SkipLegalCheck` / `@SkipConsent`
4. Integration test verifies guards block requests when consent/legal acceptance is missing

**Plans**: 1 plan

Plans:
- [ ] 20-01-PLAN.md — Register LegalAcceptanceGuard + ConsentGuard as APP_GUARD, exempt compliance routes, enforce ai_email_processing consent on AI endpoints, integration tests (CONS-02, LEGAL-01, LEGAL-02)

---

### Phase 21: Enrich Triage Prompt

**Goal**: Fix Apply AI Suggestions prompt to include email metadata instead of raw UUIDs

**Depends on**: Phase 18 (mechanical wiring already complete)

**Requirements**: TRIAGE-02

**Gap Closure**: Closes TRIAGE-02 from v3.1 audit

**Success Criteria** (what must be TRUE):
1. Apply AI Suggestions prompt includes email subject + sender for each selected email
2. VoltAgent LLM receives sufficient context to construct valid `bulk_email_actions` calls
3. E2E flow works: select emails → click Apply AI → LLM triages with correct metadata

Plans:
- [ ] 21-01: (To be planned)

---

### Phase 22: Bug Audit

**Goal**: Comprehensive audit and remediation of all bugs across the entire MailAgent codebase (v3.0 + v3.1). Completes unfinished plans 19-04 and 21-01. Zero known bugs when done.

**Depends on:** Phase 21

**Requirements**: AUDIT-FIX-01, AUDIT-FIX-02, AUDIT-FIX-03, AUDIT-FIX-04, AUDIT-FIX-05, AUDIT-FIX-06, AUDIT-FIX-07, AUDIT-FIX-08

**Plans:** 0/6 plans executed

Plans:
- [ ] 22-01-PLAN.md — Comprehensive codebase audit producing BUG-REPORT.md + visual baseline screenshots
- [ ] 22-02-PLAN.md — Tooling fixes: ESLint (both), Prisma migration, npm audit, test infrastructure
- [ ] 22-03-PLAN.md — Backend bug fixes: dead code removal, code consolidation, known bugs
- [ ] 22-04-PLAN.md — Frontend bug fixes: UI issues, i18n gaps, pattern violations, lint cleanup
- [ ] 22-05-PLAN.md — Unfinished plans: 19-04 WritingStyleSettings + 21-01 Triage Prompt enrichment
- [ ] 22-06-PLAN.md — Final verification: after screenshots, before/after metrics, git tag, user sign-off

---

## Progress

**Execution Order:** Phases execute in numeric order (13 -> 14 -> 15 -> 16 -> 17 -> 18 -> 19)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 13. PII Tokenization Foundation | v3.1 | 2/2 | ✓ Complete | 2026-02-11 |
| 14. Database Encryption at Rest | v3.1 | 4/4 | ✓ Complete | 2026-02-11 |
| 15. GDPR Core Compliance | v3.1 | 4/4 | ✓ Complete | 2026-02-11 |
| 16. Data Rights & Legal Documents | v3.1 | 4/4 | ✓ Complete | 2026-02-11 |
| 17. Rich Artifacts UI | v3.1 | 4/4 | ✓ Complete | 2026-02-11 |
| 18. AI Triage & Bulk Operations | v3.1 | Complete    | 2026-02-26 | 2026-02-26 |
| 19. AI Draft Generation | 3/4 | In Progress|  | - |
| 20. Mount GDPR Guards | 1/1 | Complete    | 2026-02-26 | - |
| 21. Enrich Triage Prompt | v3.1 | 0/? | Not started | - |
| 22. Bug Audit | 0/6 | Planned    |  | - |

---

*Roadmap created: 2026-02-09*
*Last updated: 2026-02-26 — Phase 22 planned with 6 plans. Gap closure phases 20-21 added from milestone audit. ENC-03 deferred to v3.2.*
