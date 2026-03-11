# Phase 70: Frontend Unit Tests - Research

**Researched:** 2026-03-11
**Domain:** Jest + Testing Library + Zustand + TanStack Query frontend unit testing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Zustand store tests: call actions via `store.getState().actionName()` — no React wrapper needed
- Assert state via `store.getState().field` after action
- Reset state in `beforeEach` via `store.setState(initialState, true)` (replace=true for full reset)
- No createStore factory refactor — stores are not modified in this phase
- Store isolation proven implicitly: each test starts from known initial state via beforeEach reset
- Email-ui store: one test file per slice (compose, filter, kanban, selection, sidebar, view)
- Security settings: interaction + feedback tests only (no snapshots)
- API mocked via `jest.mock('@/lib/api/settings')` — same pattern as use-ai-actions.test.tsx
- Session/org hooks: provide real values via mock session provider wrapper (not jest.mock on hook)
- One test file per security component
- Query hook tests: `renderHook + act` pattern, co-located test files
- All test files co-located with source

### Claude's Discretion
- Which specific state fields and actions to cover per store (prioritize business logic over getters)
- Exact mock return shapes for API modules
- Order of test cases within each describe block
- Whether to add a shared `createQueryWrapper()` helper or duplicate it across hook test files

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FTEST-01 | All 14 Zustand store files have tests (email-ui slices + standalone stores) | Direct store API testing pattern confirmed; all 14 files read and mapped |
| FTEST-02 | Critical TanStack Query hook tests (emails, folders, contacts, organizations) | `queryOptions` pattern confirmed; `createWrapper()` pattern from use-ai-actions.test.tsx is the exact model |
| FTEST-03 | Security settings components (MFA, passkeys, sessions, password) | `authClient` mock pattern identified; all 4 components use `authClient` directly (not settings API) |
</phase_requirements>

## Summary

Phase 70 is a pure test-writing phase with no feature code changes. The test infrastructure (jest.config.js, jest.setup.ts, @testing-library/jest-dom, ts-jest) is already fully configured. The existing `use-ai-actions.test.tsx` provides a canonical reference implementation for the `createWrapper()` + `renderHook + act + waitFor` pattern that all query hook tests must follow.

All 14 Zustand stores have been read. They fall into two categories: (1) pure UI stores with no API calls (dashboard-store, sync-store, email-ui slices, calendar-store, contact-store, folders-store, label-tree-store) — these are straightforward direct API tests with no mocking needed; and (2) stores that make API calls (label-store) — these require `jest.mock('@/lib/api/labels')` before testing async actions.

All 4 security settings components (`SecurityMfaSection`, `SecurityPasswordSection`, `SecuritySessionsSection`, `SecurityAccountsSection`) call `authClient` directly — NOT a `@/lib/api/settings` module. The mock target is `@/lib/auth-client`. The components also call `useTranslations()` which requires mocking or a real translations provider.

**Primary recommendation:** Follow the `use-ai-actions.test.tsx` pattern exactly. Use `store.getState().action()` directly for stores, `createWrapper()` + `renderHook` for query hooks, and `jest.mock('@/lib/auth-client')` + `@testing-library/user-event` for component tests.

## Standard Stack

### Core (already installed — verified via jest.config.js and existing tests)
| Library | Purpose | Status |
|---------|---------|--------|
| `jest` (jsdom env) | Test runner + jsdom browser simulation | Configured in jest.config.js |
| `@testing-library/react` | `renderHook`, `render`, `screen`, `waitFor`, `act` | Used in existing tests |
| `@testing-library/jest-dom` | DOM matchers (`toBeInTheDocument`, etc.) | Loaded in jest.setup.ts |
| `@testing-library/user-event` | Realistic user interaction simulation | Available (used in auth tests) |
| `ts-jest` | TypeScript transformation | Configured in jest.config.js |
| `zustand` | Direct store access via `store.getState()` | No extra testing utilities needed |
| `@tanstack/react-query` | `QueryClient`, `QueryClientProvider` | Used in createWrapper() pattern |

### No New Installations Required
All required testing libraries are present. Coverage already configured at 30% threshold.

