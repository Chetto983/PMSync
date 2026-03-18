# Requirements: PMSync

**Defined:** 2026-03-18
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v6.0 Requirements

Requirements for v6.0 Enterprise Platform & AI Governance. Each maps to roadmap phases.

### AI Control Plane

- [x] **AICP-01**: HITL uses one canonical pending-actions DTO and one approval lifecycle
- [x] **AICP-02**: Approve/reject endpoints return real execution outcome (executed/failed/approved_only)
- [x] **AICP-03**: Every mutating tool declares name, domain, riskLevel, requiresApproval, inputSchema
- [x] **AICP-04**: Action taxonomy is correct (no invalid mappings like delete_event → SCHEDULE_MEETING)
- [ ] **AICP-05**: Long-term memory save and retrieve use the same vector store
- [ ] **AICP-06**: Memory retrieval returns tenant/user-scoped results only
- [ ] **AICP-07**: System prompt references only tools and behaviors the frontend can render
- [ ] **AICP-08**: Runtime context (timezone, locale, provider) injected into system prompt
- [ ] **AICP-09**: Dedicated frontend renderers for ask_user and save_memory tools
- [ ] **AICP-10**: Legacy chat endpoints and compatibility shims removed from production code
- [ ] **AICP-11**: One chat transport remains in production (no duplicate streaming paths)
- [ ] **AICP-12**: Contract tests for pending-actions DTO, approve/reject, tool execution, memory lifecycle
- [ ] **AICP-13**: Every registered AI tool has an end-to-end validation test (execute + verify result)
- [ ] **AICP-14**: HITL approval flow tested E2E (trigger → approve → execute → verify outcome)

### Authorization

- [ ] **AUTHZ-01**: Resource-scoped permissions defined on better-auth org roles (owner/admin/member)
- [ ] **AUTHZ-02**: @RequirePermission decorator enforces permissions on controllers
- [ ] **AUTHZ-03**: Permission caching in Redis with 5min TTL, invalidated on role change
- [ ] **AUTHZ-04**: Frontend PermissionGate component hides/disables UI based on permissions
- [ ] **AUTHZ-05**: Frontend usePermission() hook for programmatic permission checks
- [ ] **AUTHZ-06**: Role-to-permission mapping defined centrally (one source of truth)
- [ ] **AUTHZ-07**: All write/delete API endpoints enforce permissions via @RequirePermission

### Security Fixes

- [ ] **SEC-01**: deleteConversation checks userId (BOLA fix)
- [ ] **SEC-02**: CSRF_SECRET is mandatory in production (no fallback to JWT_SECRET)
- [ ] **SEC-03**: /metrics endpoint restricted to admin or internal network
- [ ] **SEC-04**: HNSW vector indexes created on embeddings and ai_memories tables

### CRM

- [ ] **CRM-01**: Account entity with tenant-scoped composite PK and M:N Contact-Account links
- [ ] **CRM-02**: Deal entity with amount, currency, expectedCloseDate, probability, owner
- [ ] **CRM-03**: Pipeline and Stage entities with configurable ordered stages
- [ ] **CRM-04**: Activity entity with auto-capture from email sends/receives
- [ ] **CRM-05**: Activity auto-capture from calendar events with attendee matching
- [ ] **CRM-06**: Account/Deal/Pipeline/Activity CRUD API with tenant scoping and permission checks
- [ ] **CRM-07**: Deal board (Kanban view) with drag-drop between stages
- [ ] **CRM-08**: Account detail page with activity timeline
- [ ] **CRM-09**: CRM navigation entries and i18n (en.ts + it.ts)
- [ ] **CRM-10**: AI chat tool: search_deals (read-only, registered in ToolRegistryService)
- [ ] **CRM-11**: AI chat tool: get_account_summary (read-only)
- [ ] **CRM-12**: CRM insights added to daily AI briefing (deals closing this week)

### Workflow Automation

- [ ] **WF-01**: Trigger-condition-action rule model (event-driven via EventEmitter2)
- [ ] **WF-02**: Form-based rule builder UI for creating workflow rules
- [ ] **WF-03**: 10-15 built-in actions (send email, apply label, move folder, assign deal owner, etc.)
- [ ] **WF-04**: Conditional branching (if/else predicates on event data)
- [ ] **WF-05**: Workflow execution via BullMQ with tenant context propagation
- [ ] **WF-06**: Workflow execution history with success/failure status
- [ ] **WF-07**: Policy-aware execution (workflows respect permissions and HITL)
- [ ] **WF-08**: AI-suggested automations based on user behavior patterns

