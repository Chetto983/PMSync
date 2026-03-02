ROLE:
You are a Principal Enterprise Software Architect, 
CRM Platform Strategist, and AI Systems Auditor 
with experience in Salesforce, HubSpot, ServiceNow, 
and large-scale AI SaaS platforms.

OBJECTIVE:
Perform a full-stack architectural, product, security, 
and enterprise-readiness audit of the MailAgent platform.

This includes BOTH:

BACKEND:
D:\MailAgent\backend

FRONTEND:
D:\MailAgent\frontend

Do NOT modify source code.
Only analyze and produce documentation.

Assume this platform must evolve into a 
Salesforce-grade Enterprise CRM AI Platform.

The output must withstand:
- Enterprise procurement scrutiny
- CTO-level architectural review
- Security pre-audit
- Investor technical due diligence

---------------------------------------------------------------------
SECTION 1 — EXECUTIVE PLATFORM ASSESSMENT
---------------------------------------------------------------------

Provide:
- Overall architecture maturity assessment
- Enterprise readiness score (0–100)
- Technical debt rating
- Risk classification (Low / Medium / High)
- Scalability ceiling estimate
- Strategic bottlenecks

---------------------------------------------------------------------
SECTION 2 — BACKEND ARCHITECTURE AUDIT
---------------------------------------------------------------------

Evaluate:

1. Architecture & Layering
   - Module boundaries
   - Separation of concerns
   - Dependency graph integrity
   - Circular dependencies
   - Domain-driven design maturity

2. API Design
   - REST/GraphQL structure consistency
   - Versioning strategy
   - Error normalization
   - Pagination, filtering, sorting maturity

3. Multi-Tenancy
   - Tenant isolation
   - Data segregation guarantees
   - Cross-tenant leakage risks
   - Workspace model clarity

4. RBAC & Governance
   - Role model design
   - Permission granularity
   - Enforcement consistency
   - Audit log infrastructure

5. AI Orchestration Layer
   - Agent coordination architecture
   - Supervisor patterns
   - Tool invocation traceability
   - Determinism vs probabilistic behavior
   - Retry/fallback strategies
   - Cost control mechanisms
   - Token accounting

6. Observability
   - Structured logging
   - Metrics
   - Tracing readiness
   - Error classification
   - Operational dashboards readiness

7. Performance & Scalability
   - Concurrency model
   - Blocking I/O risks
   - Horizontal scaling readiness
   - Queue system presence (if any)
   - Caching strategy

8. Security & Compliance
   - Auth strategy
   - Token handling
   - Secrets management
   - Injection risk surface
   - GDPR auditability
   - Data retention strategy

---------------------------------------------------------------------
SECTION 3 — FRONTEND ARCHITECTURE AUDIT
---------------------------------------------------------------------

Evaluate:

1. UI Architecture
   - Module organization
   - Routing scalability
   - Feature-based structuring
   - Coupling risks

2. State Management
   - Data layer consistency
   - Cache invalidation strategy
   - Async state race risks
   - API interaction normalization

3. Enterprise CRM UX Primitives
   - Object model readiness (Accounts, Contacts, Activities)
   - Timeline feeds
   - Advanced filtering
   - Saved views
   - Bulk actions
   - Admin console feasibility
   - Workflow builder readiness

4. Multi-Tenancy & RBAC UI
   - Org/workspace context switching
   - Route-level permission enforcement
   - Component-level permission guards
   - Admin permission matrix UI feasibility

5. AI Layer UX
   - Explainability UI
   - Agent execution trace
   - Human-in-the-loop validation
   - Undo/rollback UX
   - Cost/token transparency UI

6. Observability UI
   - Agent run dashboard
   - Failure categorization
   - Latency visualization
   - Budget quota alerts

7. Design System & White-Label
   - Component consistency
   - Theming architecture
   - Tenant-level branding override
   - Accessibility baseline
   - i18n readiness

8. Performance
   - Bundle size
   - Lazy loading
   - Code splitting
   - Rendering bottlenecks
   - Error boundary maturity

---------------------------------------------------------------------
SECTION 4 — CROSS-LAYER ANALYSIS
---------------------------------------------------------------------

Analyze system cohesion between frontend and backend:

- API contract stability
- Error model consistency
- Authentication flow integrity
- Tenant context propagation
- Observability end-to-end traceability
- Cost/token accounting alignment
- Logging correlation capability
- Event-driven vs request-driven architecture coherence

---------------------------------------------------------------------
SECTION 5 — ENTERPRISE GAP ANALYSIS
---------------------------------------------------------------------

Compare CURRENT STATE vs REQUIRED STATE for:

- Enterprise CRM platform
- AI-powered automation layer
- Governance & compliance
- Operational maturity
- Scalability to 10x users
- Scalability to 100x data

Provide a clear gap matrix.

---------------------------------------------------------------------
SECTION 6 — TARGET ENTERPRISE ARCHITECTURE PROPOSAL
---------------------------------------------------------------------

Define:

- Ideal backend architecture
- Ideal frontend architecture
- AI orchestration pattern
- Event-driven opportunities
- Plugin/module system strategy
- Workflow builder feasibility
- Marketplace extensibility strategy

Describe module boundaries clearly.

---------------------------------------------------------------------
SECTION 7 — TRANSFORMATION ROADMAP
---------------------------------------------------------------------

Provide phased roadmap:

Phase 1 — Stabilization & Debt Reduction  
Phase 2 — Enterprise Foundation  
Phase 3 — AI Governance & Observability  
Phase 4 — Marketplace & Advanced Automation  

Include:
- Milestones
- Risk per phase
- Impact
- Complexity estimate

---------------------------------------------------------------------
SECTION 8 — KPIs & ENTERPRISE METRICS
---------------------------------------------------------------------

Define measurable metrics:

- Latency p95
- Agent failure rate
- Cost per automation
- Tenant isolation integrity
- Permission enforcement coverage
- Frontend performance score
- Test coverage targets

---------------------------------------------------------------------
DELIVERABLE
---------------------------------------------------------------------

Generate a single Enterprise Platform PRD.

FORMAT:
Professional Markdown.
CTO-level.
No generic advice.
No fluff.
Highly structured.
Explicit recommendations.
Clear risks.
Concrete transformation strategy.