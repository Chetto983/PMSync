# Testing Patterns

**Analysis Date:** 2026-01-31

## Test Framework

**Runner:**
- Jest (both backend and frontend)
- Version: Part of standard monorepo setup

**Backend Config:** `backend/jest.config.js`
- Preset: `ts-jest`
- Test environment: `node`
- Transform: TypeScript via ts-jest with `tsconfig.test.json`

**Frontend Config:** `frontend/jest.config.js`
- Test environment: `jsdom` (DOM simulation for React)
- Transform: TypeScript via ts-jest
- Assertion library: Jest built-in matchers

**Run Commands:**
```bash
# Backend
npm run test                    # Run all tests in backend
npm run test:watch             # Watch mode
npm run test:cov               # Coverage report

# Frontend
npm run test                    # Run all tests
npm run test:watch             # Watch mode
npm run test:coverage          # Coverage report
```

## Test File Organization

**Location:**
- Backend: Co-located with source code or in `test/` directory
  - Pattern: `src/**/*.spec.ts` or `test/**/*.spec.ts`
  - Setup: `test/setup.ts` (runs before all tests)
- Frontend: Co-located with components
  - Pattern: `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx`
  - Excluded: `e2e/` directory

**Naming:**
- Backend: `*.spec.ts` extension (required pattern in jest.config.js)
- Frontend: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` (multiple patterns supported)

**Structure:**
```
backend/
├── src/
│   ├── common/
│   │   ├── services/
│   │   │   ├── cache.service.ts
│   │   │   └── // spec tests located elsewhere or via test/
│   │   └── // other common modules
│   └── modules/
│       └── // feature modules
└── test/
    ├── setup.ts              # Jest setup (globals, mocks, fixtures)
    └── mocks/                # Mock modules
        ├── nanoid.mock.ts
        ├── jsdom.mock.ts
        └── // other mocks

