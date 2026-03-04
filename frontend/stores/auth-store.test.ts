import { useAuthStore, User } from './auth-store';

// Reset store before each test
beforeEach(() => {
  useAuthStore.setState({
    token: null,
    user: null,
  });
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
    it('should have null token (httpOnly cookie handles auth)', () => {
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
    });

    it('should have null user initially', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
    });
  });

  describe('setToken', () => {
    it('should be a no-op (httpOnly cookie handles auth)', () => {
      useAuthStore.getState().setToken('test-token');
      // Token stays null -- httpOnly cookie is the auth credential
      expect(useAuthStore.getState().token).toBeNull();
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
    it('should handle login flow (user set in memory, token from cookie)', () => {
      const { setToken, setUser } = useAuthStore.getState();

      // setToken is a no-op; the httpOnly cookie handles auth
      setToken('auth-token-123');
      setUser(mockUser);

      const state = useAuthStore.getState();
      // Token stays null -- frontend never stores JWT
      expect(state.token).toBeNull();
      expect(state.user).toEqual(mockUser);
    });

    it('should handle logout after login', () => {
      const { setUser, logout } = useAuthStore.getState();

      setUser(mockUser);
      logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
    });
  });
});
