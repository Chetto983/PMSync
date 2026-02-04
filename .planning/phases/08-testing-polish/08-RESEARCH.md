# Phase 08: Testing & Polish - Research

**Researched:** 2026-02-04
**Domain:** E2E Testing, Performance Auditing, Accessibility, Cross-Browser Compatibility
**Confidence:** HIGH (verified with official documentation)

## Summary

This research covers the complete testing and polishing strategy for MailAgent v2.0 before production release. The project already has:
- Playwright v1.58.0 installed with basic config
- 2 existing E2E tests (email-list.spec.ts, keyboard-navigation.spec.ts)
- Jest unit tests for frontend utilities and stores
- ~500+ backend tests

Phase 08 focuses on expanding E2E coverage to critical email flows, integrating accessibility testing with axe-core, setting up Lighthouse CI for performance auditing, and establishing cross-browser/mobile testing infrastructure.

**Primary recommendation:** Prioritize E2E tests for authentication and core email flows first, then layer in accessibility and performance auditing. Use the existing Playwright infrastructure and fixtures pattern.

## Standard Stack

### Core Testing Framework

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.58.0 | E2E testing framework | Already installed, best-in-class browser automation |
| @axe-core/playwright | ^4.10.x | Accessibility testing | Official Playwright integration, WCAG compliance |
| @lhci/cli | ^0.15.x | Performance CI | Official Google tool for Lighthouse in CI |
| @next/bundle-analyzer | ^15.x | Bundle size analysis | Next.js official plugin |

### Supporting Tools

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lighthouse | ^12.x | Performance auditing | Manual local testing |
| jest-axe | ^9.x | Unit-level a11y | Component accessibility tests |
| playwright-lighthouse | ^4.x | Lighthouse in Playwright | Combined E2E + perf tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| axe-core | pa11y | axe-core has better Playwright integration, more rules |
| Lighthouse CI | Speedlify | LHCI is more mature, official Google support |
| Playwright | Cypress | Playwright has better multi-browser support, already in use |

**Installation:**
```bash
# Frontend (already has Playwright)
cd frontend
npm install -D @axe-core/playwright @lhci/cli @next/bundle-analyzer
```

## Architecture Patterns

### Recommended Test Structure
```
frontend/
├── e2e/
│   ├── fixtures.ts          # Shared test fixtures (EXISTS)
│   ├── auth.setup.ts        # Authentication setup (TO CREATE)
│   ├── email-list.spec.ts   # Email list tests (EXISTS)
│   ├── keyboard-navigation.spec.ts # Keyboard tests (EXISTS)
│   ├── compose.spec.ts      # Compose flow tests (TO CREATE)
│   ├── auth.spec.ts         # Auth flow tests (TO CREATE)
│   ├── search.spec.ts       # Search/filter tests (TO CREATE)
│   ├── accessibility.spec.ts # axe-core tests (TO CREATE)
│   └── performance.spec.ts  # Lighthouse tests (TO CREATE)
├── playwright.config.ts     # Playwright config (EXISTS - extend)
├── lighthouserc.js          # Lighthouse CI config (TO CREATE)
└── .github/workflows/
    └── e2e.yml              # CI workflow (TO CREATE)
```

### Pattern 1: Authentication Setup Project
**What:** Authenticate once, reuse state across all tests
**When to use:** All authenticated E2E tests
**Example:**
```typescript
// e2e/auth.setup.ts
// Source: https://playwright.dev/docs/auth
import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Perform login
  await page.goto('/auth/login');
  await page.fill('[data-testid="email-input"]', process.env.TEST_USER_EMAIL!);
  await page.fill('[data-testid="password-input"]', process.env.TEST_USER_PASSWORD!);
  await page.click('[data-testid="login-button"]');
  await expect(page).toHaveURL(/dashboard/);

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
```

### Pattern 2: Accessibility Test with axe-core
**What:** Automated WCAG compliance checking
**When to use:** Every page/component that renders UI
**Example:**
```typescript
// e2e/accessibility.spec.ts
// Source: https://playwright.dev/docs/accessibility-testing
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('email page has no WCAG violations', async ({ page }) => {
    await page.goto('/dashboard/email');
    await page.waitForSelector('[data-testid="thread-list-item"]');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
```

