---
phase: 120
slug: queue-webhook-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 120 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS default) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern queue-webhook --bail` |
| **Full suite command** | `cd backend && npx jest --testPathPattern queue-webhook` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern queue-webhook --bail`
- **After every plan wave:** Run `cd backend && npx jest --testPathPattern queue-webhook`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 120-01-01 | 01 | 1 | INFRA-01 | integration | `npx jest queue-health` | ❌ W0 | ⬜ pending |
| 120-01-02 | 01 | 1 | INFRA-02 | integration | `npx jest queue-pause-resume` | ❌ W0 | ⬜ pending |
| 120-02-01 | 02 | 1 | INFRA-03 | integration | `npx jest gmail-webhook` | ❌ W0 | ⬜ pending |
| 120-02-02 | 02 | 1 | INFRA-04 | integration | `npx jest ms-graph-webhook` | ❌ W0 | ⬜ pending |
| 120-03-01 | 03 | 2 | INFRA-05 | integration | `npx jest webhook-health` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/email/queues/__tests__/queue-health.spec.ts` — stubs for INFRA-01
- [ ] `backend/src/modules/email/queues/__tests__/queue-pause-resume.spec.ts` — stubs for INFRA-02
- [ ] `backend/src/modules/email/webhooks/__tests__/gmail-webhook.spec.ts` — stubs for INFRA-03
- [ ] `backend/src/modules/email/webhooks/__tests__/ms-graph-webhook.spec.ts` — stubs for INFRA-04
- [ ] `backend/src/modules/email/webhooks/__tests__/webhook-health.spec.ts` — stubs for INFRA-05

*Existing jest infrastructure covers framework needs — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gmail Pub/Sub renewal in production | INFRA-03 | Requires real Google Cloud project with push subscription | Deploy to Railway, verify renewal via `/webhooks/health` endpoint |
| MS Graph subscription renewal in production | INFRA-04 | Requires real Microsoft Graph API access and public callback URL | Deploy to Railway, verify via `/webhooks/health` endpoint |
| Prometheus metrics scraping | INFRA-01 | Requires Prometheus server or compatible scraper | Hit `/metrics` endpoint, verify queue gauges present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
