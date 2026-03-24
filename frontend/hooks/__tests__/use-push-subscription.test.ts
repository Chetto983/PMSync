// Mock pushApi before imports
const mockSubscribe = jest.fn().mockResolvedValue({});
const mockUnsubscribe = jest.fn().mockResolvedValue({});
jest.mock('@/lib/api/push', () => ({
  pushApi: {
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  },
}));

// Mock matchMedia
let mockStandaloneMatches = false;
const originalMatchMedia = window.matchMedia;
window.matchMedia = jest.fn().mockImplementation((query: string) => {
  if (query === '(display-mode: standalone)') {
    return {
      matches: mockStandaloneMatches,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  }
  return originalMatchMedia(query);
});

import { renderHook, act } from '@testing-library/react';
import {
  usePushSubscription,
  _resetForTesting,
  getServerSnapshot as _getServerSnapshot,
} from '@/hooks/use-push-subscription';

// Mock PushSubscription instance
function createMockPushSubscription(endpoint = 'https://push.example.com/sub1') {
  return {
    endpoint,
    unsubscribe: jest.fn().mockResolvedValue(true),
    toJSON: () => ({
      endpoint,
      keys: {
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-key',
      },
    }),
  };
}

describe('usePushSubscription', () => {
  let mockGetSubscription: jest.Mock;
  let mockPushManagerSubscribe: jest.Mock;

  beforeEach(() => {
    _resetForTesting();
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    mockStandaloneMatches = false;
    mockGetSubscription = jest.fn().mockResolvedValue(null);
    mockPushManagerSubscribe = jest.fn();

    // Default: no PushManager, no Notification
    delete (window as unknown as Record<string, unknown>).PushManager;
    delete (window as unknown as Record<string, unknown>).Notification;

    // Default navigator properties
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      writable: true,
      configurable: true,
    });

    // Mock serviceWorker.ready
    const mockRegistration = {
      pushManager: {
        getSubscription: mockGetSubscription,
        subscribe: mockPushManagerSubscribe,
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve(mockRegistration) },
      writable: true,
      configurable: true,
    });
  });

  it('getServerSnapshot returns safe defaults', () => {
    const snapshot = _getServerSnapshot();
    expect(snapshot).toEqual({
      isSupported: false,
      isSubscribed: false,
      permission: 'default',
    });
  });

  it('returns isSupported=false when PushManager is not in window', () => {
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.isSupported).toBe(false);
  });

  it('returns isSupported=true when PushManager and Notification are present', () => {
    (window as unknown as Record<string, unknown>).PushManager = jest.fn();
    (window as unknown as Record<string, unknown>).Notification = Object.assign(
      jest.fn(),
      { permission: 'default' as NotificationPermission },
    );

    _resetForTesting();
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.isSupported).toBe(true);
  });

  it('returns isSupported=false on iOS Safari (non-standalone) even with PushManager', () => {
    (window as unknown as Record<string, unknown>).PushManager = jest.fn();
    (window as unknown as Record<string, unknown>).Notification = Object.assign(
      jest.fn(),
      { permission: 'default' as NotificationPermission },
    );

    // Simulate iOS
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) Safari/604.1',
      writable: true,
      configurable: true,
    });
    mockStandaloneMatches = false;

    _resetForTesting();
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.isSupported).toBe(false);
  });

  it('subscribeToPush calls Notification.requestPermission, PushManager.subscribe, then pushApi.subscribe', async () => {
    const mockSub = createMockPushSubscription();
    mockPushManagerSubscribe.mockResolvedValue(mockSub);

    (window as unknown as Record<string, unknown>).PushManager = jest.fn();
    (window as unknown as Record<string, unknown>).Notification = Object.assign(
      jest.fn(),
      {
        permission: 'default' as NotificationPermission,
        requestPermission: jest.fn().mockResolvedValue('granted'),
      },
    );

    _resetForTesting();
    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await result.current.subscribeToPush();
    });

    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(mockPushManagerSubscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_KEY,
    });
    expect(mockSubscribe).toHaveBeenCalledWith({
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' },
    });
    expect(result.current.isSubscribed).toBe(true);
  });

  it('unsubscribeFromPush calls PushSubscription.unsubscribe then pushApi.unsubscribe', async () => {
    const mockSub = createMockPushSubscription();
    mockPushManagerSubscribe.mockResolvedValue(mockSub);

    (window as unknown as Record<string, unknown>).PushManager = jest.fn();
    (window as unknown as Record<string, unknown>).Notification = Object.assign(
      jest.fn(),
      {
        permission: 'default' as NotificationPermission,
        requestPermission: jest.fn().mockResolvedValue('granted'),
      },
    );

    _resetForTesting();
    const { result } = renderHook(() => usePushSubscription());

    // First subscribe
    await act(async () => {
      await result.current.subscribeToPush();
    });
    expect(result.current.isSubscribed).toBe(true);

    // Then unsubscribe
    await act(async () => {
      await result.current.unsubscribeFromPush();
    });

    expect(mockSub.unsubscribe).toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalledWith('https://push.example.com/sub1');
    expect(result.current.isSubscribed).toBe(false);
  });

  it('_resetForTesting clears module state', async () => {
    const mockSub = createMockPushSubscription();
    mockPushManagerSubscribe.mockResolvedValue(mockSub);

    (window as unknown as Record<string, unknown>).PushManager = jest.fn();
    (window as unknown as Record<string, unknown>).Notification = Object.assign(
      jest.fn(),
      {
        permission: 'default' as NotificationPermission,
        requestPermission: jest.fn().mockResolvedValue('granted'),
      },
    );

    _resetForTesting();
    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await result.current.subscribeToPush();
    });
    expect(result.current.isSubscribed).toBe(true);

    act(() => {
      _resetForTesting();
    });

    const { result: result2 } = renderHook(() => usePushSubscription());
    expect(result2.current.isSubscribed).toBe(false);
  });
});
