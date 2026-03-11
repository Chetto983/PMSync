# Phase 70: Frontend Unit Tests - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Write frontend unit tests for the data layer and security-critical UI. Covers all 14 Zustand store files, critical TanStack Query hooks, and security settings components. No new feature code — test-writing phase only.

Three requirements:
- FTEST-01: All 14 Zustand store files tested (email-ui slices + standalone stores)
- FTEST-02: Critical TanStack Query hooks tested (emails, folders, contacts, organizations + settings, providers, labels, folder-metadata, billing, subscription-limits)
- FTEST-03: Security settings components tested (MFA, passkeys, sessions, password)

</domain>

<decisions>
## Implementation Decisions

### Zustand store test approach
- Call store actions **directly via store.getState().actionName()** — no React wrapper
- Assert state via store.getState().field after action
- Reset state in **beforeEach via store.setState(initialState, true)**
- No createStore factory refactor — stores are not modified in this phase
- Store isolation proven **implicitly**: each test starts from known initial state via beforeEach reset; cross-leakage would cause test failures

### Email-ui store: one test file per slice
- `stores/email-ui/compose-slice.test.ts`
- `stores/email-ui/filter-slice.test.ts`
- `stores/email-ui/kanban-slice.test.ts`
- `stores/email-ui/selection-slice.test.ts`
- `stores/email-ui/sidebar-slice.test.ts`
- `stores/email-ui/view-slice.test.ts`
- Each slice file tests only its own slice state/actions

### Security settings component test depth
- **Interaction + feedback**: click action → assert API mock called with correct args + assert UI shows success/error feedback (toast message, error display, button state change)
- Does NOT use snapshot tests (too brittle with MUI)
- API mocked with `jest.mock('@/lib/api/settings')` — same pattern as use-ai-actions.test.tsx
- Session/org hooks: provide real values via **mock session provider wrapper** (not jest.mock on the hook — use a wrapper component that provides the session context)
- One test file per security component: `SecurityMfaSection.test.tsx`, `SecurityPasswordSection.test.tsx`, `SecuritySessionsSection.test.tsx`, `SecurityAccountsSection.test.tsx`

### Query hook coverage
Required by spec: emails, folders, contacts, organizations

Additional hooks to cover for 30% threshold:
- `use-settings` (security-sensitive mutations)
- `use-providers` (OAuth provider flows)
- `use-labels` (frequently used)
- `use-folder-metadata`
- `use-billing`
- `use-subscription-limits`

What tests verify per hook:
1. **Query key construction** — assert `queryOptions().queryKey` matches expected shape
2. **Cache invalidation triggers** — after mutation, assert `invalidateQueries` called with correct keys
3. **Error state handling** — mock API to reject → assert `isError: true` with correct error
4. **Loading state handling** — assert `isLoading: true` during fetch

Mutation hooks: use **renderHook + act** (consistent with use-ai-actions.test.tsx pattern)

### Test file placement
- Store tests: **co-located** — `stores/calendar-store.test.ts` next to `calendar-store.ts`
- Email-ui slice tests: **co-located** — `stores/email-ui/compose-slice.test.ts`
- Query hook tests: **co-located** — `hooks/queries/use-emails.test.ts` next to `use-emails.ts`
- Settings component tests: **co-located** — `components/settings/SecurityMfaSection.test.tsx`
- No attempt to unify with existing `__tests__/` directory pattern — that's a separate refactor

### Claude's Discretion
- Which specific state fields and actions to cover per store (prioritize business logic over getters)
- Exact mock return shapes for API modules
- Order of test cases within each describe block
- Whether to add a shared `createQueryWrapper()` helper or duplicate it across hook test files

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createWrapper()` pattern from `hooks/ai/use-ai-actions.test.tsx`: fresh QueryClient with `retry: false`, `gcTime: 0` — copy this exact pattern for all query hook tests
- `jest.setup.ts`: already mocks next/router, localStorage, matchMedia — no extra setup needed
- `@testing-library/jest-dom` already configured

### Established Patterns
- API mocking: `jest.mock('@/lib/api/module-name', () => ({ fn: jest.fn() }))` — used in ai.test.ts and use-ai-actions.test.tsx
- renderHook + waitFor + act: established in hooks/ai/ tests
- Component render: `render()` + `screen.getByRole()` + `userEvent` — established in auth tests

### Integration Points
- Stores: `frontend/stores/` (8 files) + `frontend/stores/email-ui/` (6 slices) = 14 total
- Query hooks: `frontend/hooks/queries/` (20+ files)
- Security components: `frontend/components/settings/SecurityMfaSection.tsx`, `SecurityPasswordSection.tsx`, `SecuritySessionsSection.tsx`, `SecurityAccountsSection.tsx`
- Coverage config already collects from `stores/**` and `hooks/**` — new tests will count toward 30% threshold

### 14 Zustand Store Files
1. `stores/calendar-store.ts`
2. `stores/contact-store.ts`
3. `stores/dashboard-store.ts`
4. `stores/email-ui-store.ts` (root store — test integration of slices)
5. `stores/folders-store.ts`
6. `stores/label-store.ts`
7. `stores/label-tree-store.ts`
8. `stores/sync-store.ts`
9. `stores/email-ui/compose-slice.ts`
10. `stores/email-ui/filter-slice.ts`
11. `stores/email-ui/kanban-slice.ts`
12. `stores/email-ui/selection-slice.ts`
13. `stores/email-ui/sidebar-slice.ts`
14. `stores/email-ui/view-slice.ts`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 70-frontend-unit-tests*
*Context gathered: 2026-03-11*
