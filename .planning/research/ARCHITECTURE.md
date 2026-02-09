# Architecture Research: GDPR & Chatbot Integration

**Project:** MailAgent  
**Researched:** 2026-02-09  
**Confidence:** HIGH (existing architecture + 2025 best practices verified)

## Executive Summary

This research examines how GDPR compliance and chatbot improvements integrate with MailAgent's NestJS + Next.js architecture. The system has foundational PII detection (Sentinel) and basic GDPR support.

**Key Finding:** Layered security with PII tokenization at request entry, encryption via Prisma middleware, audit logging via interceptors, and rich artifacts using component-based rendering with sandboxing.

---

## PII Tokenization Architecture

### Current ✅
- PiiDetectionService (Sentinel) - 12 PII types
- PiiResolutionService - Redis mappings (session-scoped, 30min TTL)
- Integrated in VoltAgent chat

### Enhancement: Global PII Interceptor
Apply `PiiDetectionInterceptor` globally via APP_INTERCEPTOR between TenantGuard and Controller.

**Best Practice Compliance:** Deterministic tokenization, session-scoped tokens, short-lived mappings, vaulted architecture.

---

## Encryption at Rest

### Current ⚠️
Partial (provider credentials only)

### Enhancement: Prisma Middleware
Application-layer encryption for Email.bodyText, Contact.notes, AIMemory.content.

**Schema:** Add IV columns (bodyTextIv, notesIv, contentIv)  
**Performance:** < 5ms per field  
**Key Management:** Phase 4 migrate to Vault/KMS

---

## Audit Logging

### Current ⚠️
Minimal (table exists, manual logging)

### Enhancement: Audit Interceptor
NestJS interceptor with @Auditable() decorator. Apply to sensitive controllers (Contacts, Emails, Users).

**GDPR:** Data minimization, pseudonymization, 90-day retention, admin-only access.  
**Performance:** 10k logs/min via BullMQ batching.

---

## Consent Management

### Current ❌
Not implemented

### Enhancement: Consent Guard
ConsentRecord table with ConsentType enum. ConsentGuard enforces via @RequiresConsent() decorator.

**Frontend:** TanStack Query hooks for consent status/grant/revoke.

---

## Rich Artifacts

### Pattern
Backend tools return JSON artifacts (email-draft, contact-card, data-visualization, code-snippet).  
Frontend ArtifactRenderer switches on type and renders domain-specific components.

**Security:** Sandpack for code execution (isolated iframe), DOMPurify for HTML, CSP headers.

---

## Build Order (19-28 days)

**Phase 1: Core GDPR (7-10d)**  
- Consent Management (2-3d)
- Audit Logging (3-4d)
- Encryption at Rest (2-3d)

**Phase 2: Enhanced PII (4-6d)**  
- Global PII Detection (2-3d)
- GDPR Dashboard (2-3d)

**Phase 3: Rich Artifacts (5-7d)**  
- Backend Framework (2-3d)
- Frontend Renderer (3-4d)

**Phase 4: Security (3-5d)**  
- Key Management (2-3d)
- Security Audit (1-2d)

**Dependencies:** Phase 1 blocks 2+4. Phase 3 parallel with Phase 2.

---

## Sources

- [Advanced Data Tokenization 2025](https://www.protecto.ai/blog/advanced-data-tokenization/)
- [PII Compliance Checklist](https://www.networkintelligence.ai/blogs/pii-compliance-checklist/)
- [PostgreSQL Encryption Options](https://www.postgresql.org/docs/current/encryption-options.html)
- [Audit Trail in NestJS](https://medium.com/@solomoncodes/building-an-audit-trail-system-in-nestjs-222a4604a6a2)
- [GDPR Logging in NestJS](https://www.bytehide.com/blog/gdpr-compliant-logging-in-nestjs/)
- [shadcn/ui AI Components](https://www.shadcn.io/ai)
- [assistant-ui Library](https://github.com/assistant-ui/assistant-ui)
- [React + AI Stack 2025](https://www.builder.io/blog/react-ai-stack)
