---
phase: 32
slug: architecture-decoupling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 + ts-jest (backend) |
| **Config file** | backend/jest.config.js |
| **Quick run command** | `cd backend && npx tsc --noEmit && npx madge --circular --extensions ts --ts-config tsconfig.json src` |
| **Full suite command** | `cd backend && npx jest --passWithNoTests --ci --forceExit` |
| **Estimated runtime** | ~30 seconds (tsc) + ~10 seconds (madge) + ~60 seconds (jest) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit && npx madge --circular --extensions ts --ts-config tsconfig.json src`
- **After every plan wave:** Run `cd backend && npx jest --passWithNoTests --ci --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green + madge <=5 + dep-cruiser exits 0
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | ARCH-01 | unit | `cd backend && npx jest --testPathPattern=tool-registry --forceExit` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | ARCH-02 | integration | `cd backend && npx jest --testPathPattern=event-wiring --forceExit` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 2 | ARCH-01 | smoke (build) | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 32-02-02 | 02 | 2 | ARCH-01 | smoke (CLI) | `cd backend && npx madge --circular --extensions ts --ts-config tsconfig.json src` | ✅ | ⬜ pending |
| 32-03-01 | 03 | 3 | ARCH-03 | smoke (CLI) | `cd backend && npx depcruise --config .dependency-cruiser.cjs --ignore-known .dependency-cruiser-known-violations.json src` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/modules/tool-registry/__tests__/tool-registry.service.spec.ts` — unit test for ToolRegistryService (ARCH-01)
- [ ] `backend/src/common/events/__tests__/event-wiring.spec.ts` — integration test for event emit + @OnEvent handler (ARCH-02)
- [ ] `madge` npm package — install as devDependency in backend/package.json

*All other verifications use existing CLI tools (tsc, madge, depcruise) that don't require test file creation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| dep-cruiser CI step blocks PRs with new circular deps | ARCH-03 | Requires GitHub Actions run | Introduce deliberate circular import in a branch, push, verify CI fails |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
