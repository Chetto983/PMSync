---
phase: 36
slug: encrypted-search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `npx jest --testPathPattern=<pattern> --no-coverage` |
| **Full suite command** | `npm run test --prefix backend` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=<relevant-pattern> --no-coverage`
- **After every plan wave:** Run `npm run test --prefix backend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | SEC-02a | unit | `npx jest --testPathPattern=field-encryption.utils.spec --no-coverage` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | SEC-02b | unit | `npx jest --testPathPattern=field-encryption.utils.spec --no-coverage` | ❌ W0 | ⬜ pending |
| 36-01-03 | 01 | 1 | SEC-02c | unit | `npx jest --testPathPattern=field-encryption.utils.spec --no-coverage` | ❌ W0 | ⬜ pending |
| 36-01-04 | 01 | 1 | SEC-02d | unit | `npx jest --testPathPattern=tenant-key.service.spec --no-coverage` | ❌ W0 | ⬜ pending |
| 36-01-05 | 01 | 1 | SEC-02e | unit | `npx jest --testPathPattern=backfill-from-hash --no-coverage` | ❌ W0 | ⬜ pending |
| 36-01-06 | 01 | 1 | SEC-02f | unit | `npx jest --testPathPattern=hash-search.service --no-coverage` | ❌ W0 | ⬜ pending |
| 36-01-07 | 01 | 1 | SEC-02g | unit | `npx jest --testPathPattern=hash-search.service --no-coverage` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 2 | SEC-02h | unit | `npx jest --testPathPattern=sync-message-processor --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/prisma/encryption/__tests__/field-encryption.utils.spec.ts` — add hmacForBlindIndex tests (SEC-02a, SEC-02b, SEC-02c)
- [ ] `backend/src/common/services/__tests__/tenant-key.service.spec.ts` — add getHmacKey test (SEC-02d)
- [ ] `backend/src/scripts/__tests__/backfill-from-hash.spec.ts` — covers SEC-02e
- [ ] `backend/src/common/services/__tests__/hash-search.service.spec.ts` — covers SEC-02f, SEC-02g

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Architecture decision document quality | SC-1 | Document review, not automatable | Read `docs/adr/036-encrypted-search.md`, verify it explains why subject stays plaintext and why substring search is incompatible with HMAC |
| Threat model completeness | SC-4 | Document review | Verify threat model covers offline DB theft protection and acknowledges frequency analysis risk |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
