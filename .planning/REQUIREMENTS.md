# Requirements: MailAgent v3.1

**Defined:** 2026-02-09
**Updated:** 2026-02-11 (added ENC requirements, renumbered phases)
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v3.1 Requirements

Requirements for GDPR Compliance & Chatbot Enhancement milestone.

### PII Protection (PII-01 to PII-04)

- [ ] **PII-01**: System tokenizes PII (emails, names, phones) before sending to LLM
- [ ] **PII-02**: System restores PII tokens when displaying AI responses to user
- [ ] **PII-03**: System restores PII tokens when executing AI tool calls
- [ ] **PII-04**: RAG embeddings are generated from PII-sanitized content

### Encryption at Rest (ENC-01 to ENC-05)

- [ ] **ENC-01**: Tier 1 PII fields (bodyText, bodyHtml, snippet) encrypted at rest using custom Prisma extension (AES-256-GCM). Tier 2 fields (from, subject, displayName) deferred — requires search infrastructure redesign (17+ query sites use contains/insensitive on these fields)
- [ ] **ENC-02**: Per-tenant key derivation (master key + tenant ID via HKDF → derived encryption key)
- [ ] **ENC-03**: _(Deferred from Phase 14)_ Hash-based search indexes on encrypted fields (SHA-256 for exact match queries). Only needed when Tier 2 searchable fields are encrypted, which requires search redesign first
- [ ] **ENC-04**: Migration of existing email body content (backfill encrypt bodyText, bodyHtml, snippet). Contact/CalendarEvent models have no Tier 1 body fields to encrypt
- [ ] **ENC-05**: Key rotation support (new key encrypts, old keys in keychain still decrypt)

### Consent Management (CONS-01 to CONS-03)

- [ ] **CONS-01**: User can view and modify granular consent settings per feature
- [ ] **CONS-02**: System blocks data processing until consent is captured
- [ ] **CONS-03**: System maintains versioned consent audit trail

### Audit Logging (AUDIT-01 to AUDIT-03)

- [ ] **AUDIT-01**: System logs all data access events with user/tenant context
- [ ] **AUDIT-02**: System logs all AI tool executions with input/output summary
- [ ] **AUDIT-03**: Audit logs are retained for 3 years per GDPR requirements

### Data Rights (DATA-01 to DATA-03)

- [ ] **DATA-01**: User can request complete data export (emails, contacts, calendar)
- [ ] **DATA-02**: User can request account deletion (right to erasure)
- [ ] **DATA-03**: System performs hard delete after 30-day grace period

### Legal Documents (LEGAL-01 to LEGAL-02)

- [ ] **LEGAL-01**: User must accept Terms of Service before using app
- [ ] **LEGAL-02**: User must accept Privacy Policy before using app

### Rich Artifacts (ARTIFACT-01 to ARTIFACT-06)

- [ ] **ARTIFACT-01**: AI chat renders email artifacts with interactive UI
- [ ] **ARTIFACT-02**: AI chat renders calendar event artifacts with interactive UI
- [ ] **ARTIFACT-03**: AI chat renders contact artifacts with interactive UI
- [ ] **ARTIFACT-04**: AI chat renders follow-up artifacts with interactive UI
- [ ] **ARTIFACT-05**: AI chat renders daily briefing artifacts with interactive UI
- [ ] **ARTIFACT-06**: AI chat renders CRM/relationship artifacts with interactive UI

### AI Triage (TRIAGE-01 to TRIAGE-02)

- [ ] **TRIAGE-01**: AI assigns emails to appropriate nested label based on content
- [x] **TRIAGE-02**: User can bulk-apply AI triage suggestions to multiple emails

### Bulk Operations (BULK-01 to BULK-02)

- [ ] **BULK-01**: User can batch-apply labels to selected emails via AI
- [ ] **BULK-02**: User can batch-create follow-ups for selected emails via AI

### AI Drafts (DRAFT-01 to DRAFT-02)

- [ ] **DRAFT-01**: AI generates full reply drafts based on email context
- [ ] **DRAFT-02**: AI drafts match user's writing style (learned from sent emails)

## Future Requirements (v3.2+)

### Advanced Privacy

- **PRIV-01**: Zero-knowledge architecture (server cannot read content)
- **PRIV-02**: Cross-border data transfer compliance (SCCs)

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
| PII-01 | Phase 13 | Pending |
| PII-02 | Phase 13 | Pending |
| PII-03 | Phase 13 | Pending |
| PII-04 | Phase 13 | Pending |
| ENC-01 | Phase 14 | Pending |
| ENC-02 | Phase 14 | Pending |
| ENC-03 | Phase 14 | Pending |
| ENC-04 | Phase 14 | Pending |
| ENC-05 | Phase 14 | Pending |
| CONS-01 | Phase 15 | Pending |
| CONS-02 | Phase 15 | Pending |
| CONS-03 | Phase 15 | Pending |
| AUDIT-01 | Phase 15 | Pending |
| AUDIT-02 | Phase 15 | Pending |
| AUDIT-03 | Phase 15 | Pending |
| DATA-01 | Phase 16 | Pending |
| DATA-02 | Phase 16 | Pending |
| DATA-03 | Phase 16 | Pending |
| LEGAL-01 | Phase 16 | Pending |
| LEGAL-02 | Phase 16 | Pending |
| ARTIFACT-01 | Phase 17 | Pending |
| ARTIFACT-02 | Phase 17 | Pending |
| ARTIFACT-03 | Phase 17 | Pending |
| ARTIFACT-04 | Phase 17 | Pending |
| ARTIFACT-05 | Phase 17 | Pending |
| ARTIFACT-06 | Phase 17 | Pending |
| TRIAGE-01 | Phase 18 | Pending |
| TRIAGE-02 | Phase 18 | Complete |
| BULK-01 | Phase 18 | Pending |
| BULK-02 | Phase 18 | Pending |
| DRAFT-01 | Phase 19 | Pending |
| DRAFT-02 | Phase 19 | Pending |

**Coverage:**
- v3.1 requirements: 32 total
- Mapped to phases: 32 (100% coverage)
- Unmapped: 0

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-11 — added ENC-01 to ENC-05 for prisma-field-encryption, renumbered phases 14-18 to 15-19*
