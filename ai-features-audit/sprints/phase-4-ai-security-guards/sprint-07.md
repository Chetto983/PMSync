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
- [x] Read `prompt-guard-sentinel.service.ts` — map all regex patterns ✅ DONE
- [x] Add Unicode normalization before pattern matching (NFKC decomposition) ✅ Already present
- [x] Add base64 decode check for suspicious payloads ✅ DONE
- [x] Add token-splitting detection (e.g., `ig nore prev ious inst ructions`) ✅ DONE
- [x] Write tests: 10+ bypass vectors (homoglyphs, base64, whitespace injection, etc.) ✅ 13 tests
- [x] Addresses: **SEC-C1** ✅ DONE

### T-0702: Add Italian PII patterns to detection [3 SP]
- [x] Read `pii-detection-sentinel.service.ts` — map existing patterns ✅ DONE
- [x] Add: codice fiscale (16 char alphanumeric), IBAN (IT + 25 chars), partita IVA (11 digits) ✅ DONE
- [x] Add: Italian phone numbers (+39 prefix variants) ✅ DONE
- [x] Write tests for each Italian PII type ✅ 10 tests
- [x] Addresses: **SEC-H1** ✅ DONE

### T-0703: Add prompt echo-back detection to output validation [2 SP]
- [x] Read `prompt-guard-sentinel.service.ts` `validateOutput()` — trace checks ✅ DONE
- [x] Add check: if output contains > 50% of system prompt text, flag as prompt exfiltration ✅ DONE
- [x] Add check: if output contains defensive prompt keywords, suppress ✅ DONE
- [x] Addresses: **SEC-H2** ✅ DONE

### T-0704: Add PII access audit trail [2 SP]
- [x] Read `pii-resolution.service.ts` — trace unmasking flow ✅ DONE
- [x] Log PII access events: who, when, which PII type, which record ✅ DONE
- [x] Store in audit log (existing audit infrastructure or new table) ✅ Uses existing AuditLog table
- [x] Addresses: **SEC-H3** ✅ DONE

### T-0705: Audit @RequiresConsent coverage on all AI endpoints [2 SP]
- [x] Read `ai.controller.ts` — list all endpoints ✅ DONE
- [x] Read `ai-chat.controller.ts` — list all endpoints ✅ DONE
- [x] Read `knowledge-base.controller.ts` — list all endpoints ✅ DONE
- [x] Verify every mutating/AI-processing endpoint has `@RequiresConsent` ✅ 8 missing found
- [x] Add missing decorators ✅ 8 decorators added
- [x] Addresses: **SEC-M1** ✅ DONE

### T-0706: Version defensive system prompt [1 SP]
- [x] Read `prompt-guard-sentinel.service.ts` `getDefensiveSystemPrompt()` — locate prompt ✅ DONE
- [x] Add version constant: `DEFENSIVE_PROMPT_VERSION = 'v1.0'` ✅ Static readonly
- [x] Log version with every AI run in AiRunLedger ✅ Via promptHash() + version tag
- [x] Addresses: **SEC-M2** ✅ DONE

### T-0707: Externalize prompt guard patterns to config [2 SP]
- [x] Read patterns in `prompt-guard-sentinel.service.ts` ✅ DONE
- [x] Extract to JSON config file: `backend/src/modules/ai/config/prompt-guard-patterns.json` ✅ DONE
- [x] Load patterns at module init, allow hot-reload via admin endpoint ✅ reloadPatterns()
- [x] Addresses: **SEC-L1** ✅ DONE

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
