import { useAuthStore, User } from './auth-store';

// Reset store before each test
beforeEach(() => {
  useAuthStore.setState({
    token: null,
    user: null,
  });
  localStorage.clear();
  jest.clearAllMocks();
});

describe('useAuthStore', () => {
  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user',
    tenantId: 'tenant-456',
  };

  describe('initial state', () => {
    it('should have null token when no localStorage value', () => {
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
    });

    it('should have null user initially', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
    });
  });

  describe('setToken', () => {
    it('should set the token in state', () => {
      useAuthStore.getState().setToken('test-token');
      expect(useAuthStore.getState().token).toBe('test-token');
    });

    it('should persist token via persist middleware', () => {
      useAuthStore.getState().setToken('persisted-token');
      // Persist middleware uses 'auth-storage' key with JSON format
      expect(localStorage.setItem).toHaveBeenCalled();
      const calls = (localStorage.setItem as jest.Mock).mock.calls;
      const storageCall = calls.find((c: string[]) => c[0] === 'auth-storage');
      expect(storageCall).toBeDefined();
      if (storageCall) {
        const stored = JSON.parse(storageCall[1]);
        expect(stored.state.token).toBe('persisted-token');
      }
    });
  });

  describe('setUser', () => {
    it('should set the user in state', () => {
      useAuthStore.getState().setUser(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('should allow setting user to null', () => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setUser(null);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear token from state', () => {
      useAuthStore.getState().setToken('test-token');
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().token).toBeNull();
    });

    it('should clear user from state', () => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('integration', () => {
    it('should handle login flow', () => {
      const { setToken, setUser } = useAuthStore.getState();

      setToken('auth-token-123');
      setUser(mockUser);

      const state = useAuthStore.getState();
      expect(state.token).toBe('auth-token-123');
      expect(state.user).toEqual(mockUser);
    });

    it('should handle logout after login', () => {
      const { setToken, setUser, logout } = useAuthStore.getState();

      setToken('auth-token-123');
      setUser(mockUser);
      logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
    });
  });
});
