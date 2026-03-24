ROLE:
You are a Principal Enterprise Software Architect,
CRM Platform Strategist, and AI Systems Auditor
with 20+ years of experience building Salesforce-grade,
HubSpot-class, and ServiceNow-level platforms.
You have deep expertise in cloud-native architecture,
AI/ML orchestration, GDPR compliance, and enterprise SaaS.

OBJECTIVE:
Design and generate a complete enterprise-grade implementation
roadmap for "CRM Pro 360" — a next-generation AI-powered
Customer Relationship Management platform targeting
European mid-enterprise companies.

This is a GREENFIELD project. You must produce:
- Full architectural documentation
- Phased implementation roadmap with sprints
- Epic and user story breakdowns
- Enterprise readiness framework
- KPIs and success metrics

The output must withstand:
- Enterprise procurement scrutiny
- CTO-level architectural review
- Security pre-audit (SOC 2, ISO 27001)
- Investor technical due diligence
- GDPR/AI Act compliance review

TARGET: Salesforce-grade Enterprise CRM AI Platform.

---------------------------------------------------------------------
PROJECT CONTEXT
---------------------------------------------------------------------

Product: CRM Pro 360 — Enterprise Edition
Vision: Piattaforma CRM di riferimento per imprese europee con AI
        predittiva nativa, conformità GDPR by-design, UX superiore.

Business Targets:
- 150 clienti enterprise anno 1
- ARR €8M a 18 mesi
- Retention >95%
- NPS >55
- Riduzione costi operativi clienti 30-40%

Team: 36 FTE
- 2 Product Manager
- 3 UX/UI Designer
- 6 Frontend Engineer
- 8 Backend Engineer
- 4 AI/ML Engineer
- 3 DevOps/SRE
- 4 QA Engineer
- 2 Technical Writer
- 2 Data Engineer
- 2 Security Engineer

Budget Anno 1: €4.2M
Sprint Duration: 2 settimane
Velocità Team Stimata: 80-100 story points/sprint

Tech Stack:
- Frontend: React 19, TypeScript, TailwindCSS, Vite, Radix UI
- Mobile: React Native + Expo
- API Gateway: Kong / AWS API Gateway
- Backend: Node.js (NestJS) + Python (FastAPI)
- Database: PostgreSQL 17 (Citus sharding)
- Cache: Redis Cluster + Memcached
- Search: Elasticsearch 8
- Queue: Apache Kafka + Redis Streams
- Storage: S3-compatible (MinIO on-prem option)
- AI/ML: Python, PyTorch, scikit-learn, LangChain
- Infra: Kubernetes (EKS/GKE), Terraform, ArgoCD
- Observability: Prometheus, Grafana, Jaeger, Sentry
- Patterns: DDD, Event Sourcing, CQRS, Circuit Breaker

Pricing Tiers:
- Professional: €49/utente/mese
- Business: €89/utente/mese
- Enterprise: Custom

---------------------------------------------------------------------
OUTPUT STRUCTURE — Generate ALL files below
---------------------------------------------------------------------

crm-pro-360/
├── README.md
├── docs/
│   ├── 01-EXECUTIVE-ASSESSMENT.md
│   ├── 02-ARCHITECTURE.md
│   ├── 03-BACKEND-DESIGN.md
│   ├── 04-FRONTEND-DESIGN.md
│   ├── 05-AI-ORCHESTRATION.md
│   ├── 06-SECURITY-COMPLIANCE.md
│   ├── 07-API-SPECIFICATION.md
│   ├── 08-DATA-ARCHITECTURE.md
│   ├── 09-ENTERPRISE-GAP-ANALYSIS.md
│   ├── 10-ROADMAP.md
│   ├── 11-KPIs-METRICS.md
│   └── 12-PRD-COMPLETE.md
├── .github/
│   └── ISSUE_TEMPLATE/
│       ├── epic.md
│       ├── feature.md
│       ├── bug.md
│       └── task.md
├── epics/
│   ├── EP-01-infrastructure-platform.md
│   ├── EP-02-auth-rbac-multitenancy.md
│   ├── EP-03-contacts-accounts.md
│   ├── EP-04-pipeline-opportunities.md
│   ├── EP-05-marketing-automation.md
│   ├── EP-06-customer-service-ticketing.md
│   ├── EP-07-analytics-bi.md
│   ├── EP-08-ai-ml-engine.md
│   ├── EP-09-integrations-api.md
│   ├── EP-10-mobile-app.md
│   ├── EP-11-marketplace-extensibility.md
│   └── EP-12-observability-ops.md
└── sprints/
    ├── phase-1-stabilization/
    │   ├── sprint-01.md → sprint-08.md
    ├── phase-2-enterprise-foundation/
    │   ├── sprint-09.md → sprint-14.md
    ├── phase-3-ai-governance/
    │   ├── sprint-15.md → sprint-18.md
    ├── phase-4-ga-launch/
    │   ├── sprint-19.md → sprint-20.md
    └── phase-5-marketplace-expansion/
        ├── sprint-21.md → sprint-24.md