## Architecture Patterns

### Pattern 1: Direct Zustand Store Testing (Pure UI Stores)

Used for: dashboard-store, sync-store, calendar-store, contact-store, folders-store, label-tree-store, and all 6 email-ui slices (tested through the root store).

**Key insight for email-ui slices:** The 6 slice creators (`createComposeSlice`, `createFilterSlice`, etc.) are NOT standalone stores — they are factory functions composed into `useEmailUIStore`. Tests for slices must call `useEmailUIStore.getState()`, not slice functions directly. Each slice test file uses the same root store but only calls and asserts on its own slice's fields.

**Initial state reset approach varies by store:**
- Stores with `reset()` action: call `store.getState().reset()` in beforeEach
- Stores without explicit `reset()` (e.g. dashboard-store, sync-store): use `store.setState(initialState, true)`
- `email-ui-store` root: has `reset()` action — use it; for slice tests also use `useEmailUIStore.getState().reset()`

```typescript
// Source: confirmed from stores/dashboard-store.ts and pattern from CONTEXT.md
import { useDashboardStore } from './dashboard-store';

beforeEach(() => {
  useDashboardStore.setState({
    editMode: false,
    libraryOpen: false,
    presetsOpen: false,
    selectedWidget: null,
  }, true); // true = replace (full reset)
});

it('toggleEditMode flips editMode state', () => {
  useDashboardStore.getState().toggleEditMode();
  expect(useDashboardStore.getState().editMode).toBe(true);

  useDashboardStore.getState().toggleEditMode();
  expect(useDashboardStore.getState().editMode).toBe(false);
});
```

### Pattern 2: Zustand Store Testing With API Calls (label-store)

`label-store` is different: its actions call `labelsApi` from `@/lib/api/labels`. Must mock the API module.

```typescript
// Source: confirmed from stores/label-store.ts
import { useLabelStore } from './label-store';

jest.mock('@/lib/api/labels', () => ({
  labelsApi: {
    listLabels: jest.fn(),
    createLabel: jest.fn(),
    updateLabel: jest.fn(),
    deleteLabel: jest.fn(),
    reorderLabels: jest.fn(),
    addEmailsToLabel: jest.fn(),
    removeEmailFromLabel: jest.fn(),
  },
  hexToLabelColor: jest.fn((hex: string) => hex),
}));

// Also mock the logger to avoid console noise
jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockLabelsApi = labelsApi as jest.Mocked<typeof labelsApi>;

beforeEach(() => {
  useLabelStore.setState({ labels: [], isLoading: false, error: null }, true);
  jest.clearAllMocks();
});

it('fetchLabels loads and sets labels', async () => {
  const fakeLabels = [{ id: 'l1', name: 'Work', color: '#ff0000' }];
  mockLabelsApi.listLabels.mockResolvedValueOnce({ labels: fakeLabels });

  await useLabelStore.getState().fetchLabels();

  expect(useLabelStore.getState().labels).toEqual(fakeLabels);
  expect(useLabelStore.getState().isLoading).toBe(false);
});
```

### Pattern 3: TanStack Query Hook Testing

Exact `createWrapper()` pattern from `hooks/ai/use-ai-actions.test.tsx` — copy verbatim.

```typescript
// Source: frontend/hooks/ai/use-ai-actions.test.tsx (exact copy)
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestQueryWrapper;
}
```

**Query key tests (no async needed):**
```typescript
// Source: pattern from use-ai-actions.test.tsx aiActionsKeys tests
it('emailsListOptions has correct query key', () => {
  const opts = emailsListOptions({ specialUse: 'INBOX' });
  expect(opts.queryKey).toEqual(['emails', 'list', { specialUse: 'INBOX' }]);
});
```

**Query hook loading/error tests:**
```typescript
// Source: pattern from use-ai-actions.test.tsx
jest.mock('@/lib/api/emails', () => ({
  emailsApi: { listEmails: jest.fn() },
}));

it('useEmails shows error state when API rejects', async () => {
  (emailsApi.listEmails as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

  const { result } = renderHook(() => useEmails(), { wrapper: createWrapper() });

  await waitFor(() => {
    expect(result.current.isError).toBe(true);
  });
});
```

