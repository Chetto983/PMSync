# Technology Stack: v5.1 Test Coverage & Polish

**Project:** PMSync
**Researched:** 2026-03-10
**Scope:** NEW additions only for test infrastructure, MUI audit, and production polish
**Overall confidence:** HIGH

## Existing Test Infrastructure (DO NOT CHANGE)

Already installed and configured -- these are the foundation:

| Technology | Version | Role |
|------------|---------|------|
| Jest | ^30.2.0 | Backend unit tests (`.spec.ts`), frontend unit tests |
| ts-jest | ^29.4.6 | TypeScript transform for Jest (both ends) |
| Vitest | ^4.0.18 | Backend streaming/MSW tests (`.test.ts`) |
| Playwright | ^1.58.2 | Frontend E2E + visual regression |
| @testing-library/react | ^16.3.2 | Frontend component/hook testing (includes `renderHook`) |
| @testing-library/jest-dom | ^6.9.1 | DOM assertion matchers |
| @testing-library/dom | ^10.4.1 | DOM query utilities |
| @nestjs/testing | ^11.1.13 | NestJS TestingModule for DI-based tests |
| supertest | ^7.2.2 | HTTP integration tests |
| msw | ^2.12.10 | API mocking (backend Vitest tests) |
| @axe-core/playwright | ^4.11.1 | Accessibility testing in E2E |
| axios-mock-adapter | ^2.1.0 | Frontend API mocking |
| jest-environment-jsdom | ^30.2.0 | Browser env for frontend Jest |
| unplugin-swc | ^1.5.9 | SWC transform for Vitest |
| knip | ^5.85.0 | Dead code detection |

**Established conventions:**
- Backend: `.spec.ts` = Jest, `.test.ts` = Vitest (no overlap)
- Frontend: `.test.ts/.tsx` = Jest, `e2e/*.spec.ts` = Playwright
- Visual regression: Playwright `toHaveScreenshot()` with `maxDiffPixelRatio: 0.005`
- Coverage reporters: text, lcov, html (both Jest configs)
- Backend test setup: `test/setup.ts` (30s timeout, silenced console)
- Frontend test setup: `jest.setup.ts` (jest-dom, mocked router/localStorage/matchMedia)

**Existing test counts:**
- Backend: ~60 `.spec.ts` unit/integration tests + 5 contract tests + 1 vitest config
- Frontend: ~5 `.test.ts/tsx` unit tests + 13 Playwright E2E specs
- Visual regression: 2 specs (visual-regression-splits, chat-visual-audit)

---

## Recommended Additions

### 1. jest-mock-extended (Backend)

| | |
|---|---|
| **Package** | `jest-mock-extended` |
| **Version** | `^4.0.0` |
| **Purpose** | Type-safe deep mocking for Prisma Client and complex NestJS services |
| **Why** | The v5.1 scope includes unit tests for calendar, labels, providers, subscription, tenants, users, and health modules. Every one of these injects PrismaService. Currently, backend tests manually construct mock objects with `jest.fn()` -- this loses type safety and misses method signature changes when Prisma schema evolves. `mockDeep<PrismaClient>()` auto-generates typed mocks matching the full Prisma 7 interface. This is the officially recommended approach from Prisma's testing documentation. |
| **Confidence** | HIGH -- Prisma official docs recommend this exact library |

**Integration with existing NestJS TestingModule:**
```typescript
import { Test } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '@/prisma/prisma.service';

const prisma = mockDeep<PrismaService>();
const module = await Test.createTestingModule({
  providers: [
    CalendarService, // or any module under test
    { provide: PrismaService, useValue: prisma },
  ],
}).compile();

// Type-safe: auto-complete on prisma.calendarEvent.findMany
prisma.calendarEvent.findMany.mockResolvedValue([mockEvent]);
```

### 2. eslint-plugin-mui (Frontend Dev)

| | |
|---|---|
| **Package** | `eslint-plugin-mui` |
| **Version** | `^1.0.0` |
| **Purpose** | Automated MUI pattern enforcement -- catches literal colors, enforces named imports |
| **Why** | v5.1 includes an explicit MUI audit. The project migrated from shadcn/Tailwind to MUI in multiple waves. Automated linting catches violations that manual review misses and prevents regression. The `no-literal-colors` rule flags `sx={{ color: '#ff0000' }}` (should use `theme.palette.*`). The `prefer-named-imports` rule catches barrel imports that bloat bundles. |
| **Confidence** | MEDIUM -- small community plugin (verify rules work with MUI v7 sx API before relying on it). If incompatible, fall back to custom ESLint rules or grep-based CI check. |

