# Project Research Summary: v3.1 GDPR Compliance & AI Chatbot Enhancements

**Project:** MailAgent v3.1
**Domain:** Professional AI email client with compliance requirements
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

MailAgent v3.1 focuses on GDPR compliance for EU market readiness while enhancing AI chatbot capabilities with richer, more interactive responses. The research reveals a **minimal-dependency approach**: only ONE new package needed (`prisma-field-encryption@1.6.0`), with all other requirements satisfied by existing infrastructure (node-nlp for PII detection, custom NestJS interceptors for audit, existing streamdown for chat artifacts).

**Critical Finding:** The biggest risk is PII leakage via RAG embeddings. MailAgent's existing pgvector-based retrieval generates embeddings from raw email content without PII sanitization, creating potential GDPR violations where similarity search could reconstruct sensitive data across tenant boundaries. This MUST be addressed before any other GDPR work begins.

**Recommended Approach:** Implement layered security with (1) pre-embedding PII tokenization using hybrid regex+NER detection, (2) Prisma middleware encryption for at-rest data, (3) global audit interceptors for accountability, (4) consent guards for AI processing, and (5) component-based artifact rendering with sandboxing. Total effort: 19-28 days across 4 phases, with Phase 1 (PII tokenization) as the critical blocker.

---

## Key Findings

### Recommended Stack (from STACK.md)

**Minimal additions strategy:** Leverage existing infrastructure rather than adding heavy dependencies. The single new dependency is `prisma-field-encryption@1.6.0` for transparent field-level encryption with Prisma 7.3+ extension support.

**Core technologies:**
- **prisma-field-encryption@1.6.0**: Field-level encryption — Prisma Client extension for transparent AES-256 encryption with per-tenant key derivation (pbkdf2)
- **node-nlp (existing)**: PII detection — Hybrid regex + Named Entity Recognition achieves 95% accuracy (F1=0.94) for emails, phones, names, organizations with 30-60ms latency
- **NestJS Interceptors (custom)**: Audit logging — Standard pattern for CRUD action logging with IP address capture, masked diff generation, 2-year retention
- **Prisma Models (custom)**: Consent management — ConsentRecord table with purpose-based tracking, legal basis documentation, grant/revoke timestamps
- **streamdown@2.1.0 (existing)**: Chat artifacts — Already installed markdown streaming library with syntax highlighting support

**Explicitly avoided dependencies:**
- PII-PALADIN (90MB bundle, 30-40% CPU overhead)
- External APIs (Google DLP, Azure AI) — GDPR violation to send PII outside EU
- OneTrust/Usercentrics ($5k-50k/year) — Overkill for API-only consent
- Percona TDE/pgcrypto — Complex or breaks Prisma type safety

---

### Expected Features

**Must have (GDPR table stakes):**
- **PII Tokenization** — Replace sensitive data with reversible tokens before storage/processing (GDPR Article 32)
- **Audit Logging** — Track all data access with masked changes, IP addresses, user actions (GDPR Article 30)
- **Consent Management** — Purpose-specific consent capture for AI analysis with granular grant/revoke (GDPR Article 6)
- **Encryption at Rest** — AES-256 encryption for email body, contact notes, AI memory content (GDPR Article 32)

**Should have (chatbot differentiators):**
- **Rich Artifacts** — Render structured responses (email drafts, contact cards, data tables, charts, code snippets) as interactive components
- **Streaming Responses** — Token-by-token rendering (<500ms first token, 20-50 tokens/sec)
- **Contextual Prompts** — Show suggested actions based on current view
- **Sandbox Execution** — Isolate code artifact execution in iframe for security

**Defer (v3.2+):**
- Predicted Response Templates (high complexity, needs fine-tuning)
- Bulk Triage Mode (power user feature)
- AI Category Assignment (complex NLP classification)
- Key Rotation (Vault/KMS migration)

---

### Architecture Approach

**Layered security with interceptor pattern:** Request → TenantGuard → PiiDetectionInterceptor → Controller → Service → Prisma Middleware (encryption) → Database. Response path includes AuditLogInterceptor tapping successful writes.

