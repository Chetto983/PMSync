import { renderHook, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider, getQueryClient, makeQueryClient } from './query-client';

function getRetryFn() {
  const retry = makeQueryClient().getDefaultOptions().queries?.retry;
  expect(typeof retry).toBe('function');
  return retry as (failureCount: number, error: unknown) => boolean;
}

describe('QueryProvider', () => {
  it('should provide a QueryClient to children', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ data: 'test' });

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ['test'],
          queryFn: mockFetch,
        }),
      {
        wrapper: QueryProvider,
      },
    );

    // Initially loading
    expect(result.current.isPending).toBe(true);

    // Wait for query to resolve
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ data: 'test' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should cache queries with the same key', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ value: 42 });

    // First hook
    const { result: result1 } = renderHook(
      () =>
        useQuery({
          queryKey: ['cached-test'],
          queryFn: mockFetch,
          staleTime: 60000,
        }),
      {
        wrapper: QueryProvider,
      },
    );

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true);
    });

    // Second hook with same key should use cache
    const { result: result2 } = renderHook(
      () =>
        useQuery({
          queryKey: ['cached-test'],
          queryFn: mockFetch,
          staleTime: 60000,
        }),
      {
        wrapper: QueryProvider,
      },
    );

    // Should immediately have data from cache
    expect(result2.current.data).toEqual({ value: 42 });
    // Should only fetch once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle query errors', async () => {
    const mockError = new Error('Network error');
    const mockFetch = jest.fn().mockRejectedValue(mockError);

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ['error-test'],
          queryFn: mockFetch,
          retry: false, // Disable retry for faster test
        }),
      {
        wrapper: QueryProvider,
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(mockError);
  });
});

describe('getQueryClient', () => {
  it('should return a QueryClient instance', () => {
    const client = getQueryClient();
    expect(client).toBeDefined();
    expect(typeof client.getQueryCache).toBe('function');
    expect(typeof client.getMutationCache).toBe('function');
  });

  it('should return the same instance in browser environment', () => {
    const client1 = getQueryClient();
    const client2 = getQueryClient();
    expect(client1).toBe(client2);
  });
});

describe('makeQueryClient', () => {
  it('should not retry 403 query failures by default', () => {
    const retry = getRetryFn();

    expect(
      retry(0, {
        response: {
          status: 403,
        },
      }),
    ).toBe(false);
  });

  it('should not retry 429 query failures by default', () => {
    const retry = getRetryFn();

    expect(
      retry(0, {
        response: {
          status: 429,
        },
      }),
    ).toBe(false);
  });

  it('should retry transient failures below the max attempt count', () => {
    const retry = getRetryFn();

    expect(
      retry(0, {
        response: {
          status: 500,
        },
      }),
    ).toBe(true);
    expect(
      retry(3, {
        response: {
          status: 500,
        },
      }),
    ).toBe(false);
  });
});