**Mutation hook + cache invalidation:**
```typescript
// Pattern for testing invalidateQueries calls
it('useSendEmail invalidates sent folder on success', async () => {
  const queryClient = new QueryClient({ ... });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  (emailsApi.sendEmail as jest.Mock).mockResolvedValueOnce({});

  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

  const { result } = renderHook(() => useSendEmail(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({ providerId: 'p1', to: ['a@b.com'], subject: 'Hi', bodyHtml: '<p>Hi</p>' });
  });

  expect(invalidateSpy).toHaveBeenCalledWith(
    expect.objectContaining({ queryKey: emailKeys.byFolder('SENT') })
  );
});
```

### Pattern 4: Security Settings Component Testing

All 4 security components (`SecurityMfaSection`, `SecurityPasswordSection`, `SecuritySessionsSection`, `SecurityAccountsSection`) call `authClient` from `@/lib/auth-client` directly — NOT via a `@/lib/api/settings` module. This is different from the CONTEXT.md note about `jest.mock('@/lib/api/settings')` — that applies only if such a module exists. For these components, the mock target is `@/lib/auth-client`.

They also use `useTranslations()` from `@/lib/hooks/use-translations`. Mocking it is the simplest approach.

```typescript
// Source: confirmed from SecurityMfaSection.tsx, SecurityPasswordSection.tsx, etc.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecurityMfaSection } from './SecurityMfaSection';

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: jest.fn(),
    passkey: {
      listUserPasskeys: jest.fn(),
      addPasskey: jest.fn(),
      deletePasskey: jest.fn(),
    },
    twoFactor: {
      enable: jest.fn(),
      disable: jest.fn(),
      verifyTotp: jest.fn(),
      generateBackupCodes: jest.fn(),
    },
  },
}));

// Must mock translations to avoid undefined access errors
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    settings: { securityPanel: null }, // components fallback to hardcoded strings
  }),
}));

// MUI needs ThemeProvider or components will use default theme
// next/image is already handled by jest.setup.ts mock
```

**Important discovery:** `SecurityMfaSection` uses `require('ua-parser-js')` at module level. This library runs in jsdom fine but the require pattern (not import) means jest transforms it normally.

**Important discovery:** `SecurityMfaSection` uses `next/image` (Image component). The jest.setup.ts does NOT currently mock `next/image`. Need to add a mock or it will fail in jsdom.

### Pattern 5: email-ui Slice Tests (via root store)

The 6 slice files export factory functions, not stores. Testing happens through `useEmailUIStore`.

```typescript
// Source: confirmed from email-ui-store.ts + individual slice files
import { useEmailUIStore } from '../email-ui-store';

const initialState = useEmailUIStore.getState();

beforeEach(() => {
  useEmailUIStore.getState().reset(); // root store has reset() action
});

// compose-slice.test.ts
it('openCompose sets isOpen and mode', () => {
  useEmailUIStore.getState().openCompose({ mode: 'new' });
  expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
  expect(useEmailUIStore.getState().compose.mode).toBe('new');
});

// filter-slice.test.ts — side effect: setFilters also clears selection
it('setFolder clears selectedIds and activeEmailId', () => {
  useEmailUIStore.getState().selectEmail('email-1');
  useEmailUIStore.getState().setFolder('SENT');
  expect(useEmailUIStore.getState().selectedIds.size).toBe(0);
  expect(useEmailUIStore.getState().activeEmailId).toBeNull();
  expect(useEmailUIStore.getState().filters.specialUse).toBe('SENT');
});
```