---------------------------------------------------------------------
SECTION 1 — EXECUTIVE PLATFORM ASSESSMENT
(File: docs/01-EXECUTIVE-ASSESSMENT.md)
---------------------------------------------------------------------

Produce:
- Platform vision & strategic positioning
- Architecture maturity target assessment
- Enterprise readiness score framework (0–100) con target per fase
- Technical debt budget allocation (% per sprint)
- Risk classification matrix (Low / Medium / High / Critical)
- Scalability ceiling estimates:
  · 10x users (5.000 → 50.000 concurrent)
  · 100x data (10M → 1B records)
  · 1000x API calls (10K → 10M req/sec)
- Strategic bottlenecks identification & mitigation
- Competitive moat analysis vs Salesforce/HubSpot/Dynamics 365

---------------------------------------------------------------------
SECTION 2 — BACKEND ARCHITECTURE DESIGN
(File: docs/03-BACKEND-DESIGN.md)
---------------------------------------------------------------------

Design and document:

1. Architecture & Layering
   - Microservices boundary map (Mermaid diagram)
   - Module boundaries per DDD bounded context
   - Dependency graph with allowed/forbidden dependencies
   - Service communication patterns (sync vs async)
   - Shared kernel vs anti-corruption layer strategy

2. API Design
   - RESTful API v2 design principles
   - GraphQL API design for complex queries
   - Versioning strategy (URL vs header)
   - Error normalization schema (RFC 7807)
   - Pagination (cursor-based), filtering (RSQL/FIQL), sorting
   - Rate limiting tiers per pricing plan
   - Idempotency key strategy

3. Multi-Tenancy Architecture
   - Schema-per-tenant isolation (PostgreSQL)
   - Tenant context propagation (header → middleware → query)
   - Cross-tenant leakage prevention checklist
   - Workspace/Organization/Team hierarchy model
   - Tenant provisioning & deprovisioning flow
   - Data residency routing (EU regions)

4. RBAC & Governance
   - Role hierarchy model (Mermaid diagram)
   - Permission model: Resource × Action × Scope
   - Field-level security design
   - Row-level security (RLS) implementation
   - Audit log schema (immutable, 7yr retention)
   - Consent management (GDPR granular consent)

5. AI Orchestration Layer
   - Agent coordination architecture (supervisor pattern)
   - Tool invocation registry & traceability
   - Deterministic vs probabilistic behavior classification
   - Retry/fallback/circuit-breaker for AI calls
   - Token accounting & cost allocation per tenant
   - Model versioning & A/B testing framework
   - Human-in-the-loop escalation design
   - AI modules:
     · Lead Scoring Predittivo
     · Churn Prediction
     · Next Best Action
     · Forecast Intelligente
     · Email Intelligence
     · Conversation AI
     · Data Enrichment

6. Observability Design
   - Structured logging schema (ECS format)
   - Metrics taxonomy (RED method)
   - Distributed tracing (OpenTelemetry + Jaeger)
   - Error classification hierarchy
   - Alerting rules & escalation matrix
   - Operational runbooks template

7. Performance & Scalability
   - Concurrency model per service
   - Async I/O strategy (event loop vs thread pool)
   - Horizontal scaling triggers & policies
   - Kafka topic design & partition strategy
   - Caching strategy (Redis): cache-aside, write-through, TTL matrix
   - Connection pooling configuration
   - Database query optimization guidelines

8. Security & Compliance
   - Auth flow: JWT + refresh token rotation
   - MFA: TOTP, WebAuthn, FIDO2
   - SSO: SAML 2.0 + OpenID Connect
   - Secrets management (Vault / AWS Secrets Manager)
   - Injection prevention checklist (SQL, NoSQL, XSS, SSRF)
   - GDPR implementation: consent, right to erasure, portability, DPIA
   - AI Act compliance considerations
   - Penetration testing schedule & scope
   - Bug bounty program design

