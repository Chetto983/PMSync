# Phase 02: Polish & Completion - Research

**Researched:** 2026-02-05
**Domain:** iOS Safe Area + E2E Testing
**Confidence:** HIGH

## Summary

This phase completes two distinct polish items: iOS viewport safe area handling and E2E test coverage for search filters. Both are well-understood problems with established solutions.

For iOS safe areas, the key insight is that `viewport-fit=cover` MUST be in the document head for `env(safe-area-inset-*)` CSS to work. The project already uses these CSS variables in 3 components but the meta tag is missing from `_document.tsx`. Next.js Pages Router requires the viewport meta tag in `_app.tsx` (not `_document.tsx`) per official docs.

For E2E tests, the project uses Playwright with 5 browser matrix (Chrome, Firefox, Safari, mobile-chrome, mobile-safari). The search.spec.ts has 8 `test.skip()` calls where tests skip when auth redirects occur. The backend already supports structured filter parameters (`from`, `to`, `subject`, `hasAttachments`, `startDate`, `endDate`) via `EmailFolderService.buildEmailWhere()`.

**Primary recommendation:** Add viewport-fit=cover to _app.tsx Head, extend MUI theme with safeArea tokens, and refactor E2E tests to use real API calls against user's tenant data with URL-based test navigation.

## Standard Stack

### Core (iOS Safe Area)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `env()` CSS | Native | Access iOS safe area insets | W3C standard, supported since iOS 11.2 |
| MUI `sx` prop | v5+ | Apply safe area to components | Consistent with project patterns |

### Core (E2E Tests)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | ^1.45.0 | E2E testing | Project standard, already configured |
| Web-first assertions | Built-in | Auto-retry until condition met | Prevents flaky tests |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Chrome DevTools | Device mode | Simulate iPhone X+ | Validation without physical device |

**Installation:**
None required - all libraries already in project.

## Architecture Patterns

### Recommended Project Structure

```
frontend/
├── pages/
│   ├── _document.tsx     # HTML structure (no viewport meta)
│   └── _app.tsx          # Viewport meta with viewport-fit=cover
├── theme/
│   ├── tokens.ts         # Add safeArea tokens
│   ├── appTheme.ts       # Re-export safeArea
│   ├── darkTheme.ts      # Apply safeArea to components
│   └── lightTheme.ts     # Apply safeArea to components
├── components/
│   └── email/
│       └── layout/
│           ├── MobileEmailNav.tsx      # Already uses safe-area
│           └── MobileFolderSheet.tsx   # Already uses safe-area
└── e2e/
    └── search.spec.ts    # Refactor with real API tests
```

### Pattern 1: Viewport Meta Tag in _app.tsx (Pages Router)

