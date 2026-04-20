import {
  clearLastActiveThreadId,
  getLastActiveThreadId,
  markManualNewThreadRequested,
  rememberLastActiveThreadId,
  resetManualNewThreadRequested,
  shouldSkipInitialThreadRestore,
} from './thread-restore-guard';

describe('thread-restore-guard', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>,
    });
  });

  afterEach(() => {
    resetManualNewThreadRequested();
    clearLastActiveThreadId();
  });

  it('skips the initial restore shortly after an explicit new chat request', () => {
    markManualNewThreadRequested(1_000);

    expect(shouldSkipInitialThreadRestore(1_500)).toBe(true);
  });

  it('expires the guard after the grace window', () => {
    markManualNewThreadRequested(1_000);

    expect(shouldSkipInitialThreadRestore(17_000)).toBe(false);
  });

  it('persists the last active real thread id', () => {
    rememberLastActiveThreadId('conv-123');

    expect(getLastActiveThreadId()).toBe('conv-123');
  });
});
