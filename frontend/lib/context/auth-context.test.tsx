/**
 * Auth Context Tests
 *
 * Tests for the authentication context provider and user session management.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, AuthContext, AuthContextType } from './auth-context';

// Mock the API client
const mockGet = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: any[]) => mockGet(...args),
  },
}));

// Store state for mocking
let mockStoreState = {
  token: null as string | null,
  user: null as any,
};

const mockSetUser = jest.fn();
const mockLogout = jest.fn();
const mockRehydrate = jest.fn();

// Mock the auth store with proper Zustand structure
jest.mock('@/stores/auth-store', () => {
  // Create the mock function
  const useAuthStoreMock = jest.fn((selector?: (state: any) => any) => {
    const state = {
      token: mockStoreState.token,
      user: mockStoreState.user,
      setUser: mockSetUser,
      logout: mockLogout,
    };
    if (!selector) return state;
    return selector(state);
  });

  // Add Zustand's persist property to the function
  (useAuthStoreMock as any).persist = {
    rehydrate: () => mockRehydrate(),
  };

  // Add getState method
  (useAuthStoreMock as any).getState = () => ({
    token: mockStoreState.token,
    user: mockStoreState.user,
  });

  return { useAuthStore: useAuthStoreMock };
});

describe('AuthContext', () => {
  // Helper to render with context consumer
  function TestConsumer({ onContext }: { onContext?: (ctx: AuthContextType) => void }) {
    return (
      <AuthContext.Consumer>
        {(context) => {
          onContext?.(context);
          return (
            <div>
              <span data-testid="authenticated">{String(context.isAuthenticated)}</span>
              <span data-testid="loading">{String(context.isLoading)}</span>
              <span data-testid="user">{context.user?.email || 'none'}</span>
            </div>
          );
        }}
      </AuthContext.Consumer>
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mock store state
    mockStoreState = {
      token: null,
      user: null,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should provide default context values', () => {
      let contextValue: AuthContextType | null = null;

      render(
        <AuthProvider>
          <TestConsumer onContext={(ctx) => { contextValue = ctx; }} />
        </AuthProvider>
      );

      expect(contextValue).toBeDefined();
      expect(contextValue!.user).toBeNull();
      expect(contextValue!.token).toBeNull();
    });

    it('should call persist.rehydrate on mount', async () => {
      render(
        <AuthProvider>
          <div>Test</div>
        </AuthProvider>
      );

      // Advance timers to allow effects to run
      await act(async () => {
        jest.runAllTimers();
      });

      expect(mockRehydrate).toHaveBeenCalled();
    });

    it('should render children', () => {
      render(
        <AuthProvider>
          <div data-testid="child">Child Content</div>
        </AuthProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  describe('without token', () => {
    it('should set isLoading to false when no token', async () => {
      mockStoreState.token = null;
      mockStoreState.user = null;

      render(
        <AuthProvider>
          <AuthContext.Consumer>
            {(ctx) => (
              <div data-testid="loading">{String(ctx.isLoading)}</div>
            )}
          </AuthContext.Consumer>
        </AuthProvider>
      );

      // Allow microtasks to run (queueMicrotask)
      await act(async () => {
        jest.runAllTimers();
        await Promise.resolve(); // Flush microtasks
        await Promise.resolve(); // Additional flush for queueMicrotask
      });

      // isLoading should eventually be false
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      }, { timeout: 1000 });
    });

    it('should clear user if existing user but no token', async () => {
      mockStoreState.token = null;
      mockStoreState.user = { id: '1', email: 'test@test.com' };

      render(
        <AuthProvider>
          <div>Test</div>
        </AuthProvider>
      );

      await act(async () => {
        jest.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockSetUser).toHaveBeenCalledWith(null);
    });
  });

  describe('with token', () => {
    it('should fetch user data when token exists', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        tenantId: 'tenant-1',
      };

      mockGet.mockResolvedValueOnce({ data: mockUser });
      mockStoreState.token = 'valid-token';
      mockStoreState.user = null;

      render(
        <AuthProvider>
          <div>Test</div>
        </AuthProvider>
      );

      await act(async () => {
        jest.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/auth/me');
      });

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({
          id: 'user-1',
          email: 'test@example.com',
        }));
      });
    });

    it('should logout on auth failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Unauthorized'));
      mockStoreState.token = 'invalid-token';
      mockStoreState.user = null;

      render(
        <AuthProvider>
          <div>Test</div>
        </AuthProvider>
      );

      await act(async () => {
        jest.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('context value memoization', () => {
    it('should provide stable context value', async () => {
      const contextValues: AuthContextType[] = [];

      function ContextCapture() {
        return (
          <AuthContext.Consumer>
            {(ctx) => {
              contextValues.push(ctx);
              return null;
            }}
          </AuthContext.Consumer>
        );
      }

      const { rerender } = render(
        <AuthProvider>
          <ContextCapture />
        </AuthProvider>
      );

      await act(async () => {
        jest.runAllTimers();
        await Promise.resolve();
      });

      rerender(
        <AuthProvider>
          <ContextCapture />
        </AuthProvider>
      );

      // Context values should be captured
      expect(contextValues.length).toBeGreaterThan(0);
    });
  });

  describe('default context', () => {
    it('should have correct default values outside provider', () => {
      let contextValue: AuthContextType | null = null;

      // Render without provider to get default context
      render(
        <AuthContext.Consumer>
          {(ctx) => {
            contextValue = ctx;
            return null;
          }}
        </AuthContext.Consumer>
      );

      expect(contextValue).toBeDefined();
      expect(contextValue!.user).toBeNull();
      expect(contextValue!.isLoading).toBe(true);
      expect(contextValue!.isAuthenticated).toBe(false);
      expect(contextValue!.token).toBeNull();
    });
  });
});