**What:** Place viewport meta tag in `_app.tsx` using `next/head`, NOT in `_document.tsx`
**When to use:** Always for Next.js Pages Router
**Why:** Next.js cannot dedupe viewport tags in _document.tsx, causes warning
**Source:** [Next.js Official Docs](https://nextjs.org/docs/messages/no-document-viewport-meta)

**Example:**
```typescript
// Source: https://nextjs.org/docs/messages/no-document-viewport-meta
// pages/_app.tsx
import Head from 'next/head';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>
      {/* ... rest of app */}
    </>
  );
}
```

### Pattern 2: MUI Theme Safe Area Tokens

**What:** Define safe area CSS values as reusable theme tokens
**When to use:** For consistent safe area spacing across components
**Why:** Single source of truth, supports fallback for non-iOS

**Example:**
```typescript
// Source: Project-specific pattern based on MUI theming
// theme/tokens.ts - add safeArea section
export const safeArea = {
  top: 'env(safe-area-inset-top, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
  // Padding shortcuts
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  paddingLeft: 'env(safe-area-inset-left, 0px)',
} as const;

// Usage in components via sx prop:
sx={{ paddingBottom: safeArea.bottom }}
```

### Pattern 3: E2E Tests with Real API and URL Navigation

**What:** Navigate directly to URL with query params to test search filters
**When to use:** Testing search/filter functionality with real data
**Why:** Tests actual backend filter parsing, not mock behavior

**Example:**
```typescript
// Source: Playwright best practices 2025
test('from: filter returns correct emails', async ({ page }) => {
  // Navigate with search params - tests real URL parsing
  await page.goto('/dashboard/email?search=from:alice@example.com');

  // Wait for API response
  await page.waitForResponse((res) =>
    res.url().includes('/emails') && res.status() === 200
  );

  // Assert filter chip rendered
  await expect(page.getByRole('button', { name: /from.*alice/i })).toBeVisible();

  // Assert email results contain sender
  const emails = page.locator('[data-testid="email-list-item"]');
  const count = await emails.count();
  expect(count).toBeGreaterThan(0);

  // Verify each visible email has correct sender
  for (let i = 0; i < Math.min(count, 5); i++) {
    const sender = emails.nth(i).locator('[data-testid="email-sender"]');
    await expect(sender).toContainText('alice', { ignoreCase: true });
  }
});
```

### Pattern 4: Sequential Test Execution for Shared Data

**What:** Run filter tests sequentially (not parallel) when using same tenant
**When to use:** Tests read from same data source
**Why:** Prevents race conditions on shared test data

**Example:**
```typescript
// playwright.config.ts - for search tests specifically
// Source: Playwright parallel execution docs
{
  name: 'search-filters',
  testMatch: /search\.spec\.ts/,
  fullyParallel: false,  // Sequential for tenant data safety
  use: {
    ...devices['Desktop Chrome'],
  },
}
```

### Anti-Patterns to Avoid

- **viewport meta in _document.tsx:** Next.js cannot dedupe, causes warning. Use _app.tsx instead.
- **Raw CSS custom properties for safe area:** Use MUI theme tokens for consistency and TypeScript support.
- **Hardcoded fallback values:** Use `env(safe-area-inset-*, 0px)` with 0px fallback in the CSS function itself.
- **Mock-only filter tests:** Mocks don't verify backend filter parsing. Use real API for happy path.
- **Parallel tests with shared tenant data:** Causes flaky tests from race conditions.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Safe area values | Manual JS detection | `env()` CSS | Browser handles detection automatically |
| Debounce for search | Custom hook | `useDebouncedCallback` from `use-debounce` | Already in project |
| API response waiting | `setTimeout()` | `page.waitForResponse()` | Auto-retry built into Playwright |
| Filter chip rendering | Manual DOM checks | `getByRole('button', { name: /pattern/i })` | Playwright's accessible locators |

**Key insight:** iOS safe area is entirely a CSS concern when `viewport-fit=cover` is present. E2E search tests should test real filter behavior, not mock implementations.

## Common Pitfalls

### Pitfall 1: Missing viewport-fit=cover

**What goes wrong:** `env(safe-area-inset-*)` returns 0 on all devices
**Why it happens:** Browser doesn't enable safe area without explicit opt-in
**How to avoid:** Add `viewport-fit=cover` to viewport meta tag
**Warning signs:** Safe area CSS appears to do nothing in iOS simulator

### Pitfall 2: Viewport Meta in _document.tsx

**What goes wrong:** Next.js logs warning about duplicate viewport tags
**Why it happens:** _document.tsx renders once per request, can't dedupe
**How to avoid:** Put viewport meta in _app.tsx using next/head
**Warning signs:** Console warning: "viewport meta tags should not be used in _document.js"

### Pitfall 3: Not Handling Landscape Mode

**What goes wrong:** Notch obscures content when device rotates
**Why it happens:** Only bottom inset handled, left/right ignored
**How to avoid:** Apply left/right insets for landscape
**Warning signs:** FAB or content cut off on left side in landscape on iPhone

### Pitfall 4: E2E Tests Skip on Auth Redirect

**What goes wrong:** Tests pass but test.skip() hides real failures
**Why it happens:** Auth fixture not properly configured
**How to avoid:** Ensure storage state loaded before test, use dependencies: ['setup']
**Warning signs:** Tests passing with "skipped" count, no actual verification

### Pitfall 5: Flaky Filter Result Assertions

**What goes wrong:** Tests fail intermittently on CI
**Why it happens:** Assert before API response completes
**How to avoid:** Use `page.waitForResponse()` before asserting on results
**Warning signs:** Tests pass locally but fail on CI, especially Firefox/WebKit

### Pitfall 6: Testing Filter UI Only (No Result Verification)

**What goes wrong:** Filter chip appears but filter not actually applied
**Why it happens:** Test only checks chip display, not filtered results
**How to avoid:** Assert filtered email results match filter criteria
**Warning signs:** Users report filters don't work despite passing tests

## Code Examples

### Adding viewport-fit to _app.tsx

```typescript
// Source: Project _app.tsx + Next.js viewport docs
// frontend/pages/_app.tsx
import Head from 'next/head';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <QueryProvider>
      <Head>
        <title>PMSync</title>
        {/* iOS safe area support - must be in _app, not _document */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" sizes="any" />
      </Head>
      {/* ... rest unchanged */}
    </QueryProvider>
  );
}
```

### Safe Area Theme Tokens

```typescript
// Source: Project tokens.ts + WebKit safe area docs
// frontend/theme/tokens.ts - ADD this section
export const safeArea = {
  // Individual insets with fallback
  top: 'env(safe-area-inset-top, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
} as const;

// Re-export in appTheme.ts:
export { safeArea } from './tokens';
```

### Using Safe Area in Components

```typescript
// Source: Project MobileEmailNav.tsx pattern
// Example applying safe area via tokens
import { safeArea } from '@/theme/appTheme';

<Paper sx={{
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  // iOS safe area from theme tokens
  paddingBottom: safeArea.bottom,
  paddingLeft: safeArea.left,
  paddingRight: safeArea.right,
}}>
```

### Complete E2E Search Filter Test

```typescript
// Source: Playwright best practices + project search.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Search Filters - Real API', () => {
  // Sequential execution for shared tenant data
  test.describe.configure({ mode: 'serial' });

  test('from: filter shows filtered results', async ({ page }) => {
    // Navigate with search param
    await page.goto('/dashboard/email?search=from:alice');

    // Wait for filtered API response
    const response = await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200
    );
    const data = await response.json();

    // Verify chip renders with correct label
    await expect(
      page.getByRole('button', { name: /from.*alice/i })
    ).toBeVisible();

    // Verify results contain sender (if any returned)
    if (data.emails.length > 0) {
      const firstEmail = page.locator('[data-testid="email-list-item"]').first();
      await expect(firstEmail).toContainText('alice', { ignoreCase: true });
    }
  });

  test('has:attachment filter shows only emails with attachments', async ({ page }) => {
    await page.goto('/dashboard/email?search=has:attachment');

    const response = await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200
    );
    const data = await response.json();

    // Verify chip
    await expect(
      page.getByRole('button', { name: /attachment/i })
    ).toBeVisible();

    // Verify all returned emails have attachments
    for (const email of data.emails) {
      expect(email.attachments?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('combined filters (from: AND subject:) work together', async ({ page }) => {
    await page.goto('/dashboard/email?search=from:bob subject:meeting');

    await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200
    );

    // Both chips should render
    await expect(page.getByRole('button', { name: /from.*bob/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /subject.*meeting/i })).toBeVisible();
  });

  test('chip X button removes filter', async ({ page }) => {
    await page.goto('/dashboard/email?search=from:alice');

    await page.waitForResponse((res) => res.url().includes('/emails'));

    // Click remove on chip
    const chip = page.getByRole('button', { name: /from.*alice/i });
    await chip.locator('[data-testid="CancelIcon"], svg').click();

    // Chip should disappear
    await expect(chip).not.toBeVisible();

    // URL should update (no search param)
    await expect(page).toHaveURL(/\/dashboard\/email$/);
  });

  test('clear all button removes all filters', async ({ page }) => {
    await page.goto('/dashboard/email?search=from:alice has:attachment');

    await page.waitForResponse((res) => res.url().includes('/emails'));

    // Find and click clear button
    const clearButton = page.getByTestId('email-search').locator('button');
    await clearButton.click();

    // Both chips should disappear
    await expect(page.getByRole('button', { name: /from/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /attachment/i })).not.toBeVisible();
  });

  test('invalid filter syntax shows error suggestion', async ({ page }) => {
    await page.goto('/dashboard/email?search=from:');

    await page.waitForResponse((res) => res.url().includes('/emails'));

    // Should show helpful message (no chip for incomplete filter)
    // The input should contain the raw text
    const searchInput = page.getByTestId('email-search').locator('input');
    await expect(searchInput).toHaveValue('from:');

    // No chip should render for incomplete filter
    await expect(page.getByRole('button', { name: /from/i })).not.toBeVisible();
  });
});
```

### Test Data Requirements README Section

```markdown
## E2E Test Data Requirements

The search filter E2E tests require specific test data in the tenant:

### Required Emails for Tests to Pass

| Filter | Required Data |
|--------|---------------|
| `from:alice` | At least 1 email from any sender containing "alice" |
| `from:bob` | At least 1 email from any sender containing "bob" |
| `has:attachment` | At least 1 email with attachments |
| `subject:meeting` | At least 1 email with "meeting" in subject |

### Setup

1. Ensure test user has at least 5 emails in INBOX
2. At least 1 email must have attachments
3. Emails from at least 2 different senders
4. At least 1 email with "meeting" in subject

### CI Environment

Tests use `playwright/.auth/user.json` for auth state.
Ensure this user has the required test data.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `constant()` for safe area | `env()` function | iOS 11.2 (2017) | Use `env()` only |
| Mock all API calls in E2E | Real API for happy path, mock for error cases | 2024+ | Better test coverage |
| viewport meta in _document | viewport meta in _app or App Router generateViewport | Next.js 14+ | Prevents dedup warning |
| `test.skip()` on auth failure | Setup project with dependencies | Playwright 1.30+ | Reliable auth in tests |

**Deprecated/outdated:**
- `constant(safe-area-inset-*)`: Removed in iOS 11.2, use `env()` instead
- Viewport meta in _document.tsx: Causes Next.js warning, use _app.tsx

## Open Questions

1. **Android safe area behavior**
   - What we know: `env(safe-area-inset-*)` has limited Android support
   - What's unclear: Which Android devices have cutouts that need safe areas
   - Recommendation: Test on Android with notch (Pixel 5+), fallback of 0px is safe

2. **Safari webkit device emulation accuracy**
   - What we know: WebKit tests skip some filters (timing differences)
   - What's unclear: Whether real Safari on iOS behaves the same
   - Recommendation: Accept webkit test skips for now, verify manually on real device

## Sources

### Primary (HIGH confidence)
- [WebKit Blog: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) - Authoritative on viewport-fit and env()
- [Next.js Docs: No document viewport meta](https://nextjs.org/docs/messages/no-document-viewport-meta) - Official guidance on viewport placement
- [CSS-Tricks: The Notch and CSS](https://css-tricks.com/the-notch-and-css/) - Comprehensive safe area guide

### Secondary (MEDIUM confidence)
- [DeviQA: Playwright E2E Guide 2026](https://www.deviqa.com/blog/guide-to-playwright-end-to-end-testing-in-2025/) - Current best practices
- [DEV.to: Prevent flaky tests with Playwright](https://dev.to/spo0q/prevent-flaky-tests-with-playwright-l2k) - Flaky test prevention

### Tertiary (LOW confidence)
- WebSearch results for MUI safe area patterns - Limited official MUI documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Well-documented CSS standard, Playwright already in project
- Architecture: HIGH - Clear Next.js guidance, existing project patterns
- Pitfalls: HIGH - Well-known issues with documented solutions

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable technologies, 30-day validity)
