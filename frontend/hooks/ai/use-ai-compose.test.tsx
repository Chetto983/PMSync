/**
 * Tests for useAiCompose hook
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useAiCompose } from './use-ai-compose';
import { aiApi } from '@/lib/api/ai';

// Mock the AI API
jest.mock('@/lib/api/ai', () => ({
  aiApi: {
    composeEmail: jest.fn(),
  },
}));

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestQueryWrapper;
}

describe('useAiCompose', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAiCompose(), {
      wrapper: createWrapper(),
    });

    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isComposing).toBe(false);
  });

  it('should compose email successfully', async () => {
    const mockResponse = {
      data: {
        success: true,
        body: 'Dear John,\n\nThank you for your email.',
        subject: 'Re: Meeting Request',
        variantUsed: 'professional',
      },
    };
    (aiApi.composeEmail as jest.Mock).mockResolvedValueOnce(mockResponse);

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useAiCompose({ onSuccess }), {
      wrapper: createWrapper(),
    });

    let composeResult;
    await act(async () => {
      composeResult = await result.current.compose({
        prompt: 'Write a thank you email',
        tone: 'professional',
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(aiApi.composeEmail).toHaveBeenCalledWith({
      prompt: 'Write a thank you email',
      to: undefined,
      subject: undefined,
      tone: 'professional',
      locale: 'en',
      variant: undefined,
    });

    expect(composeResult).toEqual({
      body: 'Dear John,\n\nThank you for your email.',
      subject: 'Re: Meeting Request',
      variantUsed: 'professional',
    });

    expect(result.current.result).toEqual({
      body: 'Dear John,\n\nThank you for your email.',
      subject: 'Re: Meeting Request',
      variantUsed: 'professional',
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('should compose email with all options', async () => {
    const mockResponse = {
      data: {
        success: true,
        body: 'Hi team,\n\nLet me know your availability.',
        subject: 'Meeting Tomorrow',
      },
    };
    (aiApi.composeEmail as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(
      () => useAiCompose({ locale: 'it', defaultTone: 'casual' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.compose({
        prompt: 'Schedule a meeting',
        to: ['john@example.com', 'jane@example.com'],
        subject: 'Team Meeting',
        tone: 'friendly',
        locale: 'en',
        variant: 'concise',
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(aiApi.composeEmail).toHaveBeenCalledWith({
      prompt: 'Schedule a meeting',
      to: ['john@example.com', 'jane@example.com'],
      subject: 'Team Meeting',
      tone: 'friendly',
      locale: 'en',
      variant: 'concise',
    });
  });

  it('should use default tone when not specified', async () => {
    const mockResponse = {
      data: {
        success: true,
        body: 'Professional email content',
      },
    };
    (aiApi.composeEmail as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(
      () => useAiCompose({ defaultTone: 'formal' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.compose({
        prompt: 'Write a formal email',
      });
    });

    expect(aiApi.composeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'formal',
      }),
    );
  });

  it('should handle API errors', async () => {
    const mockError = new Error('API Error');
    (aiApi.composeEmail as jest.Mock).mockRejectedValueOnce(mockError);

    const onError = jest.fn();
    const { result } = renderHook(() => useAiCompose({ onError }), {
      wrapper: createWrapper(),
    });

    let composeResult;
    await act(async () => {
      composeResult = await result.current.compose({
        prompt: 'Write an email',
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(composeResult).toBeUndefined();
    expect(result.current.error).toBeTruthy();
    expect(onError).toHaveBeenCalled();
  });

  it('should handle unsuccessful response', async () => {
    const mockResponse = {
      data: {
        success: false,
      },
    };
    (aiApi.composeEmail as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAiCompose(), {
      wrapper: createWrapper(),
    });

    let composeResult;
    await act(async () => {
      composeResult = await result.current.compose({
        prompt: 'Write an email',
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(composeResult).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });

  it('should set loading state during composition', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    (aiApi.composeEmail as jest.Mock).mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(() => useAiCompose(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isComposing).toBe(false);

    act(() => {
      result.current.compose({ prompt: 'Write an email' });
    });

    await waitFor(() => expect(result.current.isComposing).toBe(true));

    await act(async () => {
      resolvePromise!({ data: { success: true, body: 'Email' } });
    });

    await waitFor(() => expect(result.current.isComposing).toBe(false));
  });

  it('should reset state', async () => {
    const mockResponse = {
      data: {
        success: true,
        body: 'Email content',
      },
    };
    (aiApi.composeEmail as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAiCompose(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.compose({ prompt: 'Write an email' });
    });

    await waitFor(() => expect(result.current.result).not.toBeNull());

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
  });
});
