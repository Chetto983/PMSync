# Phase 4 — AI Security Guards COMPLETE (S07)

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Sprint** | S07 (16 SP) |
| **Tasks** | 7/7 |
| **Next** | Sprint 08 (Phase 5 — AI Chat Frontend) |

## Findings Addressed

| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| SEC-C1 | Critical | Fixed | Token-splitting detection (17 triggers, zero-width/space/BOM). Base64 payload detection (decode + keyword scan). NFKC normalization already present. 13 bypass vector tests. |
| SEC-H1 | High | Fixed | 4 Italian PII types: CODICE_FISCALE (structural validation), PARTITA_IVA (Luhn check-digit), IBAN_IT, PHONE_IT (+39/0039 mobile+landline). 10 tests. |
| SEC-H2 | High | Fixed | validateOutput() now checks defensive keyword echo-back (5 keywords) + system prompt overlap >50%. 6 tests. |
| SEC-H3 | High | Fixed | PII access audit trail via existing AuditLog table. Logs: tenantId, userId, sessionId, piiTypes, piiCount, accessContext. Never logs actual PII values. |
| SEC-M1 | Medium | Fixed | 8 missing @RequiresConsent decorators added: 3 follow-up endpoints, 2 KB endpoints, 3 ai-chat conversation endpoints. |
| SEC-M2 | Medium | Fixed | DEFENSIVE_PROMPT_VERSION = 'v1.0' static constant. [PROMPT_VERSION:v1.0] tag embedded in prompt. Tracked in AiRunLedger via promptHash(). |
| SEC-L1 | Low | Fixed | All patterns externalized to prompt-guard-patterns.json (v1.0). 17 jailbreak regexes, 17 token-split triggers, 13 base64 keywords, 5 defensive keywords. reloadPatterns() for hot-reload. |

## Last Modified Files

- `backend/src/modules/ai/guards/prompt-guard-sentinel.service.ts` — encoding bypass, echo-back, versioned prompt, config-loaded patterns
- `backend/src/modules/ai/guards/__tests__/prompt-guard-sentinel.service.spec.ts` — 62 tests (was 42)
- `backend/src/modules/ai/guards/pii-detection-sentinel.service.ts` — Italian PII patterns, fixed early-return bug
- `backend/src/modules/ai/guards/__tests__/pii-detection-sentinel.service.spec.ts` — 44 tests (was 34)
- `backend/src/modules/ai/guards/pii-resolution.service.ts` — PII access audit trail integration
- `backend/src/common/services/audit.service.ts` — logPiiAccess() method
- `backend/src/modules/ai/controllers/ai.controller.ts` — 3 @RequiresConsent added
- `backend/src/modules/ai/controllers/knowledge-base.controller.ts` — 2 @RequiresConsent added
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` — 3 @RequiresConsent added
- `backend/src/modules/ai/config/prompt-guard-patterns.json` — NEW: externalized patterns

## Key Decisions

- SEC-C1: Token-splitting checks strip ALL whitespace+zero-width, then match against trigger phrases without spaces. Only flags when suspicious spacing is detected (no false positives on normal text).
- SEC-C1: Base64 detection limited to 5 candidates per input and strings ≥20 chars to avoid false positives.
- SEC-H1: Italian PII patterns always run (fixed bug where Sentinel early-return skipped them). Partita IVA uses Luhn-like check digit for precision.
- SEC-H2: Defensive keyword check runs before overlap check (stronger signal). Two complementary detection strategies.
- SEC-H3: AuditService injected as @Optional() for backward compat. Fire-and-forget — never blocks resolution.
- SEC-M1: Skipped admin-only endpoints (migrate-embeddings, DELETE embeddings) and non-AI endpoints (notifications/mark-read).
- SEC-L1: Config loaded via readFileSync at module init (singleton). reloadPatterns() mutates module-level variables for hot-reload.

## Validation Status

- `npx tsc --noEmit` — PASS
- prompt-guard-sentinel tests — 62/62 PASS
- pii-detection-sentinel tests — 44/44 PASS
- audit.service tests — 9/9 PASS
