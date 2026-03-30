---
phase: 112-full-sync-validation
plan: 01
status: complete
started: 2026-03-26
completed: 2026-03-26
---

# Plan 112-01: Validation Helper Library + Gmail Sync Validation

## What Was Built

Shared validation infrastructure and Gmail full sync validator (SYNC-01).

### Key Files Created

- `scripts/lib/validation-helpers.mjs` — Shared infrastructure: CDP connection, cookie-based auth, API helpers (apiGet/apiPost), assertion functions (assertEqual/assertRange/assertTrue), sync polling, and reporting. 11 exports + 2 URL constants.
- `scripts/lib/validate-gmail.mjs` — Gmail-specific validation: provider discovery, sync trigger, folder hierarchy validation, email count validation, field spot-check (5 emails), body fetch, and dedup check.
- `scripts/validate-full-sync.mjs` — Main orchestrator: `--provider` and `--quick` flags, fetches providers from `/api/v1/providers`, routes to per-provider validators.

## Results

**Gmail validation: 40/40 checks passed** against production (Railway backend + Vercel frontend).

Validated:
- 14 Gmail folders with all system folders (INBOX, SENT, DRAFTS, TRASH) present
- 23 INBOX emails within budget (1-2500)
- Field spot-check: subject, from, to, receivedAt, externalId, labels all correct on 5 emails
- Body content: bodyHtml present on single email fetch
- Dedup: 100 emails with unique externalIds

## Deviations

1. **Provider discovery**: Original plan used `/api/v1/email-sync/status` which only returns aggregate counts. Fixed to use `/api/v1/providers` which returns individual provider records with `providerType` and `email`.
2. **Folder response parsing**: API returns `{ data: { provider, folders: [...] } }`, not `{ data: [...] }`. Fixed extraction path.
3. **Provider-scoped email queries**: Added `providerId` query param to all email API calls to avoid cross-provider contamination.

## Self-Check: PASSED

- [x] All 3 tasks completed (2 auto + 1 human-verify)
- [x] Scripts syntax-check cleanly
- [x] All exports present in validation-helpers.mjs
- [x] Gmail validation exits 0 with 40/40 checks passing
- [x] No hardcoded provider IDs or tenant IDs