**Key rules to enable:**
- `mui/no-literal-colors` -- flags hardcoded hex/rgb/hsl in sx props
- `mui/sort-sx-keys` -- consistent sx object key ordering
- `mui/prefer-named-imports` -- prevents `import * from '@mui/material'`

**Fallback if incompatible with MUI v7:** Write a custom grep-based CI script:
```bash
# Detect hardcoded colors in sx props (rough but effective)
grep -rn "sx={{" frontend/src/ | grep -E "'#[0-9a-fA-F]|rgb\(|hsl\("
```

### 3. k6 (Load Testing -- Standalone Binary)

| | |
|---|---|
| **Tool** | Grafana k6 |
| **Version** | v1.6.0 |
| **Purpose** | API load testing and scalability validation |
| **Why** | PROJECT.md lists performance budgets (<100ms list scroll, <200ms thread load). k6 is the industry standard for API load testing: Go-based runtime with JS scripting, 70% less CPU than Node-based alternatives. Supports HTTP and WebSocket (relevant for Socket.IO testing). Native TypeScript support. NOT an npm dependency -- standalone binary, zero conflict risk. |
| **Confidence** | HIGH -- industry standard, actively maintained |

**Install (Windows):**
```bash
winget install grafana.k6
# or: choco install k6
```

**Integration:** Scripts in `backend/test/load/*.js`. Run independently from Jest/Vitest. Target `localhost:3000/api/v1/*`. No build system integration needed.

### 4. Coverage Threshold Enforcement (Config Change Only)

| | |
|---|---|
| **Package** | None -- Jest built-in |
| **Purpose** | Fail tests when coverage drops below threshold |
| **Why** | v5.1 is specifically about increasing test coverage. Without enforcement, coverage regresses silently. Jest 30 has built-in `coverageThreshold`. |
| **Confidence** | HIGH -- built into Jest 30 |

**Add to both `jest.config.js` files:**
```javascript
coverageThreshold: {
  global: {
    branches: 50,    // Start conservative
    functions: 60,
    lines: 65,
    statements: 65,
  },
},
```

**Process:** Run `jest --coverage` first to get current baseline, then set thresholds at current levels to prevent regression. Ratchet up as tests are written.

---

## What NOT to Add

| Tool | Why Not |
|------|---------|
| **Storybook** | 300+ package dependency. MUI audit is better done with eslint rules + Playwright visual regression already in place. Not a component library project. |
| **Chromatic / Percy** | Cloud SaaS for visual regression. Playwright `toHaveScreenshot()` already works, is free, runs locally and in CI. No need for paid SaaS. |
| **prismock / jest-prisma** | Simulate Prisma query engine in-memory. Breaks on Prisma 7's new query compiler. `jest-mock-extended` + `@nestjs/testing` TestingModule is more reliable and doesn't couple tests to Prisma internals. |
| **Artillery** | Node.js-based load tester. k6 is faster (Go runtime), has better reporting, and uses 70% less CPU for equivalent scenarios. |
| **autocannon** | Good for micro-benchmarks but lacks scenario scripting, ramp-up patterns, and WebSocket support that k6 provides. |
| **@testing-library/user-event** | Only needed for complex mouse/keyboard interaction simulation. Most frontend tests target hooks/stores, not interactive components. Add later only if specific component tests demand it. |
| **Cypress** | Playwright already handles E2E with multi-browser support (chromium, firefox, webkit) + mobile device emulation. Already configured with auth state setup. Adding a second E2E framework is waste. |
| **Vitest for frontend** | Frontend uses Jest 30 with jsdom. Migration would require rewriting config, setup files, and all existing tests. No measurable benefit for component/hook tests. |
| **nyc / c8 / istanbul CLI** | Jest 30 uses Istanbul reporters internally. Standalone coverage tools duplicate what Jest already does. |
| **Suites (formerly Automock)** | NestJS official `@nestjs/testing` + `Test.createTestingModule()` is sufficient. Suites adds abstraction over what's already clean -- more magic, harder debugging. |
| **react-hooks-testing-library** | Deprecated. `renderHook` is built into `@testing-library/react` v16 (already installed). |
| **Codecov / Coveralls** | Adds CI complexity and external service dependency. Jest `coverageThreshold` fails locally too -- simpler and sufficient for this project. |
| **jest-mock-extended for frontend** | Frontend tests mock axios via `axios-mock-adapter` (already installed). No deep Prisma mocking needed on frontend. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Prisma mocking | jest-mock-extended | prismock | prismock simulates query engine -- fragile with Prisma 7 new compiler |
| Prisma mocking | jest-mock-extended | jest-prisma | Requires running PG; unit tests should be isolated |
| Load testing | k6 (binary) | Artillery | Node.js overhead, less efficient, weaker WebSocket support |
| Load testing | k6 (binary) | autocannon | No scenario scripting, no ramp-up, no WS |
| MUI lint | eslint-plugin-mui | Manual grep | Grep is one-shot; eslint prevents regression |
| MUI lint | eslint-plugin-mui | Storybook + visual audit | 300+ deps for what 1 eslint plugin does |
| Visual regression | Playwright (existing) | Percy/Chromatic | Already have working Playwright screenshots; no SaaS needed |
| Coverage gate | Jest thresholds | Codecov | Jest thresholds fail locally; simpler, no external service |

