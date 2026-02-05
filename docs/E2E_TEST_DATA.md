# E2E Test Data Requirements

This document lists the data required in the test tenant for E2E tests to pass.

## Overview

E2E tests run against real API endpoints with authenticated user sessions. Tests require specific email data to exist in the test user's mailbox.

## Search Filter Tests

**File:** `frontend/e2e/search.spec.ts`

### Required Emails

For search filter E2E tests to pass, the test user's mailbox must contain:

| Filter | Requirement |
|--------|-------------|
| `from:alice` | At least 1 email where sender contains "alice" |
| `has:attachment` | At least 1 email with attachments |
| `subject:meeting` | At least 1 email with "meeting" in subject |
| `subject:test` | At least 1 email with "test" in subject |

### Minimum Data Set

The test user's mailbox should contain at least **5 emails** with variety of:
- Different senders (alice@example.com, bob@example.com, etc.)
- Different subjects (include "meeting", "test", "project", etc.)
- At least 1 email with attachments (PDF, image, or document)
- Mix of read/unread status

### Example Test Emails

```
Email 1:
  From: alice@example.com
  Subject: Test Project Update
  Attachments: none

Email 2:
  From: bob@example.com
  Subject: Meeting Tomorrow
  Attachments: none

Email 3:
  From: carol@example.com
  Subject: Invoice Attached
  Attachments: invoice.pdf (50KB)

Email 4:
  From: alice@example.com
  Subject: Weekly Meeting Notes
  Attachments: notes.docx (25KB)

Email 5:
  From: dave@example.com
  Subject: Quick Test
  Attachments: none
```

## Setup Instructions

### Local Development

1. **Auth state setup:** The `setup` project creates `playwright/.auth/user.json`
2. **Verify auth state exists:**
   ```bash
   ls frontend/playwright/.auth/user.json
   ```
3. **Log in manually** to verify the test user has emails in INBOX

### CI Environment

1. The `setup` project runs first (defined in `playwright.config.ts` dependencies)
2. Auth state is stored in `playwright/.auth/user.json`
3. All browser projects depend on `setup` completing first

### Creating Test Data

If test data is missing, manually send test emails to the test account:

1. Send from alice@example.com with subject containing "test"
2. Send from any sender with subject containing "meeting"
3. Send an email with a PDF attachment

## Troubleshooting

### Tests Fail with Auth Redirect

**Symptom:** Tests navigate to login page instead of email page

**Fix:**
1. Verify auth state exists: `ls frontend/playwright/.auth/user.json`
2. Delete stale auth and re-run setup: `rm -rf frontend/playwright/.auth && npx playwright test --project=setup`
3. Check backend is running on expected port (default: 3000)

### Tests Pass But Return Empty Results

**Symptom:** Filter chips render but no emails shown

**Fix:**
1. Verify test user has emails matching the filter criteria
2. Check API response in Playwright trace (`npx playwright show-report`)
3. Manually verify filters work in browser

### Running Single Test for Debugging

```bash
# Run single test with debug mode
cd frontend && npx playwright test search.spec.ts --project=chromium --debug

# Run with trace on
cd frontend && npx playwright test search.spec.ts --project=chromium --trace=on

# View trace file
cd frontend && npx playwright show-trace test-results/*/trace.zip
```

## Test Isolation

Search tests use `test.describe.configure({ mode: 'serial' })` to run sequentially. This prevents race conditions when multiple tests query the same tenant data.

### Why Sequential Execution?

1. **Shared tenant data:** All tests query the same user's mailbox
2. **Filter state:** URL-based filters persist in browser state
3. **API rate limiting:** Sequential requests avoid hitting rate limits

### Parallel Execution (Browser Matrix)

While tests within `search.spec.ts` run sequentially, the file runs in parallel across browser projects:

- chromium
- firefox
- webkit
- mobile-chrome
- mobile-safari

Total test runs: 7 tests x 5 browsers = 35 test executions

## Related Documentation

- **Playwright Config:** `frontend/playwright.config.ts`
- **Auth Setup:** `frontend/e2e/auth.setup.ts`
- **Test Fixtures:** `frontend/e2e/fixtures.ts`
