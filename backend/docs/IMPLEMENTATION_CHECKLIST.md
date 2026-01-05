# Driver Implementation Checklist

> **Purpose**: Mandatory checklist before writing ANY driver code
> **Date**: 2025-01-05
> **Rule**: Check EVERY box before considering implementation complete

---

## Pre-Implementation Checklist

### Before Writing ANY Code

- [ ] Read `DRIVER_IMPLEMENTATION_SPEC.md` completely
- [ ] Read `GMAIL_API_COMPREHENSIVE_REFERENCE.md` (if Gmail)
- [ ] Read `MICROSOFT_GRAPH_API_COMPREHENSIVE_GUIDE.md` (if Microsoft)
- [ ] Read `IMAP_PROTOCOL_COMPREHENSIVE_GUIDE.md` (if IMAP)
- [ ] Understand the `IEmailDriver` interface in `email-driver.interface.ts`
- [ ] Understand `CanonicalMessage` and `CanonicalFolder` types
- [ ] Review existing driver implementations for patterns

---

## Critical Implementation Requirements

### Microsoft Driver MUST

- [ ] Include `Prefer: IdType="ImmutableId"` header in ALL requests
- [ ] Store deltaLink as FULL URL (not just token part)
- [ ] Handle 410 Gone as sync token expired
- [ ] Use BATCH_SIZE = 20 (hard limit, NOT 50!)
- [ ] Recursively fetch child folders

### Gmail Driver MUST

- [ ] Use historyId as BigInt string for delta sync
- [ ] Handle 404 on history.list as expired token
- [ ] Use BATCH_SIZE = 50 (recommended, max 100)
- [ ] Map CATEGORY_PERSONAL to INBOX (not separate folder)
- [ ] Use `prompt=consent` for refresh tokens

### IMAP Driver MUST

- [ ] Use ImapFlow library (not node-imap)
- [ ] Check UIDVALIDITY on every folder open
- [ ] Use CONDSTORE/MODSEQ when available
- [ ] Maintain connection pool (max 3 connections)
- [ ] Handle IDLE with 29-minute timeout
- [ ] Use UIDs, NEVER sequence numbers

---

## Error Handling Requirements

### ALL Drivers MUST

- [ ] Detect and throw `AuthError` for 401/invalid_grant
- [ ] Retry 429 with Retry-After header
- [ ] Retry 5xx errors 3x with exponential backoff
- [ ] Return `null` for 404 on getMessage (not throw)
- [ ] Handle sync token expiration gracefully

### Prisma Operations MUST

- [ ] Retry on P2002 (unique constraint)
- [ ] Retry on P2034 (deadlock)
- [ ] Use exponential backoff (50ms → 100ms → 200ms)
- [ ] Max 3 retry attempts

---

## DB Mapping Validation

### Email Table

- [ ] `externalId` is provider's message ID
- [ ] `folder` is canonical type (INBOX, SENT, etc.)
- [ ] `from` is serialized as "Name <email>" string
- [ ] `to`, `cc`, `bcc` are string arrays
- [ ] `labels` preserves provider labels/categories
- [ ] `metadata` stores providerMetadata JSON

### Folder Table

- [ ] `externalId` is provider's folder ID
- [ ] `specialUse` is canonical type
- [ ] `path` includes parent hierarchy
- [ ] `isSystem` = true for INBOX, SENT, DRAFTS, TRASH, SPAM
- [ ] `uidValidity` stored for IMAP folders

---

## Test Requirements

### Unit Tests (per method)

- [ ] Happy path returns correct data
- [ ] Error path throws/returns correctly
- [ ] Pagination works
- [ ] Edge cases handled (empty, null, max size)

### Integration Tests

- [ ] Real provider connection works
- [ ] Full sync completes without error
- [ ] Delta sync detects changes
- [ ] Batch operations respect limits

### Error Tests

- [ ] 401 triggers refresh flow
- [ ] 429 retries successfully
- [ ] Network timeout recovers
- [ ] Sync token expiration recovers

---

## Code Quality

### Naming

- [ ] Method names match interface exactly
- [ ] Private helpers prefixed with `_` or marked private
- [ ] Constants in UPPER_SNAKE_CASE

### Types

- [ ] No `any` types (use `unknown` if needed)
- [ ] All parameters typed
- [ ] Return types explicit

### Logging

- [ ] Info: Successful operations
- [ ] Warn: Recoverable errors, retries
- [ ] Error: Unrecoverable failures
- [ ] Debug: Request/response details

---

## Final Validation

### Before PR

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] All tests pass
- [ ] No hardcoded credentials
- [ ] No console.log (use Logger)
- [ ] File < 500 lines (split if larger)

### Manual Testing

- [ ] Connect with real account
- [ ] List folders shows all folders
- [ ] List messages shows correct content
- [ ] Send message delivers successfully
- [ ] Delta sync detects real changes

---

## Quick Reference

| Provider | Batch Limit | Sync Token Format | ID Stable? |
|----------|-------------|-------------------|------------|
| Gmail | 50 | historyId (BigInt) | Yes |
| Microsoft | 20 | Full deltaLink URL | Only with ImmutableId |
| IMAP | N/A | folder:modseq,... | Per UIDVALIDITY |

---

## Sign-Off

Before merge, confirm:

```
[ ] I have read DRIVER_IMPLEMENTATION_SPEC.md
[ ] I have followed all checklist items
[ ] All tests pass
[ ] Code has been reviewed
```

Signed: _________________ Date: _________________