---------------------------------------------------------------------
SECTION 3 — FRONTEND ARCHITECTURE DESIGN
(File: docs/04-FRONTEND-DESIGN.md)
---------------------------------------------------------------------

Design and document:

1. UI Architecture
   - Feature-based module organization (Mermaid diagram)
   - Routing architecture with lazy-loaded modules
   - Micro-frontend feasibility analysis
   - Coupling risk matrix between modules

2. State Management
   - Data layer: React Query (TanStack) + Zustand
   - Cache invalidation strategy per entity type
   - Optimistic update patterns
   - WebSocket real-time sync architecture
   - Offline-first strategy for mobile

3. Enterprise CRM UX Primitives
   - Object model UI: Account, Contact, Lead, Opportunity, Activity, Ticket
   - Timeline feed component architecture
   - Advanced filtering engine (saved filters, dynamic operators)
   - Saved views system (personal + shared)
   - Bulk action framework (select, act, confirm, progress)
   - Admin console module map
   - Workflow builder (visual drag-drop) component architecture
   - Form builder for custom objects
   - Kanban, List, Table, Calendar view system

4. Multi-Tenancy & RBAC UI
   - Org/workspace context switching UX
   - Route-level permission guards (HOC/middleware)
   - Component-level permission guards (hook-based)
   - Admin permission matrix UI (role × resource × action)
   - Feature flag integration per tenant/plan

5. AI Layer UX
   - AI suggestion cards with explainability
   - Agent execution trace viewer
   - Human-in-the-loop approval workflow UI
   - Undo/rollback for AI-initiated actions
   - Token/cost transparency dashboard
   - AI confidence indicators (traffic light system)

6. Observability UI
   - Agent run dashboard (status, duration, cost)
   - Failure categorization & drill-down
   - Latency heatmap visualization
   - Budget quota alerts & usage meters
   - System health status page

7. Design System
   - Component library architecture (Radix + Tailwind)
   - Design token system (colors, spacing, typography, shadows)
   - Theming engine: light/dark + tenant-level branding
   - White-label capability (logo, colors, fonts, favicon)
   - Accessibility: WCAG 2.2 AA compliance checklist
   - i18n: IT, EN, DE, FR, ES — architecture & string management
   - Motion system: easing, duration, animation tokens

8. Performance
   - Bundle budget: <200KB initial, <500KB total
   - Lazy loading strategy per route
   - Code splitting boundaries
   - Image optimization pipeline
   - Core Web Vitals targets (LCP <2.5s, FID <100ms, CLS <0.1)
   - Error boundary hierarchy
   - Service Worker caching strategy

---------------------------------------------------------------------
SECTION 4 — CROSS-LAYER ANALYSIS
(Included in docs/02-ARCHITECTURE.md)
---------------------------------------------------------------------

Document system cohesion:

- API contract management (OpenAPI 3.1 + codegen)
- Error model: backend → API → frontend mapping
- Authentication flow: login → token → refresh → revoke (sequence diagram)
- Tenant context: header → middleware → DB → UI (flow diagram)
- Observability: correlation ID propagation end-to-end
- Cost/token accounting: AI call → metering → billing → UI display
- Logging correlation: request ID across all layers
- Event-driven architecture: Kafka events → WebSocket → UI updates
- Contract testing strategy (Pact or similar)

---------------------------------------------------------------------
SECTION 5 — ENTERPRISE GAP ANALYSIS
(File: docs/09-ENTERPRISE-GAP-ANALYSIS.md)
---------------------------------------------------------------------

Gap matrix comparing DAY-0 (greenfield) vs TARGET STATE:

Categories:
- Enterprise CRM platform completeness
- AI-powered automation maturity
- Governance & compliance readiness
- Operational maturity (SRE)
- Scalability to 50K concurrent users
- Scalability to 1B records
- Security posture
- Developer experience (API/SDK)
- Partner/marketplace ecosystem
- Documentation & training

For each: Current State | Target State | Gap Size | Priority | Phase

---------------------------------------------------------------------
SECTION 6 — TARGET ENTERPRISE ARCHITECTURE
(Included in docs/02-ARCHITECTURE.md)
---------------------------------------------------------------------

Define with Mermaid diagrams:

- System context diagram (C4 Level 1)
- Container diagram (C4 Level 2)
- Microservices map with communication patterns
- AI orchestration topology
- Event-driven architecture (Kafka topic map)
- Plugin/module system architecture
- Workflow engine design (state machine)
- Marketplace extensibility model
- Multi-region deployment topology
- Disaster recovery architecture

---------------------------------------------------------------------
SECTION 7 — TRANSFORMATION ROADMAP
(File: docs/10-ROADMAP.md)
---------------------------------------------------------------------

Phased roadmap with Mermaid Gantt:

Phase 1 — Stabilization & Foundation (M1–M4, Sprint 1–8)
  Focus: Infrastructure, auth, core modules (Contacts, Pipeline)
  Milestones: K8s cluster live, CI/CD pipeline, API v1, alpha release
  Risk: Infra complexity, team ramp-up
  Deliverables per sprint (see sprints/phase-1/)

Phase 2 — Enterprise Foundation (M5–M7, Sprint 9–14)
  Focus: Marketing automation, ticketing, AI scoring, SSO
  Milestones: 10 pilot customers, beta chiusa, AI MVP
  Risk: AI model accuracy, customer feedback integration
  Deliverables per sprint (see sprints/phase-2/)

Phase 3 — AI Governance & Scale (M8–M9, Sprint 15–18)
  Focus: Analytics, mobile, marketplace v1, AI governance
  Milestones: 50 beta companies, mobile app store, observability
  Risk: Performance at scale, mobile UX parity
  Deliverables per sprint (see sprints/phase-3/)

Phase 4 — GA Launch (M10, Sprint 19–20)
  Focus: Hardening, pen test, SLA, documentation, launch
  Milestones: GA release, enterprise SLA live, 0 P0 bugs
  Risk: Launch readiness, support scaling
  Deliverables per sprint (see sprints/phase-4/)

Phase 5 — Marketplace & Expansion (M11–M18, Sprint 21–24+)
  Focus: Conversation AI, API v2, on-premise, DACH/FR expansion
  Milestones: 150 customers, marketplace mature, v2.0
  Risk: Market fit in new regions, enterprise customization demands

Include per phase:
- Milestone table
- Risk assessment (probability × impact)
- Complexity estimate (T-shirt: S/M/L/XL)
- Dependencies between phases
- Go/No-Go criteria

---------------------------------------------------------------------
SECTION 8 — KPIs & ENTERPRISE METRICS
(File: docs/11-KPIs-METRICS.md)
---------------------------------------------------------------------

Measurable metrics organized by category:

Performance:
- API latency p50/p95/p99: <100ms / <200ms / <500ms
- Page load time p95: <2s
- Throughput: >10K req/sec sustained
- Database query p95: <50ms

Reliability:
- Uptime: 99.95% (SLA)
- MTTR: <30 min
- Change failure rate: <5%
- Deployment frequency: >10/week

AI Operations:
- Agent success rate: >95%
- Agent latency p95: <5s
- Cost per automation: tracked per tenant
- Token budget utilization: <80% of quota
- Model accuracy (lead scoring): >85% precision

Security:
- Tenant isolation integrity: 100% (zero cross-tenant leaks)
- Permission enforcement coverage: 100% of endpoints
- Vulnerability remediation SLA: Critical <24h, High <72h
- MFA adoption: >90% of users

Product:
- DAU/MAU ratio: >60%
- Feature adoption per module: >70% in 90 days
- Time-to-first-value: <14 days
- Onboarding completion: >90%
- NPS: >55

Business:
- MRR growth: >15% month-over-month (first 12 months)
- CAC payback: <12 months
- LTV/CAC ratio: >3:1
- Logo churn: <5% annually
- Net revenue churn: <0% (expansion > churn)

Frontend:
- Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1
- Bundle size: <200KB initial
- Lighthouse score: >90
- Accessibility audit: WCAG 2.2 AA pass
- Error rate: <0.1% of sessions

---------------------------------------------------------------------
SECTION 9 — EPICS
(Files: epics/EP-01 → EP-12)
---------------------------------------------------------------------

Each epic file MUST contain:

# Epic EP-[NN]: [Nome]
## Overview
  Descrizione dettagliata dell'epic e del suo valore di business.
## Obiettivi
  3-5 obiettivi misurabili.
## Personas Coinvolte
  Quali personas beneficiano (Marco, Laura, Paolo, Chiara).
