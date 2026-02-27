# Requirements: MailAgent v3.1

**Defined:** 2026-02-09
**Updated:** 2026-02-26 (gap closure from v3.1 audit: phases 20-21 added, ENC-03 deferred to v3.2, checkboxes updated)
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v3.1 Requirements

Requirements for GDPR Compliance & Chatbot Enhancement milestone.

### PII Protection (PII-01 to PII-04)

- [x] **PII-01**: System tokenizes PII (emails, names, phones) before sending to LLM
- [x] **PII-02**: System restores PII tokens when displaying AI responses to user
- [x] **PII-03**: System restores PII tokens when executing AI tool calls
- [x] **PII-04**: RAG embeddings are generated from PII-sanitized content

### Encryption at Rest (ENC-01 to ENC-05)

- [x] **ENC-01**: Tier 1 PII fields (bodyText, bodyHtml, snippet) encrypted at rest using custom Prisma extension (AES-256-GCM). Tier 2 fields (from, subject, displayName) deferred — requires search infrastructure redesign (17+ query sites use contains/insensitive on these fields)
- [x] **ENC-02**: Per-tenant key derivation (master key + tenant ID via HKDF → derived encryption key)
- [ ] **ENC-03**: _(Deferred to v3.2)_ Hash-based search indexes on encrypted fields (SHA-256 for exact match queries). Only needed when Tier 2 searchable fields are encrypted, which requires search redesign first
- [x] **ENC-04**: Migration of existing email body content (backfill encrypt bodyText, bodyHtml, snippet). Contact/CalendarEvent models have no Tier 1 body fields to encrypt
- [x] **ENC-05**: Key rotation support (new key encrypts, old keys in keychain still decrypt)

### Consent Management (CONS-01 to CONS-03)

- [x] **CONS-01**: User can view and modify granular consent settings per feature
- [x] **CONS-02**: System blocks data processing until consent is captured
- [x] **CONS-03**: System maintains versioned consent audit trail

### Audit Logging (AUDIT-01 to AUDIT-03)

- [x] **AUDIT-01**: System logs all data access events with user/tenant context
- [x] **AUDIT-02**: System logs all AI tool executions with input/output summary
- [x] **AUDIT-03**: Audit logs are retained for 3 years per GDPR requirements

### Data Rights (DATA-01 to DATA-03)

- [x] **DATA-01**: User can request complete data export (emails, contacts, calendar)
- [x] **DATA-02**: User can request account deletion (right to erasure)
- [x] **DATA-03**: System performs hard delete after 30-day grace period

### Legal Documents (LEGAL-01 to LEGAL-02)

- [x] **LEGAL-01**: User must accept Terms of Service before using app
- [x] **LEGAL-02**: User must accept Privacy Policy before using app

### Rich Artifacts (ARTIFACT-01 to ARTIFACT-06)

- [x] **ARTIFACT-01**: AI chat renders email artifacts with interactive UI
- [x] **ARTIFACT-02**: AI chat renders calendar event artifacts with interactive UI
- [x] **ARTIFACT-03**: AI chat renders contact artifacts with interactive UI
- [x] **ARTIFACT-04**: AI chat renders follow-up artifacts with interactive UI
- [x] **ARTIFACT-05**: AI chat renders daily briefing artifacts with interactive UI
- [x] **ARTIFACT-06**: AI chat renders CRM/relationship artifacts with interactive UI

### AI Triage (TRIAGE-01 to TRIAGE-02)

- [x] **TRIAGE-01**: AI assigns emails to appropriate nested label based on content
- [x] **TRIAGE-02**: User can bulk-apply AI triage suggestions to multiple emails

### Bulk Operations (BULK-01 to BULK-02)

- [x] **BULK-01**: User can batch-apply labels to selected emails via AI
- [x] **BULK-02**: User can batch-create follow-ups for selected emails via AI

### AI Drafts (DRAFT-01 to DRAFT-02)

- [x] **DRAFT-01**: AI generates full reply drafts based on email context
- [x] **DRAFT-02**: AI drafts match user's writing style (learned from sent emails)

## Future Requirements (v3.2+)

### Advanced Privacy

- **PRIV-01**: Zero-knowledge architecture (server cannot read content)
- **PRIV-02**: Cross-border data transfer compliance (SCCs)

### Encryption (deferred from v3.1)

- **ENC-03**: Hash-based search indexes on encrypted fields (requires search infrastructure redesign across 17+ query sites)

### Advanced AI

- **AI-01**: Predicted response suggestions (quick replies)
- **AI-02**: Email categorization (Primary, Social, Promotions)
- **AI-03**: Smart scheduling suggestions

## Out of Scope

| Feature | Reason |
|---------|--------|
| End-to-end encryption | Requires separate security audit, high complexity |
| Mobile app | Web-first, responsive design covers mobile use cases |
| Offline support | Requires service worker complexity |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PII-01 | Phase 13 | Complete |
| PII-02 | Phase 13 | Complete |
| PII-03 | Phase 13 | Complete |
| PII-04 | Phase 13 | Complete |
| ENC-01 | Phase 14 | Complete |
| ENC-02 | Phase 14 | Complete |
| ENC-03 | Deferred (v3.2) | Deferred |
| ENC-04 | Phase 14 | Complete |
| ENC-05 | Phase 14 | Complete |
| CONS-01 | Phase 15 | Complete |
| CONS-02 | Phase 20 | Complete |
| CONS-03 | Phase 15 | Complete |
| AUDIT-01 | Phase 15 | Complete |
| AUDIT-02 | Phase 15 | Complete |
| AUDIT-03 | Phase 15 | Complete |
| DATA-01 | Phase 16 | Complete |
| DATA-02 | Phase 16 | Complete |
| DATA-03 | Phase 16 | Complete |
| LEGAL-01 | Phase 20 | Complete |
| LEGAL-02 | Phase 20 | Complete |
| ARTIFACT-01 | Phase 17 | Complete |
| ARTIFACT-02 | Phase 17 | Complete |
| ARTIFACT-03 | Phase 17 | Complete |
| ARTIFACT-04 | Phase 17 | Complete |
| ARTIFACT-05 | Phase 17 | Complete |
| ARTIFACT-06 | Phase 17 | Complete |
| TRIAGE-01 | Phase 18 | Complete |
| TRIAGE-02 | Phase 22 | Complete |
| BULK-01 | Phase 18 | Complete |
| BULK-02 | Phase 18 | Complete |
| DRAFT-01 | Phase 19 | Complete |
| DRAFT-02 | Phase 19 | Complete |

**Coverage:**
- v3.1 requirements: 32 total
- Complete: 31 (97%)
- Deferred to v3.2: 1 (ENC-03)
- Mapped to phases: 31 (ENC-03 deferred)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-27 — v3.1 milestone closed, all requirements resolved (31 complete, 1 deferred)*
