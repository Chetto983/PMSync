---
phase: 112-full-sync-validation
plan: 02
status: complete
started: 2026-03-26
completed: 2026-03-26
---

# Plan 112-02: Outlook + IMAP Validation (SYNC-02, SYNC-03)

## What Was Built

Outlook and IMAP full sync validators plus wired orchestrator for all three providers.

### Key Files Created

- `scripts/lib/validate-outlook.mjs` — Outlook/Microsoft validation (309 lines): provider discovery (providerType `microsoft`/`outlook`), folder hierarchy via specialUse, email count within 2500 budget, field spot-check (no labels — Outlook-specific), body content, dedup.
- `scripts/lib/validate-imap.mjs` — IMAP validation (314 lines): specialUse-based folder checks (locale-safe), does NOT assert externalId non-null on folders, skips labels, email count/field/dedup checks.
- `scripts/validate-full-sync.mjs` — Updated orchestrator imports all three provider modules, stubs removed.

## Results

**All three providers validated against production: 110/110 checks passed.**

| Provider | Checks | Folders | INBOX Emails | Dedup |
|----------|--------|---------|-------------|-------|
| Gmail    | 40/40  | 14      | 24          | 100 unique |
| Outlook  | 35/35  | 8       | 117         | 100 unique |
| IMAP     | 35/35  | 6       | 74          | 100 unique |

All system folders (INBOX, SENT, DRAFTS, TRASH) present for every provider. Field spot-checks (subject, from, to, receivedAt, externalId) pass on 5 emails each. Body content verified.

## Deviations

None — followed Plan 01's proven patterns and API fixes.

## Self-Check: PASSED

- [x] All 3 tasks completed (2 auto + 1 human-verify)
- [x] Outlook validator exports validateOutlook function
- [x] IMAP validator exports validateImap function
- [x] Orchestrator imports all three modules, no stubs remain
- [x] `node scripts/validate-full-sync.mjs --all --quick` exits 0 with 110/110 passed
- [x] All files under 500 lines
