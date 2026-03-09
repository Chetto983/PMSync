/**
 * Frontend 401 Interceptor Tests (better-auth session)
 *
 * Tests that the apiClient interceptor:
 * 1. Calls authClient.signOut() on 401
 * 2. Passes through non-401 errors without signing out
 */
import MockAdapter from 'axios-mock-adapter';

// Mock the auth client before importing api-client
const mockSignOut = jest.fn(() => Promise.resolve());
jest.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut: mockSignOut,
  },
}));

// Import after mocking
import { apiClient } from '@/lib/api-client';

describe('401 Interceptor (better-auth session)', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    mockSignOut.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('should call authClient.signOut() on 401', async () => {
    mock.onGet('/test-endpoint').replyOnce(401);

    await expect(apiClient.get('/test-endpoint')).rejects.toThrow();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('should pass through non-401 errors without signing out', async () => {
    mock.onGet('/test-endpoint').replyOnce(500, { message: 'Internal Error' });

    await expect(apiClient.get('/test-endpoint')).rejects.toThrow();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
