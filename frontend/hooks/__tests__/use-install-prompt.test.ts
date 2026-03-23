import { renderHook, act } from '@testing-library/react';

// Mock ua-parser-js before any imports
const mockGetOS = jest.fn().mockReturnValue({ name: 'Windows' });
jest.mock('ua-parser-js', () => {
  return jest.fn().mockImplementation(() => ({
    getOS: mockGetOS,
  }));
});

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

import { useInstallPrompt, _resetForTesting } from '@/hooks/use-install-prompt';

describe('useInstallPrompt', () => {
  // Provide a functional localStorage mock
  let store: Record<string, string> = {};
  const localStorageMock = localStorage as unknown as {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
    clear: jest.Mock;
  };

  beforeEach(() => {
    _resetForTesting();
    store = {};
    localStorageMock.getItem.mockImplementation((key: string) => store[key] ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => {
      store[key] = value;
    });
    localStorageMock.removeItem.mockImplementation((key: string) => {
      delete store[key];
    });
    localStorageMock.clear.mockImplementation(() => {
      store = {};
    });
    mockGetOS.mockReturnValue({ name: 'Windows' });
    mockStandaloneMatches = false;
    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    });
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
  });

  function fireBeforeInstallPrompt() {
    const event = new Event('beforeinstallprompt') as Event & {
      prompt: jest.Mock;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    (event as { prompt: jest.Mock }).prompt = jest
      .fn()
      .mockResolvedValue({ outcome: 'accepted' as const });
    (event as { userChoice: Promise<{ outcome: string }> }).userChoice =
      Promise.resolve({ outcome: 'accepted' as const });
    window.dispatchEvent(event);
    return event;
  }

  it('returns shouldShow=false when no beforeinstallprompt and not iOS', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.shouldShow).toBe(false);
    expect(result.current.isIOS).toBe(false);
  });

  it('returns shouldShow=true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.shouldShow).toBe(false);

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.shouldShow).toBe(true);
    expect(result.current.isIOS).toBe(false);
  });

  it('returns isIOS=true on iOS userAgent', () => {
    mockGetOS.mockReturnValue({ name: 'iOS' });
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isIOS).toBe(true);
    expect(result.current.shouldShow).toBe(true);
  });

  it('detects iPadOS via maxTouchPoints', () => {
    mockGetOS.mockReturnValue({ name: 'Mac OS' });
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isIOS).toBe(true);
    expect(result.current.shouldShow).toBe(true);
  });

  it('returns shouldShow=false in standalone mode (matchMedia)', () => {
    mockStandaloneMatches = true;
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.shouldShow).toBe(false);
  });

  it('returns shouldShow=false when navigator.standalone is true', () => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.shouldShow).toBe(false);
  });

  it('dismiss persists to localStorage', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });
    expect(result.current.shouldShow).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(localStorage.getItem('pmsync:install-prompt-dismissed')).toBeTruthy();
    expect(result.current.shouldShow).toBe(false);
  });

  it('dismiss expires after 30 days', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'pmsync:install-prompt-dismissed',
      thirtyOneDaysAgo.toString(),
    );
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.shouldShow).toBe(true);
  });

  it('appinstalled hides prompt', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });
    expect(result.current.shouldShow).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.shouldShow).toBe(false);
  });
});