### Anti-Patterns to Avoid
- **Wrapping Zustand in React hooks during tests:** Store actions are plain functions accessible via `getState()` — no `renderHook` needed.
- **Mocking the entire Zustand store:** Test actual behavior, not mocked behavior.
- **Using `jest.mock` on `@/lib/auth-client` with wrong shape:** Each component uses a different subset of `authClient` methods — mock only what that component calls.
- **Forgetting `persist` middleware in email-ui-store:** The store uses `persist` which calls `localStorage`. `jest.setup.ts` already mocks `localStorage` so this is handled.
- **Snapshot tests on MUI components:** Out of scope per REQUIREMENTS.md and confirmed by CONTEXT.md.
- **Testing that `useEmailUIStore.setState(initialState, true)` works correctly with Sets:** Zustand's `setState(state, true)` replaces state wholesale — calling `reset()` action is safer because it recreates the Set instances correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Query wrapper for hooks | Custom Provider wrapper | Copy `createWrapper()` from use-ai-actions.test.tsx exactly |
| User interactions | Manual DOM event dispatching | `@testing-library/user-event` (already installed) |
| Store reset between tests | State inspection and manual cleanup | `store.getState().reset()` or `store.setState(initial, true)` |
| API response shapes | Inventing types | Read the actual API module types and use them exactly |

## Common Pitfalls

### Pitfall 1: email-ui-store persist middleware uses localStorage Set serialization
**What goes wrong:** The `email-ui-store` uses `persist` with `createJSONStorage(() => localStorage)` and serializes Sets as arrays. In test environment, `localStorage` is mocked (jest.setup.ts). The `partialize` function only persists `viewMode` and `kanbanAssignments`. This should work transparently in tests — but if tests call store actions before the mock is set up, the localStorage mock may not intercept.
**How to avoid:** Use `useEmailUIStore.getState().reset()` in `beforeEach` — this bypasses persistence entirely and directly sets state.

### Pitfall 2: label-tree-store uses persist with Set serialization
**What goes wrong:** `label-tree-store` uses `persist` with a custom `merge` function that deserializes `expandedIds` from Array back to Set. In tests, the `localStorage` mock doesn't restore state between tests.
**How to avoid:** Reset via `useLabelTreeStore.setState({ expandedIds: new Set<string>() }, true)` in beforeEach — this bypasses persistence.

### Pitfall 3: calendar-store `setEvents` has side effect
**What goes wrong:** `setEvents` does two things: sets `events` AND auto-enables all calendar IDs in `enabledCalendarIds`. Tests that only assert on `events` and ignore `enabledCalendarIds` will pass but miss the side effect behavior.
**How to avoid:** Assert both fields when testing `setEvents`.

### Pitfall 4: SecurityMfaSection uses `next/image`
**What goes wrong:** `next/image` renders an `<img>` with special handling not present in jsdom. Jest will throw an error unless mocked.
**How to avoid:** Add to jest.setup.ts or mock inline in the test file:
```typescript
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
```

### Pitfall 5: useTranslations returns deeply nested object
**What goes wrong:** Security components access deeply nested translation paths like `t.settings.securityPanel?.mfa?.totp.title`. If mock returns a shallow object, optional chaining `?.` will return `undefined` and components fall back to hardcoded English strings — this is fine because components all have `|| 'fallback'` patterns.
**How to avoid:** Mock `useTranslations` to return `{ settings: { securityPanel: null } }` — all `?.` accesses resolve to undefined/null, all fallbacks activate.

### Pitfall 6: SecurityAccountsSection and SecurityPasswordSection call `authClient.listAccounts()`
**What goes wrong:** `listAccounts` is not on `twoFactor` or `passkey` — it's a top-level `authClient` method. Missing it in the mock causes TypeError on component mount.
**How to avoid:** Include `listAccounts: jest.fn()` in the `authClient` mock for those two components.

### Pitfall 7: label-store's `reorderLabels` has optimistic update + rollback
**What goes wrong:** Testing the rollback path requires the API mock to reject AND asserting that labels revert to previous state AND that `error` is set. Easy to forget the rollback assertion.
**How to avoid:** Test sequence: set initial labels → call reorderLabels (with rejected mock) → assert labels reverted → assert error state set.

### Pitfall 8: contact-store `deleteContact` modifies `selectedIds` Set
**What goes wrong:** `deleteContact` removes the deleted ID from `selectedIds` in a single state update. Tests that pre-select the ID and then delete must verify `selectedIds` changed, not just `contacts`.
**How to avoid:** In `deleteContact` tests, always set a selectedId first to exercise the Set cleanup path.

