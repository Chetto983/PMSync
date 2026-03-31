# Sprint 07 — Prompt Guard, PII Detection & Consent

| Campo | Valore |
|-------|--------|
| **Phase** | 4 — AI Security & Guards |
| **Sprint** | 07 |
| **SP** | 16 |
| **Objective** | Harden prompt injection detection, add Italian PII patterns, fix output validation, add PII audit trail, verify consent on all endpoints |
| **Addresses** | SEC-C1, SEC-H1, SEC-H2, SEC-H3, SEC-M1, SEC-M2, SEC-L1 |

---

## Sprint Backlog

### T-0701: Harden prompt injection detection against encoding bypasses [4 SP]
- [ ] Read `prompt-guard-sentinel.service.ts` — map all regex patterns
- [ ] Add Unicode normalization before pattern matching (NFKC decomposition)
- [ ] Add base64 decode check for suspicious payloads
- [ ] Add token-splitting detection (e.g., `ig nore prev ious inst ructions`)
- [ ] Write tests: 10+ bypass vectors (homoglyphs, base64, whitespace injection, etc.)
- [ ] Addresses: **SEC-C1**

### T-0702: Add Italian PII patterns to detection [3 SP]
- [ ] Read `pii-detection-sentinel.service.ts` — map existing patterns
- [ ] Add: codice fiscale (16 char alphanumeric), IBAN (IT + 25 chars), partita IVA (11 digits)
- [ ] Add: Italian phone numbers (+39 prefix variants)
- [ ] Write tests for each Italian PII type
- [ ] Addresses: **SEC-H1**

### T-0703: Add prompt echo-back detection to output validation [2 SP]
- [ ] Read `prompt-guard-sentinel.service.ts` `validateOutput()` — trace checks
- [ ] Add check: if output contains > 50% of system prompt text, flag as prompt exfiltration
- [ ] Add check: if output contains defensive prompt keywords, suppress
- [ ] Addresses: **SEC-H2**

### T-0704: Add PII access audit trail [2 SP]
- [ ] Read `pii-resolution.service.ts` — trace unmasking flow
- [ ] Log PII access events: who, when, which PII type, which record
- [ ] Store in audit log (existing audit infrastructure or new table)
- [ ] Addresses: **SEC-H3**

### T-0705: Audit @RequiresConsent coverage on all AI endpoints [2 SP]
- [ ] Read `ai.controller.ts` — list all endpoints
- [ ] Read `ai-chat.controller.ts` — list all endpoints
- [ ] Read `knowledge-base.controller.ts` — list all endpoints
- [ ] Verify every mutating/AI-processing endpoint has `@RequiresConsent('ai_email_processing')`
- [ ] Add missing decorators
- [ ] Addresses: **SEC-M1**

### T-0706: Version defensive system prompt [1 SP]
- [ ] Read `prompt-guard-sentinel.service.ts` `getDefensiveSystemPrompt()` — locate prompt
- [ ] Add version constant: `DEFENSIVE_PROMPT_VERSION = 'v1.0'`
- [ ] Log version with every AI run in AiRunLedger
- [ ] Addresses: **SEC-M2**

### T-0707: Externalize prompt guard patterns to config [2 SP]
- [ ] Read patterns in `prompt-guard-sentinel.service.ts`
- [ ] Extract to JSON config file: `backend/src/modules/ai/config/prompt-guard-patterns.json`
- [ ] Load patterns at module init, allow hot-reload via admin endpoint
- [ ] Addresses: **SEC-L1**

---

## Dependencies

- None (security can be hardened independently)

## Risks

1. **T-0701** — Over-aggressive detection could block legitimate user prompts. Add false-positive test cases.
2. **T-0702** — Italian PII patterns may conflict with other data formats. Validate precision.
3. **T-0707** — External config must not be user-writable. Admin-only endpoint with auth guard.

## Definition of Done

- [ ] Prompt injection detection resists Unicode, base64, and token-splitting bypass
- [ ] Italian PII (codice fiscale, IBAN, partita IVA, phone) detected and masked
- [ ] Output validation catches prompt echo-back attacks
- [ ] PII unmasking logged to audit trail
- [ ] All AI endpoints verified for consent enforcement
- [ ] Defensive prompt versioned and tracked per run
- [ ] Prompt guard patterns externalized to config
- [ ] `npx tsc --noEmit` passes on backend