### Pattern 3: Performance Budget Assertions
**What:** Fail CI if performance regresses
**When to use:** Core user flows (inbox load, compose)
**Example:**
```javascript
// lighthouserc.js
// Source: https://github.com/GoogleChrome/lighthouse-ci
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3001/dashboard/email'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'interactive': ['warn', { maxNumericValue: 3500 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

### Anti-Patterns to Avoid

- **Testing implementation details:** Don't assert on CSS classes or internal state; test user-visible behavior
- **Flaky selectors:** Don't use auto-generated class names; use data-testid or semantic locators (getByRole)
- **Hardcoded waits:** Don't use `page.waitForTimeout()`; use Playwright's auto-waiting locators
- **Testing third-party dependencies:** Don't test OAuth providers directly; mock their responses
- **Skipping mobile viewports:** Don't only test desktop; email clients are heavily used on mobile

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility scanning | Custom DOM walker | @axe-core/playwright | 57% WCAG coverage, maintained rules |
| Performance metrics | Manual timing | Lighthouse CI | Standardized metrics, CI integration |
| Auth state management | Token injection hacks | Playwright storageState | Built-in, handles cookies/localStorage |
| Screenshot comparison | Pixel diff script | Playwright visual comparison | Built-in, handles tolerance |
| Mobile emulation | viewport resize only | Playwright devices | Includes touch, user-agent, DPR |
| Bundle analysis | Manual inspection | @next/bundle-analyzer | Treemap visualization, precise sizes |

**Key insight:** Playwright and Lighthouse have solved most testing infrastructure problems. Focus effort on writing tests, not building test infrastructure.

## Common Pitfalls

### Pitfall 1: Flaky E2E Tests
**What goes wrong:** Tests pass locally but fail randomly in CI
**Why it happens:** Race conditions, network timing, animation states
**How to avoid:**
- Use `await expect(locator).toBeVisible()` (waits automatically)
- Configure `retries: 2` in CI (playwright.config.ts)
- Capture traces on failure (`trace: 'retain-on-failure'`)
- Mock slow/unreliable external services
**Warning signs:** Same test fails 1 in 10 runs, passes on retry

### Pitfall 2: Accessibility False Positives
**What goes wrong:** axe-core reports violations that aren't real issues
**Why it happens:** Dynamic content, third-party embeds, timing issues
**How to avoid:**
- Run axe after page is fully loaded (`waitForSelector`)
- Use `exclude()` for known third-party elements
- Use `disableRules()` sparingly with documented justification
**Warning signs:** Violations in third-party code you don't control

### Pitfall 3: Performance Test Variance
**What goes wrong:** Lighthouse scores vary wildly between runs
**Why it happens:** Network conditions, CPU throttling, background processes
**How to avoid:**
- Run multiple times (`numberOfRuns: 3-5`)
- Use consistent CI environment (same container/runner)
- Test against local build, not live server
- Set realistic thresholds (80% not 100%)
**Warning signs:** Score swings of 20+ points between runs

### Pitfall 4: Ignoring Mobile Testing
**What goes wrong:** Works on desktop, broken on mobile
**Why it happens:** Responsive breakpoints, touch interactions, viewport issues
**How to avoid:**
- Add mobile project to Playwright config
- Test critical flows at 375x812 (iPhone) and 768x1024 (iPad)
- Use `isMobile: true` for touch behavior
- Test iOS Safari URL bar collapse (100vh issues)
**Warning signs:** Users report mobile-specific bugs post-launch

### Pitfall 5: Over-Testing Implementation
**What goes wrong:** Tests break when refactoring, even though behavior is unchanged
**Why it happens:** Tests assert on internal structure, not user behavior
**How to avoid:**
- Test what users see and do
- Use semantic locators (getByRole, getByLabel)
- Avoid asserting on exact DOM structure
- Focus on outcomes, not steps
**Warning signs:** Every CSS change breaks tests

## Code Examples

### Complete Authentication Flow Test
```typescript
// e2e/auth.spec.ts
// Source: Playwright best practices + existing fixtures.ts pattern
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can log in with email/password', async ({ page }) => {
    await page.goto('/auth/login');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('testpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByTestId('user-menu')).toBeVisible();
  });

  test('user can log out', async ({ page }) => {
    // Start authenticated
    await page.goto('/dashboard/email');

    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: /log out/i }).click();

    await expect(page).toHaveURL(/auth\/login/);
  });
});
```

### Email Compose Flow Test
```typescript
// e2e/compose.spec.ts
import { test, expect } from './fixtures';