### Pitfall 9: Query hooks use `getGlobalToast()` in onError handlers
**What goes wrong:** `use-emails.ts` mutation hooks call `getGlobalToast().error(...)` in `onError`. In tests, this function is not mocked and will throw if the toast context is not set up.
**How to avoid:** Mock the toast context module:
```typescript
jest.mock('@/lib/context/toast-context', () => ({
  getGlobalToast: jest.fn(() => ({ error: jest.fn(), success: jest.fn() })),
  getGlobalTranslations: jest.fn(() => ({ errors: {} })),
}));
```

## Code Examples

### Standalone Store Test (no API calls)
```typescript
// Source: confirmed from stores/sync-store.ts structure
import { useSyncStore } from './sync-store';

beforeEach(() => {
  useSyncStore.setState({ lastStatus: null }, true);
});

describe('useSyncStore', () => {
  it('setStatus stores the provided status', () => {
    const status = {
      providerId: 'p1',
      status: 'completed' as const,
      progress: 100,
      timestamp: '2026-01-01T00:00:00Z',
    };
    useSyncStore.getState().setStatus(status);
    expect(useSyncStore.getState().lastStatus).toEqual(status);
  });

  it('clear resets lastStatus to null', () => {
    useSyncStore.getState().setStatus({ providerId: 'p1', status: 'started', timestamp: '2026-01-01T00:00:00Z' });
    useSyncStore.getState().clear();
    expect(useSyncStore.getState().lastStatus).toBeNull();
  });
});
```

### Email-ui Slice Test (via root store)
```typescript
// Source: confirmed from stores/email-ui/kanban-slice.ts
import { useEmailUIStore } from '../email-ui-store';

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('kanban-slice', () => {
  it('setEmailKanbanColumn assigns column to email', () => {
    useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'to-reply');
    expect(useEmailUIStore.getState().kanbanAssignments['email-1']).toBe('to-reply');
  });

  it('getEmailColumn returns inbox for unmapped email', () => {
    const col = useEmailUIStore.getState().getEmailColumn('unknown-email');
    expect(col).toBe('inbox');
  });

  it('pruneKanbanAssignments removes stale entries', () => {
    useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'done');
    useEmailUIStore.getState().setEmailKanbanColumn('email-2', 'to-reply');
    useEmailUIStore.getState().pruneKanbanAssignments(new Set(['email-1']));
    expect(useEmailUIStore.getState().kanbanAssignments['email-1']).toBe('done');
    expect(useEmailUIStore.getState().kanbanAssignments['email-2']).toBeUndefined();
  });
});
```

