import { usersApi } from './users';
import { apiClient } from '../api-client';

jest.mock('../api-client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    put: jest.fn(),
  },
}));

describe('usersApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clearAiMemory calls the correct endpoint', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({
      data: { success: true, deletedCount: 3 },
    });

    const result = await usersApi.clearAiMemory();

    expect(apiClient.delete).toHaveBeenCalledWith('/users/me/ai-memory');
    expect(result).toEqual({ success: true, deletedCount: 3 });
  });
});
