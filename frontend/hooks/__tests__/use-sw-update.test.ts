import { renderHook, act } from '@testing-library/react';

// Mock navigator.serviceWorker
let mockRegistration: {
  waiting: ServiceWorker | null;
  installing: ServiceWorker | null;
  addEventListener: jest.Mock;
  update: jest.Mock;
} | null = null;

const mockGetRegistration = jest.fn().mockImplementation(() => Promise.resolve(mockRegistration));

Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    getRegistration: mockGetRegistration,
    controller: {},
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  writable: true,
  configurable: true,
});

import { useSwUpdate, _resetForTesting } from '@/hooks/use-sw-update';

describe('useSwUpdate', () => {
  beforeEach(() => {
    _resetForTesting();
    mockRegistration = null;
    mockGetRegistration.mockClear();
    mockGetRegistration.mockImplementation(() => Promise.resolve(mockRegistration));
  });

  it('returns updateAvailable=false when no waiting SW', async () => {
    mockRegistration = {
      waiting: null,
      installing: null,
      addEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() => useSwUpdate());

    // Wait for async getRegistration
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(typeof result.current.activateUpdate).toBe('function');
  });

  it('returns updateAvailable=true when registration has waiting SW', async () => {
    const mockWaiting = {
      postMessage: jest.fn(),
      state: 'installed',
    } as unknown as ServiceWorker;

    mockRegistration = {
      waiting: mockWaiting,
      installing: null,
      addEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() => useSwUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it('activateUpdate posts SKIP_WAITING to waiting SW', async () => {
    const mockWaiting = {
      postMessage: jest.fn(),
      state: 'installed',
    } as unknown as ServiceWorker;

    mockRegistration = {
      waiting: mockWaiting,
      installing: null,
      addEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() => useSwUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.activateUpdate();
    });

    expect(mockWaiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('_resetForTesting clears state', async () => {
    const mockWaiting = {
      postMessage: jest.fn(),
      state: 'installed',
    } as unknown as ServiceWorker;

    mockRegistration = {
      waiting: mockWaiting,
      installing: null,
      addEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const { result, unmount } = renderHook(() => useSwUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.updateAvailable).toBe(true);

    unmount();
    _resetForTesting();

    // Re-render with no waiting SW
    mockRegistration = {
      waiting: null,
      installing: null,
      addEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const { result: result2 } = renderHook(() => useSwUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result2.current.updateAvailable).toBe(false);
  });

  it('triggers an explicit registration update check', async () => {
    const update = jest.fn().mockResolvedValue(undefined);

    mockRegistration = {
      waiting: null,
      installing: null,
      addEventListener: jest.fn(),
      update,
    };

    renderHook(() => useSwUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(update).toHaveBeenCalledTimes(1);
  });
});