## User Stories
  Per ogni story:
  - ID: US-[NNN]
  - Titolo
  - Come [persona], voglio [azione], per [beneficio]
  - Criteri di accettazione (Given/When/Then)
  - Story points (Fibonacci: 1,2,3,5,8,13,21)
  - Priorità: 🔴 Alta | 🟡 Media | 🟢 Bassa
  - Sprint target
  - Dipendenze
## Task Breakdown
  Per ogni task:
  - ID: T-[NNNN]
  - Descrizione
  - Stima ore
  - Ruolo assegnatario
  - Dipendenze (task/story ID)
## Technical Design Notes
  Decisioni architetturali specifiche per l'epic.
## Criteri di Accettazione Epic
  Checklist di completamento.
## Rischi Specifici
  Rischi con probabilità e impatto.
## Definition of Done
  Checklist DoD specifica.

EPICS:
EP-01: Infrastructure & Platform Setup
  K8s cluster, CI/CD (GitHub Actions + ArgoCD), monitoring stack,
  PostgreSQL + Redis + Kafka + Elasticsearch setup, Docker compose dev,
  environment management (dev/staging/prod), IaC con Terraform

EP-02: Authentication, RBAC & Multi-Tenancy
  JWT auth, MFA (TOTP + WebAuthn), SSO (SAML + OIDC), RBAC engine,
  field-level security, RLS, tenant provisioning, workspace hierarchy,
  audit log, consent management GDPR

EP-03: Contacts & Account Management
  Anagrafica contatti/aziende, campi custom, validazione, de-duplicazione
  fuzzy matching, timeline interazioni, segmentazione dinamica, import/export
  massivo, merge assistito, gerarchia account (holding/filiali)

EP-04: Pipeline & Opportunity Management
  Pipeline visuale drag-drop, multi-pipeline, weighted pipeline, stage
  automation, deal scoring, gestione prodotti/listini, preventivi,
  proposte commerciali, forecast manuale

EP-05: Marketing Automation
  Campaign builder drag-drop, workflow condizionali, email templates,
  A/B testing, landing page builder, form tracking, progressive profiling,
  attribution modeling, integrazione Google/Meta/LinkedIn Ads

EP-06: Customer Service & Ticketing
  Ticketing multi-canale (email/chat/phone/social), routing intelligente,
  SLA management, escalation automatica, knowledge base, customer portal
  self-service, CSAT/NPS survey, chatbot handoff

EP-07: Analytics & Business Intelligence
  Dashboard builder drag-drop, 50+ template, report builder, cross-filtering,
  drill-down, scheduling, forecasting base, cohort analysis, funnel
  visualization, export PDF/Excel/PPT, embedded analytics

EP-08: AI/ML Engine
  Lead scoring predittivo (50+ variabili), churn prediction, next best action,
  forecast intelligente, email intelligence (sentiment + entity extraction),
  conversation AI (multilingua NLU), data enrichment, model versioning,
  A/B testing modelli, cost tracking per tenant

EP-09: Integrations & API Platform
  API RESTful v2 (OpenAPI 3.1), GraphQL API, webhook bidirezionali,
  connettori nativi (Google Workspace, M365, Slack, Zoom, Teams),
  connettori ERP (SAP, Oracle, Dynamics, Odoo), connettori marketing
  (Mailchimp, SendGrid, GA, Meta Pixel), iPaaS (Zapier, Make, n8n),
  SDK (JS/TS, Python, Java, .NET, Go)

EP-10: Mobile Application
  React Native + Expo, parità funzionale core (contacts, pipeline,
  notifications), push notifications, offline mode, biometric auth,
  camera (business card scan), responsive tablet layout

EP-11: Marketplace & Extensibility
  Plugin system architecture, app certification process, developer portal,
  app listing & discovery, billing integration per app, sandbox environment,
  documentation & SDK per sviluppatori terzi

EP-12: Observability & Operations
  Prometheus + Grafana dashboards, Jaeger tracing, Sentry error tracking,
  structured logging (ECS), alerting (PagerDuty/OpsGenie), SLA monitoring,
  capacity planning, incident management runbooks, status page

---------------------------------------------------------------------
SECTION 10 — SPRINTS
(Files: sprints/phase-N/sprint-NN.md)
---------------------------------------------------------------------

Each sprint file MUST contain:

# Sprint [NN] — [Nome Sprint]
## Fase: [Phase name]
## Date: [start] → [end]
## Obiettivo Sprint
  Descrizione chiara dell'obiettivo in 2-3 frasi.
## Capacità Team
  Story points disponibili (base: 80-100 SP)
  Team members allocated per ruolo.