test.describe('Email Compose', () => {
  test('can compose and send a new email', async ({ authedPage }) => {
    await authedPage.goto('/dashboard/email/compose');

    // Fill compose form
    await authedPage.getByLabel('To').fill('recipient@example.com');
    await authedPage.getByLabel('Subject').fill('Test Subject');

    // TipTap editor - click to focus, then type
    await authedPage.getByTestId('compose-body').click();
    await authedPage.keyboard.type('This is a test email body.');

    // Send
    await authedPage.getByRole('button', { name: /send/i }).click();

    // Verify redirect to inbox
    await expect(authedPage).toHaveURL(/dashboard\/email$/);
  });

  test('can reply to an email', async ({ authedPage }) => {
    await authedPage.goto('/dashboard/email');
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // Click first email
    await authedPage.locator('[data-testid="thread-list-item"]').first().click();

    // Click reply button
    await authedPage.getByRole('button', { name: /reply/i }).click();

    // Should open compose with prefilled recipient
    await expect(authedPage).toHaveURL(/compose\?mode=reply/);
  });
});
```

### Cross-Browser Config
```typescript
// playwright.config.ts extension
// Source: https://playwright.dev/docs/test-configuration
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // ... existing config
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
    // Tablet
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'] },
    },
  ],
});
```

### GitHub Actions CI Workflow
```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: cd frontend && npm ci

      - name: Install Playwright browsers
        run: cd frontend && npx playwright install --with-deps

      - name: Build application
        run: cd frontend && npm run build

      - name: Run E2E tests
        run: cd frontend && npx playwright test --project=${{ matrix.browser }}

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.browser }}
          path: frontend/playwright-report/

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: cd frontend && npm ci && npm install -g @lhci/cli@0.15.x

      - name: Build application
        run: cd frontend && npm run build

      - name: Run Lighthouse CI
        run: cd frontend && lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| puppeteer + jest | Playwright test runner | 2021 | Better browser support, built-in assertions |
| FID metric | INP (Interaction to Next Paint) | March 2024 | Measures full interaction responsiveness |
| Manual a11y audit | Automated axe-core in CI | 2020+ | Catch 57% of issues automatically |
| Separate visual testing tool | Playwright built-in screenshots | v1.20+ | Simpler setup, same tool |
| Manual bundle inspection | @next/bundle-analyzer | 2023+ | Visual treemap, actionable insights |

**Deprecated/outdated:**
- **First Input Delay (FID):** Replaced by INP in March 2024; update any references
- **playwright-github-action:** Deprecated; use `npx playwright install --with-deps` directly
- **csurf for CSRF:** Deprecated; project already migrated to csrf-csrf

## Critical Email Flows for E2E

Priority order for test coverage (HIGH to MEDIUM):

| Priority | Flow | Why Critical | Estimated Effort |
|----------|------|--------------|------------------|
| P0 | Authentication (login/logout) | Gate to all functionality | 2h |
| P0 | Email list viewing (inbox load) | Core value proposition | 2h (partially exists) |
| P0 | Email compose & send | Primary user action | 3h |
| P0 | Reply/Forward email | Second most common action | 2h |
| P1 | Search with filters | Key productivity feature | 2h |
| P1 | Bulk actions (archive, delete) | Productivity multiplier | 2h |
| P1 | Keyboard navigation | Power user feature, existing tests | 1h (expand) |
| P1 | Folder navigation | Organization feature | 2h |
| P2 | Label management | Organization feature | 1h |
| P2 | Dark mode toggle | UX polish | 1h |
| P2 | Mobile compose | Responsive critical path | 2h |