---

## Installation

```bash
# Backend -- one new dev dependency
cd backend && npm install -D jest-mock-extended@^4.0.0

# Frontend -- one new dev dependency (verify MUI v7 compat first)
cd frontend && npm install -D eslint-plugin-mui@^1.0.0

# Load testing -- standalone binary (NOT npm)
winget install grafana.k6
```

**Total new npm dependencies: 2** (one per workspace, both devDependencies only).
**Total new binary tools: 1** (k6, standalone).

---

## Integration Points

### jest-mock-extended + Existing Backend Test Pattern

The backend already uses `@nestjs/testing` `Test.createTestingModule()`. `jest-mock-extended` slots in as the mock provider value:

```typescript
// Current pattern (manual, no type safety):
const mockPrisma = { email: { findMany: jest.fn() } };

// New pattern (type-safe, auto-complete):
import { mockDeep } from 'jest-mock-extended';
const mockPrisma = mockDeep<PrismaService>();
```

No changes to jest.config.js, setup.ts, or test runner needed.

### eslint-plugin-mui + Existing Frontend ESLint

Add to frontend ESLint config plugins array. Rules are opt-in:
1. Start with `mui/no-literal-colors: "warn"` to audit scope
2. Fix violations found during MUI audit phase
3. Promote to `"error"` to prevent regression

### k6 + Existing Backend

Scripts in `backend/test/load/` directory. Run via `k6 run backend/test/load/emails-list.js`. No Jest/Vitest integration -- independent tool. Target the same `localhost:3000/api/v1/*` endpoints that contract tests verify.

### Coverage Thresholds + Existing Jest Config

Add `coverageThreshold` object to both `backend/jest.config.js` and `frontend/jest.config.js`. Existing `coverageReporters` and `collectCoverageFrom` patterns remain unchanged.

---

## Sources

- [Prisma Unit Testing (official)](https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing) -- recommends jest-mock-extended
- [Jest Configuration (official)](https://jestjs.io/docs/configuration) -- coverageThreshold docs
- [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/) -- v1.6.0
- [k6 GitHub Releases](https://github.com/grafana/k6/releases) -- latest version verification
- [eslint-plugin-mui (npm)](https://www.npmjs.com/package/eslint-plugin-mui) -- MUI linting rules
- [MUI Testing Guide (official)](https://mui.com/material-ui/guides/testing/) -- ThemeProvider wrapping pattern
- [Playwright Visual Comparisons (official)](https://playwright.dev/docs/test-snapshots) -- toHaveScreenshot API
- [NestJS Testing (official)](https://docs.nestjs.com/fundamentals/testing) -- TestingModule patterns
- [@testing-library/react API](https://testing-library.com/docs/react-testing-library/api/) -- renderHook built-in

---

*Last updated: 2026-03-10 -- v5.1 Test Coverage & Polish research*