frontend/
├── components/
│   ├── MyComponent.tsx
│   ├── MyComponent.test.tsx  # Co-located test
│   └── // other components
├── hooks/
│   ├── use-my-hook.ts
│   ├── use-my-hook.test.ts   # Co-located test
│   └── // other hooks
└── jest.setup.ts             # Jest setup
```

## Test Structure

**Suite Organization:**

Backend Pattern (NestJS services):
```typescript
describe('MyService', () => {
  let service: MyService;
  let dependency: DependencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyService, mockDependencyProvider],
    }).compile();

    service = module.get<MyService>(MyService);
    dependency = module.get<DependencyService>(DependencyService);
  });

  describe('methodName', () => {
    it('should do something when conditions met', async () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toEqual(expected);
    });

    it('should handle errors appropriately', async () => {
      // Arrange
      jest.spyOn(dependency, 'method').mockRejectedValueOnce(new Error('Test error'));

      // Act & Assert
      await expect(service.methodName()).rejects.toThrow('Test error');
    });
  });
});
```

Frontend Pattern (React hooks):
```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMyHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useMyHook(), { wrapper: createWrapper() });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should fetch data on mount', async () => {
    (mockApi.getData as jest.Mock).mockResolvedValueOnce({ data: 'test' });

    const { result } = renderHook(() => useMyHook(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data).toEqual('test');
    });
  });

  it('should handle errors', async () => {
    (mockApi.getData as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    const { result } = renderHook(() => useMyHook(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
  });
});
```

Frontend Pattern (React components):
```typescript
import { render, screen } from '@testing-library/react';

describe('MyComponent', () => {
  it('should render children', () => {
    render(
      <MyComponent>
        <div data-testid="child">Child Content</div>
      </MyComponent>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('should pass props to wrapped component', () => {
    const WrappedComponent = withWrapper(OriginalComponent);

    render(<WrappedComponent name="Test User" />);

    expect(screen.getByText('Hello, Test User')).toBeInTheDocument();
  });
});
```

**Patterns:**

1. **Setup Pattern:**
   - Use `beforeEach()` to reset mocks and create fresh instances
   - Use `beforeAll()` for expensive setup (module creation)
   - `jest.clearAllMocks()` resets all mock call counts and implementations

2. **Teardown Pattern:**
   - Use `afterEach()` to clean up timers, subscriptions
   - Example: `jest.useRealTimers()` after fake timers
   - NestJS: Module cleanup handled by `Test` harness

3. **Assertion Pattern:**
   - Explicit expect statements with descriptive matchers
   - Test one thing per `it()` block (single responsibility)
   - Async assertions use `await expect()` or `waitFor()`

## Mocking

**Framework:**
- Jest built-in `jest.mock()`, `jest.spyOn()`
- No Vitest (Jest is primary)
- No Sinon (Jest mocks are sufficient)

**Mocking Patterns:**

Module Mocking:
```typescript
// Mock before importing the component that uses the module
jest.mock('@/lib/api/ai', () => ({
  voltAgentApi: {
    getPendingActions: jest.fn(),
    approveAction: jest.fn(),
    rejectAction: jest.fn(),
  },
}));

// Then import the hook that uses voltAgentApi
import { useAiActions } from './use-ai-actions';

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Configure return values
(voltAgentApi.getPendingActions as jest.Mock).mockResolvedValueOnce({
  data: { actions: mockPendingActions, total: 2 },
});
```

Function Mocking:
```typescript
const mockCallback = jest.fn();
const mockOnApprove = jest.fn();

const { result } = renderHook(
  () => useAiActions({ autoFetch: false, onApprove: mockOnApprove }),
  { wrapper: createWrapper() }
);

// Verify calls
expect(mockOnApprove).toHaveBeenCalledWith('exec-1');
```

Spy Mocking:
```typescript
const spy = jest.spyOn(service, 'method').mockResolvedValueOnce({ success: true });

// After test
expect(spy).toHaveBeenCalled();
spy.mockRestore();
```

Async Mocking:
```typescript
let resolveApprove: (value: unknown) => void;
const pendingPromise = new Promise((resolve) => {
  resolveApprove = resolve;
});
(voltAgentApi.approveAction as jest.Mock).mockReturnValueOnce(pendingPromise);

// Later
await act(async () => {
  resolveApprove!({ data: { status: 'approved' } });
});
```

**What to Mock:**
- External APIs and HTTP clients
- Third-party service clients (Redis, database connectors)
- File system operations
- Timers (setTimeout, setInterval)
- WebSocket connections
- Auth tokens and credentials

**What NOT to Mock:**
- Core business logic of the unit under test
- Pure utility functions
- React hooks being tested (test the hook itself, not its internals)
- Internal state management (let it work naturally)
- Error handling logic (test actual errors, not mocked ones for error paths)

## Fixtures and Factories

**Test Data:**

Backend Fixture Pattern:
```typescript
// Mock data objects defined at top of test file
const mockPendingAction = {
  id: 'action-1',
  executionId: 'exec-1',
  actionType: 'SEND_EMAIL',
  severity: 'MEDIUM',
  summary: 'Send follow-up email',
  payload: { to: 'john@example.com' },
  status: 'PENDING',
};

const mockPendingActions = [mockPendingAction, { ...mockPendingAction, id: 'action-2' }];
```

Frontend Fixture Pattern:
```typescript
// Wrapper factory for TanStack Query
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Test Consumer component for context testing
function TestConsumer({ onContext }: { onContext?: (ctx: AuthContextType) => void }) {
  return (
    <AuthContext.Consumer>
      {(context) => {
        onContext?.(context);
        return (
          <div>
            <span data-testid="authenticated">{String(context.isAuthenticated)}</span>
            <span data-testid="user">{context.user?.email || 'none'}</span>
          </div>
        );
      }}
    </AuthContext.Consumer>
  );
}
```

**Location:**
- Fixtures defined inline in test files (not shared)
- Complex factories in separate files (rare)
- Mock API responses defined at test file top

## Coverage

**Requirements:**
- No enforced minimum (not configured in jest.config)
- Optional coverage reports via `npm run test:coverage`

**View Coverage:**

Backend:
```bash
npm run test -- --coverage
# Output: coverage/index.html (open in browser)
```

Frontend:
```bash
npm run test -- --coverage
# Output: coverage/index.html (open in browser)
```

**Coverage Configuration:**

Backend collectCoverageFrom:
```javascript
collectCoverageFrom: [
  'src/**/*.{ts,js}',
  '!src/**/*.spec.ts',
  '!src/**/index.ts',
  '!src/main.ts',
],
```

Frontend collectCoverageFrom:
```javascript
collectCoverageFrom: [
  'lib/**/*.{ts,tsx}',
  'hooks/**/*.{ts,tsx}',
  'stores/**/*.{ts,tsx}',
  'types/**/*.{ts,tsx}',
  '!**/*.d.ts',
],
```

## Test Types

**Unit Tests:**
- Scope: Single function, method, or hook
- Approach: Isolate unit with mocked dependencies
- Examples: Cache service methods, utility functions, React hooks
- Location: Co-located with source files

**Integration Tests:**
- Scope: Multiple components working together
- Approach: Use real implementations where possible, mock external APIs only
- Examples: Hook + TanStack Query together, Service + Prisma together
- Mocking: Database mocked in `jest.config.js` via `moduleNameMapper`

**E2E Tests:**
- Framework: Not configured (no Cypress, Playwright E2E runner in Jest)
- Note: Playwright MCP available for visual testing (not automated test runner)
- Execution: Manual testing recommended

**Special Test Type: Real Stress Tests**
- Backend has dedicated stress test scripts (NOT Jest)
- Location: `backend/scripts/` (e.g., `stress-test-atomic-sync.ts`)
- Run: `npx ts-node backend/scripts/test-*.ts`
- Purpose: Test race conditions, deadlocks, concurrency issues with real systems

## Common Patterns

**Async Testing:**

Hook async operations:
```typescript
it('should fetch data when mounted', async () => {
  (mockApi.getData as jest.Mock).mockResolvedValueOnce({ data: 'test' });

  const { result } = renderHook(() => useMyHook());

  // Wait for async operation
  await waitFor(() => {
    expect(result.current.data).toEqual('test');
  });
});
```

Manual async/await:
```typescript
it('should execute async operation', async () => {
  let result;
  await act(async () => {
    result = await service.methodName();
  });

  expect(result).toEqual(expected);
});
```

**Error Testing:**

API error handling:
```typescript
it('should handle API error', async () => {
  const mockError = new Error('API failed');
  (mockApi.getData as jest.Mock).mockRejectedValueOnce(mockError);

  const { result } = renderHook(() => useMyHook());

  await waitFor(() => {
    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe('API failed');
  });
});
```

Error expectation:
```typescript
it('should throw on invalid input', async () => {
  await expect(service.validate(null)).rejects.toThrow('Invalid input');
});
```

Sync error:
```typescript
it('should throw synchronously', () => {
  expect(() => {
    service.parseJson('invalid json');
  }).toThrow(SyntaxError);
});
```

**Mocking State Updates:**

Zustand store mocking:
```typescript
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: jest.fn((selector?: (state: any) => any) => {
    const state = { token: mockStoreState.token, user: mockStoreState.user };
    if (!selector) return state;
    return selector(state);
  }),
}));

// Update mock state between tests
beforeEach(() => {
  mockStoreState = { token: null, user: null };
});
```

**Timer Testing:**

Fake timers:
```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('should debounce calls', () => {
  jest.advanceTimersByTime(300);
  expect(mockCallback).toHaveBeenCalledTimes(1);
});
```

**WebSocket Testing:**

Mock subscriptions:
```typescript
const mockUnsub = jest.fn();
(websocketClient.onAiActionCreated as jest.Mock).mockReturnValue(mockUnsub);

renderHook(() => useAiActions({ enableRealtime: true }), { wrapper: createWrapper() });

expect(websocketClient.onAiActionCreated).toHaveBeenCalled();
```

Verify cleanup:
```typescript
const { unmount } = renderHook(() => useAiActions({ enableRealtime: true }), {
  wrapper: createWrapper(),
});

unmount();

expect(mockUnsub).toHaveBeenCalled();
```

## Test Utilities

**Testing Library Utilities (Frontend):**
- `render()` - Mount React component in test DOM
- `screen` - Query rendered components by text, role, testid
- `waitFor()` - Wait for async state changes
- `act()` - Wrap state updates to prevent warnings
- `renderHook()` - Test React hooks in isolation
- `rerender()` - Re-render component with new props
- `fireEvent()` - Simulate user interactions (rarely used; user-event preferred)

**Jest Built-in Utilities:**
- `jest.mock()` - Mock entire modules
- `jest.spyOn()` - Spy on or mock specific methods
- `jest.clearAllMocks()` - Reset all mock call counts
- `jest.useFakeTimers()` - Mock timers
- `jest.fn()` - Create mock functions
- `beforeEach()`, `afterEach()` - Test lifecycle hooks
- `describe()`, `it()` / `test()` - Test structure

**Custom Test Utilities:**
- `createWrapper()` - Factory for test context providers
- Mock data objects - Defined inline or in fixtures
- Test consumer components - For testing contexts/providers

## Module Mapping

Backend (`backend/jest.config.js`):
```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/src/$1',
  '^nanoid$': '<rootDir>/test/mocks/nanoid.mock.ts',
  '^jsdom$': '<rootDir>/test/mocks/jsdom.mock.ts',
  '^p-retry$': '<rootDir>/test/mocks/p-retry.mock.ts',
  '^is-network-error$': '<rootDir>/test/mocks/is-network-error.mock.ts',
},
```

Frontend (`frontend/jest.config.js`):
```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
},
```

## Transform Ignore Patterns

**Backend** (very permissive - allows ESM modules):
```javascript
transformIgnorePatterns: [
  'node_modules/(?!(@nestjs|@prisma|imapflow|mailparser|isomorphic-ws|nanoid|@mistralai|@langchain|langchain|p-retry|@anthropic-ai)/)',
],
```

**Frontend** (restrictive - only allows specific ESM packages):
```javascript
transformIgnorePatterns: [
  'node_modules/(?!(@tanstack|clsx|tailwind-merge)/)',
],
```

## Setup Files

**Backend:** `test/setup.ts`
- Runs once before all tests
- Defines Jest globals: `describe`, `it`, `expect`, `beforeAll`, etc.
- Can configure test timeouts, polyfills

**Frontend:** `jest.setup.ts`
- Runs once before all tests
- Can import testing-library matchers
- Setup React Testing Library configuration

---

*Testing analysis: 2026-01-31*
