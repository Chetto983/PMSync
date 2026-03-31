# Sprint 05 — Checkpoint

## Status

- **Sprint:** 05 — Google Calendar+Contacts Provider Hardening
- **Last Task Completed:** T-0505 — Error classification and typed error hierarchy
- **Next Task:** Sprint 06 (Microsoft Provider Hardening)
- **Tasks Done:** 5/5
- **SP Completed:** 15/15
- **Last Updated:** 2026-03-31 10:00

## Audit Findings Addressed

- CAL-C2: Sync token expiration fallback — already handled in abstract-calendar-sync.service.ts (410/404 detection)
- CON-C1: Google sync token 7-day expiry — FALSE POSITIVE (contacts do full fetch, no sync tokens)
- CON-C2: Contact etag not checked — fixed in S04 (etag enforcement + 409 retry)
- CON-C3: Parallel contact mutations — fixed in S04 (Redis write mutex)
- CON-M3: Contact photo sync etag — fixed: photoEtag stored, default photos skipped

## Last Modified Files

- backend/src/modules/providers/errors/google-provider.error.ts (NEW — typed error hierarchy)
- backend/src/modules/providers/errors/index.ts (NEW — barrel export)
- backend/src/modules/providers/services/google-oauth.service.ts (typed errors in refreshAccessToken)
- backend/src/modules/email-sync/services/provider-token.service.ts (WebSocket notify + typed error handling)
- backend/src/modules/calendar/services/google-calendar-sync.service.ts (429 retry with backoff)
- backend/src/modules/contacts/services/google-contacts-sync.service.ts (pagination throttle + photo etag)
- backend/src/modules/contacts/services/base-contacts-sync.service.ts (photoEtag in ExtractedContactData)
- backend/src/modules/contacts/services/contact-provider-ops.service.ts (photo cache comment)

## Key Decisions Made

- GoogleProviderError hierarchy lives in providers/errors/ (shared by calendar + contacts)
- GoogleOAuthService now throws typed GoogleAuthError/GoogleRateLimitError instead of NestJS exceptions
- ProviderTokenService handles both typed and legacy errors for backward compatibility
- Photo URL used as etag equivalent (Google embeds unique hash in URL)
- Default/placeholder Google photos skipped (isDefaultPhoto check)
- Inter-page delay of 700ms for large contact list pagination
- Calendar API calls wrapped with withGoogleRetry (max 3 retries, exponential backoff)
- Per-provider rate limiting already existed in RedisLockService (100/min for Google)

## Blockers / Notes

- Some T-0501 and T-0504 changes were absorbed into commits by another parallel session (wrong commit messages)
- Pre-existing TS errors in ai-chat test files (unrelated to this sprint)

## Validation Status

- Backend tsc: passing (3 pre-existing errors in ai-chat tests)
- Google OAuth unit tests: 9/12 passing (3 integration tests need live DB)
