---
phase: 113
slug: incremental-sync-webhooks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 113 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone validation scripts (.mjs) + Playwright E2E |
| **Config file** | N/A (scripts follow existing Phase 112 pattern) |
| **Quick run command** | `node scripts/validate-incremental-sync.mjs --provider gmail` |
| **Full suite command** | `node scripts/validate-incremental-sync.mjs --all-providers && node scripts/validate-webhook-sync.mjs --all-providers` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run provider-specific validation script
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 113-01-01 | 01 | 0 | SYNC-04..08 | infra | `ls scripts/validate-incremental-sync.mjs scripts/validate-webhook-sync.mjs` | ❌ W0 | ⬜ pending |
| 113-01-02 | 01 | 1 | SYNC-04 | integration | `node scripts/validate-incremental-sync.mjs --provider gmail` | ❌ W0 | ⬜ pending |
| 113-01-03 | 01 | 1 | SYNC-05 | integration | `node scripts/validate-incremental-sync.mjs --provider microsoft` | ❌ W0 | ⬜ pending |
| 113-01-04 | 01 | 1 | SYNC-06 | integration | `node scripts/validate-incremental-sync.mjs --provider imap` | ❌ W0 | ⬜ pending |
| 113-02-01 | 02 | 2 | SYNC-07 | integration | `node scripts/validate-webhook-sync.mjs --provider gmail` | ❌ W0 | ⬜ pending |
| 113-02-02 | 02 | 2 | SYNC-08 | integration | `node scripts/validate-webhook-sync.mjs --provider microsoft` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-incremental-sync.mjs` — covers SYNC-04, SYNC-05, SYNC-06
- [ ] `scripts/validate-webhook-sync.mjs` — covers SYNC-07, SYNC-08

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gmail Pub/Sub topic configured | SYNC-07 | Requires Railway env var check | Check `GOOGLE_PUBSUB_TOPIC` in Railway dashboard |
| Microsoft public webhook URL | SYNC-08 | Requires Railway deployment URL | Check `API_PUBLIC_URL` or `MICROSOFT_EMAIL_WEBHOOK_URL` |
| IMAP CONDSTORE support | SYNC-06 | Server capability varies | Check `hasCondstore` in sync logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