## Sprint Backlog
  Per ogni item:
  - [ ] [ID] — [Titolo] — [SP] — [Ruolo] — 📋 TODO
  Organizzato per epic di appartenenza.
## Dipendenze Esterne
  Dipendenze da altri sprint, team, vendor, decisioni.
## Rischi Sprint
  Rischi specifici con mitigazione.
## Definition of Done Sprint
  Checklist DoD per lo sprint.
## Deliverable Attesi
  Output concreti e verificabili.
## Demo/Review Notes
  Template per le note di review.

Sprint allocation:

Phase 1 — Stabilization & Foundation (Sprint 1–8):
  S01: K8s + CI/CD + monitoring + dev environment
  S02: PostgreSQL + Redis + Kafka setup + DB schema v1
  S03: Auth service (JWT + MFA) + tenant provisioning
  S04: RBAC engine + audit log + permission framework
  S05: Contacts module (CRUD + search + validation)
  S06: Contacts (import/export + dedup + timeline) + Account hierarchy
  S07: Pipeline module (stages + drag-drop + deal management)
  S08: Pipeline (weighted + automation) + basic dashboard + alpha release

Phase 2 — Enterprise Foundation (Sprint 9–14):
  S09: Marketing automation (campaign builder + email engine)
  S10: Marketing (workflow engine + A/B testing + landing pages)
  S11: Ticketing system (multi-channel + routing + SLA)
  S12: Knowledge base + customer portal + SSO/SAML integration
  S13: AI engine setup + lead scoring model + deal scoring
  S14: AI forecasting base + beta chiusa (10 pilot customers)

Phase 3 — AI Governance & Scale (Sprint 15–18):
  S15: Analytics (dashboard builder + report engine + 50 templates)
  S16: Analytics (drill-down + scheduling + export) + AI observability
  S17: Mobile app (contacts + pipeline + push + offline)
  S18: Marketplace v1 + plugin architecture + beta aperta (50 companies)

Phase 4 — GA Launch (Sprint 19–20):
  S19: Security hardening + pen test + performance optimization
  S20: Documentation + SLA enterprise + GA launch + monitoring production

Phase 5 — Marketplace & Expansion (Sprint 21–24+):
  S21: Conversation AI + chatbot + NLU multilingua
  S22: API v2 + GraphQL + advanced forecasting
  S23: Developer portal + marketplace maturo + app certification
  S24: On-premise option + DACH/FR localization + v2.0 planning

---------------------------------------------------------------------
FORMATTING RULES
---------------------------------------------------------------------

- Language: Italian for descriptions, English for technical terms
- Format: Pure Markdown, GitHub-compatible
- Every file must be self-contained and readable standalone
- Use checkbox `- [ ]` for tasks in sprints
- Priority labels: 🔴 Alta, 🟡 Media, 🟢 Bassa
- Status labels: 📋 TODO, 🔄 IN PROGRESS, ✅ DONE, ⛔ BLOCKED
- Story points: Fibonacci scale (1, 2, 3, 5, 8, 13, 21)
- Include Mermaid diagrams where useful:
  · Architecture (C4, microservices map)
  · Gantt charts (roadmap, phases)
  · Sequence diagrams (auth flow, API calls)
  · Entity relationship diagrams (data model)
  · Flowcharts (workflows, decision trees)
  · State diagrams (ticket lifecycle, deal stages)
- Tables for matrices, comparisons, gap analysis
- Code blocks for configuration examples, API samples
- Cross-reference between files using relative links

---------------------------------------------------------------------
CRITICAL REQUIREMENTS
---------------------------------------------------------------------

1. Generate ALL files with COMPLETE content — no placeholders,
   no "TODO: fill in later", no "see other document".
   Every file must be production-ready.

2. Every sprint must have 15-25 concrete backlog items
   with realistic story point estimates.

3. Every epic must have 8-15 user stories with full
   Given/When/Then acceptance criteria.

4. Architecture docs must include Mermaid diagrams.

5. All metrics must be quantified with specific targets.

6. Risk assessments must include probability AND impact.

7. The total roadmap must be internally consistent:
   sprint items must trace back to epic stories,
   epics must align with roadmap phases,
   KPIs must map to business objectives.

8. Security and compliance sections must be specific
   to GDPR + AI Act + SOC 2 + ISO 27001.

Generate everything now. Start with README.md, then docs/,
then epics/, then sprints/. Work through every file sequentially.