**Major components:**
1. **PiiDetectionInterceptor (Global)** — Detects PII in request bodies using hybrid regex+NER, stores encrypted mappings in Redis with session-scoped TTL (30min), replaces PII with deterministic tokens before reaching business logic.
2. **Prisma Middleware (Encryption)** — Encrypts sensitive fields (bodyText, notes, content) with AES-256-GCM using per-tenant keys derived via pbkdf2(masterKey, tenantId). Performance: <5ms per field.
3. **AuditLogInterceptor (Selective)** — Applied via @Auditable() decorator to sensitive controllers. Logs: action, resource type, masked changes (PII redacted), IP address (encrypted), timestamp. BullMQ batching achieves 10k logs/min.
4. **ConsentGuard (Decorator-based)** — Applied via @RequiresConsent('ai_analysis') decorator. Checks ConsentRecord table. Throws 403 if consent missing/revoked.
5. **ArtifactRenderer (Component-based)** — Backend VoltAgent tools return JSON artifacts with type discriminator. Frontend switches on type and renders domain components. Security: Sandpack for code execution, DOMPurify for HTML sanitization, CSP headers.

---

### Critical Pitfalls

**Top 5 must-prevent failures:**

1. **PII Leakage via RAG Embeddings (CP-1)** — Embedding generation from raw email content encodes PII in vector space. Vector embeddings are NOT one-way functions. Multi-tenant systems leak when namespace isolation fails. Evidence: WotNot AI breach (2025), 42% of orgs rank PII leakage as top GenAI risk.

2. **Incomplete Tokenization Coverage (CP-2)** — Email content flows through 8+ processing paths. Missing ANY path creates compliance gaps. Single unprotected export API leaks entire database PII history.

3. **Right to Be Forgotten vs. Immutable Backups (CP-3)** — GDPR requires 30-day data deletion. Email backups persist longer. Solution: Crypto-shredding (delete encryption key, not data).

4. **Audit Logging Gaps (CP-4)** — Current AuditLog table logs CRUD but misses: PII access patterns, embedding generation events, RAG retrieval queries, consent changes, encryption operations.

5. **Consent Blocking Failures (CP-5)** — Scripts fire before consent capture. Users see AI features without granting consent. ConsentGuard decorator MUST run before controller logic.

---

## Implications for Roadmap

Based on combined research, v3.1 requires **4 phases in strict sequence** (Phase 1 blocks all others):

### Phase 1: PII Tokenization Foundation (7 days)
**Rationale:** CRITICAL BLOCKER. Must sanitize data BEFORE any embeddings/encryption/audit to prevent PII leakage via RAG.

**Delivers:**
- PiiDetectionInterceptor as global APP_INTERCEPTOR
- Hybrid regex+NER detection using existing node-nlp
- Redis-based encrypted token mappings (session-scoped, 30min TTL)
- Unit tests for 12 PII types

**Addresses:** CP-1 (RAG leakage), CP-2 (coverage gaps)
**Blocks:** All subsequent phases

---

### Phase 2: Core GDPR Compliance (10 days)
**Rationale:** Implements legal requirements (audit, consent, encryption) now that PII is tokenized.

**Delivers:**
- ConsentRecord model with purpose-based tracking
- ConsentGuard decorator with @RequiresConsent enforcement
- AuditLogInterceptor with @Auditable() decorator
- Prisma middleware encryption for sensitive fields
- Schema migration adding IV columns

**Sub-tasks:**
- Day 1-3: Consent management
- Day 4-7: Audit logging
- Day 8-10: Encryption at rest

**Addresses:** CP-3 (deletion rights), CP-4 (audit gaps), CP-5 (consent blocking)
**Uses:** prisma-field-encryption@1.6.0, NestJS interceptors

---

### Phase 3: Enhanced AI Chat (Rich Artifacts) (7 days)
**Rationale:** Differentiates chatbot with structured, interactive responses. Can be implemented in parallel with Phase 2 (presentation layer, no GDPR dependencies).

**Delivers:**
- Backend artifact framework (6 artifact types: email-draft, contact-card, event-proposal, task-list, data-visualization, code-snippet)
- VoltAgent tools returning JSON artifacts
- Frontend ArtifactRenderer with domain components
- Sandpack integration for code execution
- DOMPurify for HTML sanitization

**Parallel with:** Phase 2 (no dependencies)

---

### Phase 4: GDPR Dashboard & Advanced Features (4 days)
**Rationale:** User-facing GDPR controls and key management improvements. Not launch-blocking but required for full compliance transparency.