### OpenTelemetry

- [ ] **OTEL-01**: OTel SDK bootstrap before NestJS via --require flag
- [ ] **OTEL-02**: HTTP request trace context propagated through entire call chain
- [ ] **OTEL-03**: BullMQ jobs carry parent trace context (manual span creation)
- [ ] **OTEL-04**: AI/Mistral API calls wrapped in OTel spans with model/tokens/latency attributes
- [ ] **OTEL-05**: traceId returned in response headers for frontend correlation
- [ ] **OTEL-06**: AI run ledger linked to OTel traces

### MUI Chat CSS Migration

- [ ] **MUI-01**: Command Palette rebuilt with MUI Dialog + List (no cmdk dependency)
- [ ] **MUI-02**: Chat layout CSS (~950 lines) migrated to MUI sx props (streaming container excluded)
- [ ] **MUI-03**: ChatThemeBridge removed after CSS migration
- [ ] **MUI-04**: tailwindcss package removed from frontend

### Email UI/UX Polish

- [ ] **EMUIX-01**: Email list density and typography match Superhuman/Outlook professional level
- [ ] **EMUIX-02**: Thread reading pane responsive on tablet (preview pane visible, not hidden)
- [ ] **EMUIX-03**: Compose dialog responsive on mobile (safe areas, no overflow)
- [ ] **EMUIX-04**: Attachment cards polished (file type icons, size formatting, preview thumbnails)
- [ ] **EMUIX-05**: Empty states consistent across inbox/search/VIP/folder with illustrations
- [ ] **EMUIX-06**: Micro-interactions refined (hover, selection, transitions) for professional feel

### UI/UX Audit Fixes

- [ ] **UIUX-01**: Admin users table mobile responsive (card layout below mobile breakpoint)
- [ ] **UIUX-02**: Tasks page demo content replaced with empty state + real data source
- [ ] **UIUX-03**: Analytics consent gate and localized weekday labels
- [ ] **UIUX-04**: Password autocomplete="new-password" on security settings
- [ ] **UIUX-05**: Admin organizations chart container negative dimension fix

## Future Requirements

Deferred to v7.0+. Tracked but not in current roadmap.

### CRM Advanced

- **CRM-F01**: AI-powered deal scoring based on email sentiment and interaction frequency
- **CRM-F02**: Email-to-deal auto-linking via RAG context matching
- **CRM-F03**: Custom CRM fields (JSONB on Account/Deal/Activity)

### Workflow Advanced

- **WF-F01**: Visual node editor using @xyflow/react
- **WF-F02**: Multi-step sequential workflows with durable state machine
- **WF-F03**: Webhook triggers and actions
- **WF-F04**: Scheduled/cron triggers
- **WF-F05**: Workflow templates (pre-built library)

### Authorization Advanced

- **AUTHZ-F01**: Resource ownership checks (members edit own deals only)
- **AUTHZ-F02**: Conditional permissions (edit deals only if status is DRAFT)
- **AUTHZ-F03**: AI tools respect user permissions (no privilege escalation)
- **AUTHZ-F04**: Custom roles beyond owner/admin/member

### AI Advanced