**Total estimated effort:** 20 hours for comprehensive E2E suite

## Performance Targets

Based on Core Web Vitals 2025 thresholds:

| Metric | Target | Good Threshold | Current Baseline |
|--------|--------|----------------|------------------|
| LCP (Largest Contentful Paint) | < 2.0s | <= 2.5s | TBD (measure first) |
| INP (Interaction to Next Paint) | < 150ms | <= 200ms | TBD |
| CLS (Cumulative Layout Shift) | < 0.05 | <= 0.1 | TBD |
| Performance Score | >= 85 | >= 80 | TBD |

**Project-specific targets from ROADMAP.md:**
- Email list scroll: < 100ms (VList virtualization should ensure this)
- Thread load: < 200ms
- Compose page TTI: < 1.5s

## Accessibility Standards

Target WCAG 2.1 AA compliance using axe-core tags:

| Tag | Description | Priority |
|-----|-------------|----------|
| wcag2a | WCAG 2.0 Level A | Required |
| wcag2aa | WCAG 2.0 Level AA | Required |
| wcag21a | WCAG 2.1 Level A | Required |
| wcag21aa | WCAG 2.1 Level AA | Required |
| best-practice | Additional recommendations | Nice-to-have |

**Key areas to audit:**
- Color contrast (text readability)
- Keyboard navigation (focus management)
- Screen reader labels (ARIA)
- Form accessibility (labels, error messages)
- Image alt text

## Browser/Device Matrix

Recommended test matrix for CI:

| Browser | Desktop | Mobile | Priority |
|---------|---------|--------|----------|
| Chrome/Chromium | Yes | Pixel 7 | P0 |
| Safari/WebKit | Yes | iPhone 14 | P0 |
| Firefox | Yes | No | P1 |
| Edge | Chromium-based (covered by Chrome) | No | P2 |

**Viewport breakpoints to test:**
- Mobile: 375x812 (iPhone)
- Tablet: 768x1024 (iPad portrait)
- Desktop: 1440x900 (standard)
- Large: 1920x1080 (wide monitor)

## Open Questions

Things that couldn't be fully resolved:

1. **Test user credentials for E2E**
   - What we know: Need a test account that won't be affected by production data
   - What's unclear: Should we use a dedicated test environment or mock all APIs?
   - Recommendation: Use existing fixtures.ts mock approach for isolated tests, create dedicated test user for optional integration tests

2. **Lighthouse CI token setup**
   - What we know: LHCI_GITHUB_APP_TOKEN needed for PR comments
   - What's unclear: Is this already configured in repo secrets?
   - Recommendation: Check GitHub repo settings, create token if missing

3. **Visual regression testing scope**
   - What we know: Playwright supports screenshot comparison
   - What's unclear: Which pages warrant visual regression tests?
   - Recommendation: Start with email list and compose page only, expand based on need

## Sources

### Primary (HIGH confidence)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - Official documentation
- [Playwright Authentication](https://playwright.dev/docs/auth) - Storage state patterns
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing) - axe-core integration
- [Lighthouse CI GitHub](https://github.com/GoogleChrome/lighthouse-ci) - Official CI tool
- [web.dev Core Web Vitals](https://web.dev/articles/vitals) - Google's official metrics

### Secondary (MEDIUM confidence)
- [Next.js Bundle Analyzer Guide](https://nextjs.org/docs/app/guides/package-bundling) - Official Next.js docs
- [Core Web Vitals Thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) - Google documentation

### Tertiary (LOW confidence)
- Community articles on email app E2E testing patterns (various blog posts)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Playwright + axe-core documentation
- Architecture: HIGH - Based on existing project patterns (fixtures.ts) + official guides
- Pitfalls: HIGH - Well-documented in Playwright docs and community
- Performance targets: MEDIUM - Based on Google standards, project-specific targets from ROADMAP.md
- Effort estimates: MEDIUM - Based on complexity analysis, actual time may vary

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable tooling)
