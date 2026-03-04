/**
 * Frontend 401 Interceptor Tests (AUTH-04)
 *
 * Tests that the apiClient interceptor:
 * 1. Calls POST /auth/refresh on 401 before logging out
 * 2. Queues concurrent 401s behind a single refresh call
 * 3. Logs out if /auth/refresh itself returns 401 (no infinite loop)
 * 4. Passes through non-401 errors without triggering refresh
 */
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock the auth store before importing api-client
const mockLogout = jest.fn();
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      logout: mockLogout,
    }),
  },
}));

// Import after mocking
import { apiClient } from '@/lib/api-client';

describe('401 Interceptor (AUTH-04)', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    mockLogout.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('should call /auth/refresh on 401 before logging out', async () => {
    // First call returns 401, then refresh succeeds, then retry succeeds
    mock.onGet('/test-endpoint').replyOnce(401);
    mock.onPost('/auth/refresh').replyOnce(200, { success: true });
    mock.onGet('/test-endpoint').replyOnce(200, { data: 'ok' });

    const res = await apiClient.get('/test-endpoint');
    expect(res.data).toEqual({ data: 'ok' });
    // Should NOT have called logout since refresh succeeded
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should queue concurrent 401s behind a single refresh call', async () => {
    // Both endpoints return 401
    mock.onGet('/endpoint-a').replyOnce(401);
    mock.onGet('/endpoint-b').replyOnce(401);
    // Single refresh call succeeds
    mock.onPost('/auth/refresh').replyOnce(200, { success: true });
    // Retries succeed
    mock.onGet('/endpoint-a').replyOnce(200, { data: 'a' });
    mock.onGet('/endpoint-b').replyOnce(200, { data: 'b' });

    const [resA, resB] = await Promise.all([
      apiClient.get('/endpoint-a'),
      apiClient.get('/endpoint-b'),
    ]);

    expect(resA.data).toEqual({ data: 'a' });
    expect(resB.data).toEqual({ data: 'b' });

    // Verify /auth/refresh was called exactly once
    const refreshCalls = mock.history.post.filter((r) =>
      r.url?.includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('should logout if /auth/refresh returns 401 (no infinite loop)', async () => {
    mock.onGet('/test-endpoint').replyOnce(401);
    mock.onPost('/auth/refresh').replyOnce(401);

    await expect(apiClient.get('/test-endpoint')).rejects.toThrow();
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should pass through non-401 errors without triggering refresh', async () => {
    mock.onGet('/test-endpoint').replyOnce(500, { message: 'Internal Error' });

    await expect(apiClient.get('/test-endpoint')).rejects.toThrow();

    // No refresh calls should have been made
    const refreshCalls = mock.history.post.filter((r) =>
      r.url?.includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(0);
  });
});