- **AICP-F01**: Token budget enforcement per request (hard cap)
- **AICP-F02**: Per-user daily cost cap with configurable threshold
- **AICP-F03**: AI action rollback registry for non-email actions
- **AICP-F04**: HITL approval timeout with configurable auto-reject
- **AICP-F05**: Push notifications for pending approvals

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Custom objects / dynamic entity types | Massive schema complexity; hardcode Account/Deal/Activity/Pipeline |
| Lead entity separate from Contact | Anti-pattern; use Contact with lifecycle stage field |
| Revenue forecasting / analytics | Needs historical data maturity; show simple pipeline totals |
| Products/line items on deals | Over-engineering for v1 CRM; single amount field |
| Territory management | Enterprise-only; simple deal ownership via userId |
| Quoting / CPQ | Different domain entirely |
| Visual workflow node editor | Phase 4 material; form-based rules first |
| Custom code nodes in workflows | Security nightmare; limit to built-in action types |
| Full ABAC policy engine (OPA/Cedar) | Out of scope per PROJECT.md; RBAC+ sufficient |
| Per-field permissions | Per-entity permissions only for now |
| Database RLS | Prisma 7 + PostgreSQL RLS interaction problematic per PROJECT.md |
| Frontend OTel instrumentation | Bundle size cost for marginal benefit; backend-only tracing |
| Grafana/Tempo stack deployment | Ship OTLP exporter; ops team chooses visualization |
| Replace Prometheus with OTel metrics | prom-client works; OTel for traces only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AICP-01 | Phase 77 | Complete |
| AICP-02 | Phase 77 | Complete |
| AICP-03 | Phase 77 | Complete |
| AICP-04 | Phase 77 | Complete |
| AICP-05 | Phase 82 | Pending |
| AICP-06 | Phase 82 | Pending |
| AICP-07 | Phase 82 | Pending |
| AICP-08 | Phase 82 | Pending |
| AICP-09 | Phase 82 | Pending |
| AICP-10 | Phase 82 | Pending |
| AICP-11 | Phase 82 | Pending |
| AICP-12 | Phase 77 | Pending |
| AICP-13 | Phase 82 | Pending |
| AICP-14 | Phase 77 | Pending |
| AUTHZ-01 | Phase 79 | Pending |
| AUTHZ-02 | Phase 79 | Pending |
| AUTHZ-03 | Phase 79 | Pending |
| AUTHZ-04 | Phase 79 | Pending |
| AUTHZ-05 | Phase 79 | Pending |
| AUTHZ-06 | Phase 79 | Pending |
| AUTHZ-07 | Phase 79 | Pending |
| SEC-01 | Phase 78 | Pending |
| SEC-02 | Phase 78 | Pending |
| SEC-03 | Phase 78 | Pending |
| SEC-04 | Phase 78 | Pending |
| CRM-01 | Phase 81 | Pending |
| CRM-02 | Phase 81 | Pending |
| CRM-03 | Phase 81 | Pending |
| CRM-04 | Phase 81 | Pending |
| CRM-05 | Phase 81 | Pending |
| CRM-06 | Phase 81 | Pending |
| CRM-07 | Phase 81 | Pending |
| CRM-08 | Phase 81 | Pending |
| CRM-09 | Phase 81 | Pending |
| CRM-10 | Phase 81 | Pending |
| CRM-11 | Phase 81 | Pending |
| CRM-12 | Phase 81 | Pending |
| WF-01 | Phase 83 | Pending |
| WF-02 | Phase 83 | Pending |
| WF-03 | Phase 83 | Pending |
| WF-04 | Phase 83 | Pending |
| WF-05 | Phase 83 | Pending |
| WF-06 | Phase 83 | Pending |
| WF-07 | Phase 83 | Pending |
| WF-08 | Phase 83 | Pending |
| OTEL-01 | Phase 80 | Pending |
| OTEL-02 | Phase 80 | Pending |
| OTEL-03 | Phase 80 | Pending |
| OTEL-04 | Phase 80 | Pending |
| OTEL-05 | Phase 80 | Pending |
| OTEL-06 | Phase 80 | Pending |
| MUI-01 | Phase 84 | Pending |
| MUI-02 | Phase 84 | Pending |
| MUI-03 | Phase 84 | Pending |
| MUI-04 | Phase 84 | Pending |
| EMUIX-01 | Phase 85 | Pending |
| EMUIX-02 | Phase 85 | Pending |
| EMUIX-03 | Phase 85 | Pending |
| EMUIX-04 | Phase 85 | Pending |
| EMUIX-05 | Phase 85 | Pending |
| EMUIX-06 | Phase 85 | Pending |
| UIUX-01 | Phase 85 | Pending |
| UIUX-02 | Phase 85 | Pending |
| UIUX-03 | Phase 85 | Pending |
| UIUX-04 | Phase 85 | Pending |
| UIUX-05 | Phase 85 | Pending |

**Coverage:**
- v6.0 requirements: 66 total
- Mapped to phases: 66
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation (phases 77-85)*