### Security Component Test Skeleton
```typescript
// Source: confirmed from SecurityPasswordSection.tsx structure
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecurityPasswordSection } from './SecurityPasswordSection';

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: jest.fn(),
    changePassword: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ settings: { securityPanel: null } }),
}));

const { authClient } = require('@/lib/auth-client') as { authClient: jest.Mocked<any> };

beforeEach(() => {
  jest.clearAllMocks();
  authClient.listAccounts.mockResolvedValue({ data: [{ providerId: 'credential' }] });
});

it('renders password change form after loading', async () => {
  render(<SecurityPasswordSection />);
  await waitFor(() => {
    expect(screen.getByText(/Change Password/i)).toBeInTheDocument();
  });
});
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Wrapping Zustand in React for tests | Direct `store.getState().action()` calls | No React overhead, faster tests |
| Separate test directories (`__tests__/`) | Co-located test files | Easier to find, less navigation overhead |
| Mocking entire hooks in component tests | Mocking API clients, using real hooks | Tests actual hook behavior |

## Open Questions

1. **`next/image` mock in jest.setup.ts vs per-file**
   - What we know: jest.setup.ts does NOT currently mock `next/image`; SecurityMfaSection imports it
   - What's unclear: Whether adding to jest.setup.ts affects other tests negatively
   - Recommendation: Add `next/image` mock to jest.setup.ts — it's a global no-op that is always correct in jsdom; no component should rely on Next.js image optimization in unit tests

2. **authClient mock completeness per component**
   - What we know: Each of the 4 security components uses a different subset of authClient methods
   - What's unclear: Whether SecuritySessionsSection calls additional methods beyond listSessions/revokeSession
   - Recommendation: Read remaining security component files fully during Wave 0 (plan review) to enumerate exact authClient methods per component

3. **`ua-parser-js` require() in SecurityMfaSection and SecuritySessionsSection**
   - What we know: Both components use `require('ua-parser-js')` at module scope (not dynamic import)
   - What's unclear: Whether jsdom's navigator.userAgent triggers edge cases in the parser
   - Recommendation: No mock needed; `ua-parser-js` is a pure parser with no DOM side effects

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + jsdom + ts-jest |
| Config file | `frontend/jest.config.js` (exists) |
| Quick run command | `cd frontend && npx jest --testPathPattern="stores/sync-store" --no-coverage` |
| Full suite command | `cd frontend && npx jest --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FTEST-01 | 14 Zustand store files have tests | unit | `cd frontend && npx jest --testPathPattern="stores/" --no-coverage` | Wave 0 |
| FTEST-02 | Critical query hooks tested | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/" --no-coverage` | Wave 0 |
| FTEST-03 | Security settings components tested | unit | `cd frontend && npx jest --testPathPattern="components/settings/Security" --no-coverage` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx jest --testPathPattern="<file>" --no-coverage`
- **Per wave merge:** `cd frontend && npx jest --coverage`
- **Phase gate:** Full suite green + coverage >= 30% before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/stores/calendar-store.test.ts` — covers FTEST-01
- [ ] `frontend/stores/contact-store.test.ts` — covers FTEST-01
- [ ] `frontend/stores/dashboard-store.test.ts` — covers FTEST-01
- [ ] `frontend/stores/folders-store.test.ts` — covers FTEST-01
- [ ] `frontend/stores/label-store.test.ts` — covers FTEST-01
- [ ] `frontend/stores/label-tree-store.test.ts` — covers FTEST-01
- [ ] `frontend/stores/sync-store.test.ts` — covers FTEST-01
- [ ] `frontend/stores/email-ui-store.test.ts` — covers FTEST-01 (root store integration of slices)
- [ ] `frontend/stores/email-ui/compose-slice.test.ts` — covers FTEST-01
- [ ] `frontend/stores/email-ui/filter-slice.test.ts` — covers FTEST-01
- [ ] `frontend/stores/email-ui/kanban-slice.test.ts` — covers FTEST-01
- [ ] `frontend/stores/email-ui/selection-slice.test.ts` — covers FTEST-01
- [ ] `frontend/stores/email-ui/sidebar-slice.test.ts` — covers FTEST-01
- [ ] `frontend/stores/email-ui/view-slice.test.ts` — covers FTEST-01
- [ ] `frontend/hooks/queries/use-emails.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-folders.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-contacts.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-organizations.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-settings.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-providers.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-labels.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-folder-metadata.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-billing.test.ts` — covers FTEST-02
- [ ] `frontend/hooks/queries/use-subscription-limits.test.ts` — covers FTEST-02
- [ ] `frontend/components/settings/SecurityMfaSection.test.tsx` — covers FTEST-03
- [ ] `frontend/components/settings/SecurityPasswordSection.test.tsx` — covers FTEST-03
- [ ] `frontend/components/settings/SecuritySessionsSection.test.tsx` — covers FTEST-03
- [ ] `frontend/components/settings/SecurityAccountsSection.test.tsx` — covers FTEST-03
- [ ] `frontend/jest.setup.ts` update — add `next/image` mock for component tests

## Codebase Inventory

### 14 Zustand Store Files Mapped

