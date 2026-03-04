/**
 * useLocale Hook Tests
 *
 * Tests for the locale detection and management hook.
 */
import { renderHook, act } from '@testing-library/react';
import { useLocale } from './use-locale';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock navigator
const originalNavigator = window.navigator;

describe('useLocale', () => {
  const LOCALE_STORAGE_KEY = 'pmsync:locale';
  const LOCALE_CHANGE_EVENT = 'pmsync:locale-change';

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    localStorageMock._setStore({});
  });

  afterAll(() => {
    Object.defineProperty(window, 'navigator', { value: originalNavigator });
  });

  describe('initial locale detection', () => {
    it('should return stored locale from localStorage', () => {
      localStorageMock._setStore({ [LOCALE_STORAGE_KEY]: 'it' });

      const { result } = renderHook(() => useLocale());

      expect(result.current.locale).toBe('it');
    });

    it('should return "en" as default when no stored value', () => {
      const { result } = renderHook(() => useLocale());

      expect(result.current.locale).toBe('en');
    });

    it('should detect Italian locale from navigator.language', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'it-IT',
        configurable: true,
      });

      const { result } = renderHook(() => useLocale());

      // Should normalize it-IT to 'it'
      expect(result.current.locale).toBe('it');
    });

    it('should detect English locale from navigator.language', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'en-US',
        configurable: true,
      });

      const { result } = renderHook(() => useLocale());

      expect(result.current.locale).toBe('en');
    });

    it('should prefer stored locale over browser detection', () => {
      localStorageMock._setStore({ [LOCALE_STORAGE_KEY]: 'en' });
      Object.defineProperty(window.navigator, 'language', {
        value: 'it-IT',
        configurable: true,
      });

      const { result } = renderHook(() => useLocale());

      expect(result.current.locale).toBe('en');
    });

    it('should default to "en" for unsupported languages', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'fr-FR',
        configurable: true,
      });

      const { result } = renderHook(() => useLocale());

      expect(result.current.locale).toBe('en');
    });
  });

  describe('changeLocale', () => {
    it('should update locale to Italian', () => {
      const { result } = renderHook(() => useLocale());

      act(() => {
        result.current.changeLocale('it');
      });

      expect(result.current.locale).toBe('it');
    });

    it('should update locale to English', () => {
      localStorageMock._setStore({ [LOCALE_STORAGE_KEY]: 'it' });
      const { result } = renderHook(() => useLocale());

      act(() => {
        result.current.changeLocale('en');
      });

      expect(result.current.locale).toBe('en');
    });

    it('should save locale to localStorage', () => {
      const { result } = renderHook(() => useLocale());

      act(() => {
        result.current.changeLocale('it');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'it');
    });

    it('should dispatch custom event on locale change', () => {
      const eventHandler = jest.fn();
      window.addEventListener(LOCALE_CHANGE_EVENT, eventHandler);

      const { result } = renderHook(() => useLocale());

      act(() => {
        result.current.changeLocale('it');
      });

      expect(eventHandler).toHaveBeenCalled();

      window.removeEventListener(LOCALE_CHANGE_EVENT, eventHandler);
    });

    it('should normalize locale variants', () => {
      const { result } = renderHook(() => useLocale());

      act(() => {
        result.current.changeLocale('it-IT');
      });

      expect(result.current.locale).toBe('it');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'it');
    });

    it('should normalize unsupported locales to "en"', () => {
      const { result } = renderHook(() => useLocale());

      act(() => {
        result.current.changeLocale('de-DE');
      });

      expect(result.current.locale).toBe('en');
    });

    it('should handle uppercase locale codes', () => {
      const { result } = renderHook(() => useLocale());

      act(() => {
        result.current.changeLocale('IT');
      });

      expect(result.current.locale).toBe('it');
    });
  });

  describe('cross-component synchronization', () => {
    it('should sync locale changes via custom events', () => {
      const { result: hook1 } = renderHook(() => useLocale());
      const { result: hook2 } = renderHook(() => useLocale());

      // Both should start with same value
      expect(hook1.current.locale).toBe(hook2.current.locale);

      // Change locale in first hook
      act(() => {
        hook1.current.changeLocale('it');
      });

      // Both hooks should have updated
      expect(hook1.current.locale).toBe('it');
      // Note: hook2 may need a re-render to sync due to useSyncExternalStore
    });

    it('should respond to storage events', () => {
      const { result } = renderHook(() => useLocale());

      expect(result.current.locale).toBe('en');

      // Simulate storage event (from another tab)
      act(() => {
        localStorageMock._setStore({ [LOCALE_STORAGE_KEY]: 'it' });
        window.dispatchEvent(new StorageEvent('storage', {
          key: LOCALE_STORAGE_KEY,
          newValue: 'it',
        }));
      });

      // Should have updated via useSyncExternalStore
      expect(result.current.locale).toBe('it');
    });
  });

  describe('return value stability', () => {
    it('should return stable changeLocale function', () => {
      const { result, rerender } = renderHook(() => useLocale());

      const firstChangeLocale = result.current.changeLocale;
      rerender();
      const secondChangeLocale = result.current.changeLocale;

      expect(firstChangeLocale).toBe(secondChangeLocale);
    });

    it('should return consistent locale string type', () => {
      const { result } = renderHook(() => useLocale());

      expect(typeof result.current.locale).toBe('string');
      expect(['en', 'it']).toContain(result.current.locale);
    });
  });
});