**Delivers:**
- Privacy dashboard (consent status, audit log, data download, deletion request)
- TanStack Query hooks (useConsentStatus, useAuditLogs, useDataExport)
- Admin audit log viewer
- Key management planning (Vault/KMS migration deferred to v3.2)

**Depends:** Phase 2 (requires consent/audit infrastructure)

---

### Phase Ordering Rationale

**Sequential dependencies:**
- Phase 1 → Phase 2: PII must be tokenized before encryption
- Phase 2 → Phase 4: Dashboard requires consent/audit infrastructure
- Phase 1 || Phase 3: Artifacts parallel (presentation layer, no PII dependencies)

**Critical path:** Phase 1 (7d) → Phase 2 (10d) → Phase 4 (4d) = **21 days minimum**
**Total elapsed:** 21 days with proper parallelization (Phase 3 runs during Phase 2)

---

### Research Flags

**Phases needing deeper research during planning:**
- Phase 1: Node-nlp NER model selection for email domain specificity
- Phase 2: Per-tenant key derivation security (pbkdf2 iteration count)
- Phase 4: Vault/KMS migration path (HashiCorp Vault vs AWS KMS vs Azure Key Vault)

**Phases with standard patterns (skip research-phase):**
- Phase 2: Consent/Audit (well-documented NestJS interceptor patterns)
- Phase 3: Artifacts (existing streamdown + assistant-ui documentation)
- Phase 4: Dashboard (standard CRUD + TanStack Query patterns)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Single new dependency with proven stability. Existing libraries already in codebase. |
| Features | **HIGH** | GDPR requirements legally mandated. Artifact types validated against Linear/Claude Code patterns. |
| Architecture | **HIGH** | NestJS interceptor pattern is framework-standard. Prisma middleware well-documented for v7.3+. |
| Pitfalls | **HIGH** | PII leakage backed by real breach (WotNot 2025) and Gartner survey (42% risk ranking). |

**Overall confidence:** **HIGH**

---

### Gaps to Address

1. **Node-nlp NER accuracy for email domain:** Test on sample corpus during Phase 1, adjust regex patterns if needed.
2. **pgvector Row-Level Security performance:** Benchmark with production-sized dataset. Consider tenant-specific embedding tables if RLS overhead >50ms.
3. **Prisma middleware encryption migration:** Zero-downtime migration script with batching (1000 records/batch).
4. **Consent banner UX placement:** UX research during Phase 2 sprint 1.
5. **Audit log storage growth:** Retention policy (90-day delete job) and partitioning strategy (monthly partitions).

---

## Sources

### Primary (HIGH confidence)

**GDPR Compliance:**
- SecurePrivacy: Complete GDPR Compliance Guide 2026
- SecurePrivacy: GDPR Consent Management 2026
- Konfirmity: GDPR Logging And Monitoring 2026

**PII & Tokenization:**
- Elastic: Protecting PII in RAG (Hybrid NER+Regex)
- DataStealth: Data Tokenization Solutions for PII Protection in 2026
- Protecto.ai: Advanced Data Tokenization 2025

**RAG Security:**
- We45: RAG Systems are Leaking Sensitive Data
- Mend: AI Vector & Embedding Security Risks
- Petronella: Secure RAG Enterprise Architecture

**NestJS Implementation:**
- Cropsly: Implementing Audit Logging in NestJS
- ByteHide: GDPR-Compliant Logging in NestJS
- Medium: Building an Audit Trail System in NestJS

**Encryption:**
- PostgreSQL: Encryption Options (Official Docs)
- prisma-field-encryption npm package

**AI Chat UX:**
- Vercel: AI SDK 6 Release (Streaming)
- Streamdown Documentation
- assistant-ui Library
- shadcn/ui AI Components

### Secondary (MEDIUM confidence)

**Competitor Analysis:**
- Superhuman Email Triage Guide
- Shortwave Review 2025
- Linear: Design for the AI Age

**Email Compliance:**
- Mailforge: GDPR Compliance Trends 2026
- SendCheckIt: GDPR Email Compliance Guide 2026

---

*Research completed: 2026-02-09*
*Ready for roadmap: YES*
*Total effort estimate: 19-28 days (4 phases)*
*Critical path: 21 days with parallelization*