| # | File | Has reset()? | Has API calls? | Test Reset Strategy |
|---|------|-------------|----------------|---------------------|
| 1 | `stores/calendar-store.ts` | Yes | No (logger only) | `store.getState().reset()` |
| 2 | `stores/contact-store.ts` | Yes | No | `store.getState().reset()` |
| 3 | `stores/dashboard-store.ts` | No | No | `store.setState(initial, true)` |
| 4 | `stores/email-ui-store.ts` | Yes (root reset) | No | `store.getState().reset()` |
| 5 | `stores/folders-store.ts` | Yes | No | `store.getState().reset()` |
| 6 | `stores/label-store.ts` | No (implicit) | Yes (labelsApi) | `store.setState(initial, true)` + mock API |
| 7 | `stores/label-tree-store.ts` | No | No | `store.setState({expandedIds: new Set()}, true)` |
| 8 | `stores/sync-store.ts` | No | No | `store.setState({lastStatus: null}, true)` |
| 9 | `stores/email-ui/compose-slice.ts` | via root reset | No | `useEmailUIStore.getState().reset()` |
| 10 | `stores/email-ui/filter-slice.ts` | via root reset | No | `useEmailUIStore.getState().reset()` |
| 11 | `stores/email-ui/kanban-slice.ts` | via root reset | No | `useEmailUIStore.getState().reset()` |
| 12 | `stores/email-ui/selection-slice.ts` | via root reset | No | `useEmailUIStore.getState().reset()` |
| 13 | `stores/email-ui/sidebar-slice.ts` | via root reset | No | `useEmailUIStore.getState().reset()` |
| 14 | `stores/email-ui/view-slice.ts` | via root reset | No | `useEmailUIStore.getState().reset()` |

### Security Component API Dependencies

| Component | authClient methods called | Also uses |
|-----------|--------------------------|-----------|
| `SecurityMfaSection` | `getSession`, `passkey.listUserPasskeys`, `passkey.addPasskey`, `passkey.deletePasskey`, `twoFactor.enable`, `twoFactor.disable`, `twoFactor.verifyTotp`, `twoFactor.generateBackupCodes` | `next/image`, `ua-parser-js` |
| `SecurityPasswordSection` | `listAccounts`, `changePassword` | none unusual |
| `SecuritySessionsSection` | `listSessions` (inferred), session revoke methods | `ua-parser-js` |
| `SecurityAccountsSection` | `listAccounts`, account link/unlink methods | none unusual |

### Query Hooks Mock Targets

| Hook file | Mock target | Notes |
|-----------|-------------|-------|
| `use-emails.ts` | `@/lib/api/emails` | Also mock `@/lib/context/toast-context` for mutation tests |
| `use-folders.ts` | `@/lib/api/folders` (inferred) | |
| `use-contacts.ts` | `@/lib/api/contacts` (inferred) | |
| `use-organizations.ts` | `@/lib/auth-client` + `global fetch` | Uses `authClient.organization.*` and raw `fetch` |
| `use-settings.ts` | `@/lib/api/users` + `@/lib/api/providers` | |
| `use-providers.ts` | `@/lib/api/providers` (inferred) | |
| `use-labels.ts` | `@/lib/api/labels` (inferred) | |
| `use-billing.ts` | billing API module (inferred) | |
| `use-subscription-limits.ts` | subscription API module (inferred) | |

## Sources

### Primary (HIGH confidence)
- Direct file reads: all 14 store files, 4 security components, 10 query hook files, jest.config.js, jest.setup.ts
- `frontend/hooks/ai/use-ai-actions.test.tsx` — canonical reference test pattern
- `frontend/lib/query-client.test.tsx` — additional established pattern

### Secondary (MEDIUM confidence)
- Zustand documentation pattern (direct getState() testing) — confirmed by existing use-ai-actions.test.tsx behavior with non-React patterns
- Testing Library `renderHook` + `act` + `waitFor` sequence — confirmed from existing test

### Tertiary (LOW confidence)
- `SecuritySessionsSection` exact authClient methods — file only partially read (first 60 lines); remaining methods inferred from component structure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified present in jest.config.js and node_modules
- Architecture: HIGH — confirmed from reading actual source files and existing tests
- Pitfalls: HIGH — derived from reading actual store implementations (Set handling, side effects, persist middleware)
- Security component mocks: MEDIUM — MfaSection fully read; PasswordSection partially read; SessionsSection only first 60 lines

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable test infrastructure, no fast-moving dependencies)
