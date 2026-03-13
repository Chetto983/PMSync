---
phase: 74
slug: e2e-runtime-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (installed in frontend) |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium` |
| **Full suite command** | `cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium` |
| **Estimated runtime** | ~60-120 seconds |

---

## Sampling Rate

- **After every task commit:** Run specific spec: `cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium e2e/{spec}.spec.ts`
- **After every plan wave:** Run full suite: `cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | FE2E-01,02,03,04 | e2e | `npx playwright test --project=chromium` | ✅ | ⬜ pending |
| 74-01-02 | 01 | 1 | FE2E-01,02,03,04 | e2e | `npx playwright test --project=chromium` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test setup needed.

- All 4 spec files exist and are code-complete
- Playwright config is ready
- Docker compose test config exists
- Auth setup projects exist
- Seed automation is wired

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Start Docker containers | FE2E-01,02,03,04 | Requires Docker daemon | `docker compose -f backend/docker-compose.test.yml up -d` then verify health |
| Start backend server | FE2E-01,02,03,04 | Long-running process | `cd backend && npx dotenv-cli -e .env.test -- npm run start:dev` |
| Start frontend server | FE2E-01,02,03,04 | Long-running process | `cd frontend && npm run dev` |
| Verify org API 500 status | FE2E-01 | Requires runtime investigation | Try removing describe.skip, run org spec, check if 500 persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
