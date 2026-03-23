import { replayQueuedActions, _resetReplayLock } from './use-offline-actions';

// --- Mocks ---

const mockGetAllActions = jest.fn<Promise<import('@/lib/offline-action-queue').QueuedAction[]>, []>();
const mockRemoveAction = jest.fn<Promise<void>, [string]>();
const mockIsExpired = jest.fn<boolean, [import('@/lib/offline-action-queue').QueuedAction]>();

jest.mock('@/lib/offline-action-queue', () => ({
  getAllActions: (...args: unknown[]) => mockGetAllActions(...(args as [])),
  removeAction: (...args: unknown[]) => mockRemoveAction(...(args as [string])),
  isExpired: (...args: unknown[]) => mockIsExpired(...(args as [import('@/lib/offline-action-queue').QueuedAction])),
}));

const mockUpdateEmail = jest.fn<Promise<unknown>, [string, unknown]>();
jest.mock('@/lib/api/emails', () => ({
  emailsApi: {
    updateEmail: (...args: unknown[]) => mockUpdateEmail(...(args as [string, unknown])),
  },
}));

const mockToast = {
  success: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};
const mockTranslations = {
  offlineQueue: {
    expiredActions: '{count} offline action(s) expired and were discarded.',
    replayStarted: 'Syncing {count} queued action(s)...',
    replaySuccess: '{count} offline action(s) synced successfully.',
    replayPartialFailure: 'Some actions could not be synced. They will retry on next connection.',
    pendingActions: '{count} pending action(s)',
    queueFull: 'Offline action limit reached.',
  },
};

jest.mock('@/lib/context/toast-context', () => ({
  getGlobalToast: () => mockToast,
  getGlobalTranslations: () => mockTranslations,
}));

const mockInvalidateQueries = jest.fn<Promise<void>, [unknown]>();
jest.mock('@/lib/query-client', () => ({
  getQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...(args as [unknown])),
  }),
}));

jest.mock('@/hooks/queries/email-keys', () => ({
  emailKeys: {
    list: () => ['emails', 'list'],
    stats: () => ['emails', 'stats'],
  },
}));

jest.mock('@/hooks/queries/use-folders', () => ({
  folderKeys: {
    list: () => ['folders', 'list'],
  },
}));

jest.mock('@/hooks/queries/use-labels', () => ({
  labelKeys: {
    list: () => ['labels', 'list'],
  },
}));

const mockSetPendingCount = jest.fn();
jest.mock('@/stores/offline-queue-store', () => ({
  useOfflineQueueStore: {
    getState: () => ({
      setPendingCount: mockSetPendingCount,
    }),
  },
}));

// --- Helpers ---

function makeAction(
  overrides: Partial<import('@/lib/offline-action-queue').QueuedAction> = {},
): import('@/lib/offline-action-queue').QueuedAction {
  return {
    id: overrides.id ?? 'action-1',
    type: 'update-email',
    emailId: overrides.emailId ?? 'email-1',
    dto: overrides.dto ?? { isRead: true },
    queuedAt: overrides.queuedAt ?? Date.now(),
  };
}

// --- Tests ---

describe('replayQueuedActions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    _resetReplayLock();
    mockIsExpired.mockReturnValue(false);
    // Default: getAllActions returns empty after replay (all removed)
    mockGetAllActions.mockResolvedValue([]);
    mockUpdateEmail.mockResolvedValue({});
    mockRemoveAction.mockResolvedValue(undefined);
  });

  it('does nothing with empty queue', async () => {
    mockGetAllActions.mockResolvedValueOnce([]);

    await replayQueuedActions();

    expect(mockUpdateEmail).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it('replays valid actions sequentially via emailsApi.updateEmail', async () => {
    const a1 = makeAction({ id: 'a1', emailId: 'e1', dto: { isRead: true } });
    const a2 = makeAction({ id: 'a2', emailId: 'e2', dto: { isStarred: true } });

    mockGetAllActions
      .mockResolvedValueOnce([a1, a2]) // initial call
      .mockResolvedValueOnce([]); // after replay

    await replayQueuedActions();

    expect(mockUpdateEmail).toHaveBeenCalledTimes(2);
    expect(mockUpdateEmail).toHaveBeenNthCalledWith(1, 'e1', { isRead: true });
    expect(mockUpdateEmail).toHaveBeenNthCalledWith(2, 'e2', { isStarred: true });
    expect(mockRemoveAction).toHaveBeenCalledWith('a1');
    expect(mockRemoveAction).toHaveBeenCalledWith('a2');
  });

  it('discards expired actions and shows warning toast with count', async () => {
    const expired1 = makeAction({ id: 'exp1' });
    const expired2 = makeAction({ id: 'exp2' });

    mockIsExpired.mockReturnValue(true);
    mockGetAllActions
      .mockResolvedValueOnce([expired1, expired2])
      .mockResolvedValueOnce([]);

    await replayQueuedActions();

    expect(mockRemoveAction).toHaveBeenCalledWith('exp1');
    expect(mockRemoveAction).toHaveBeenCalledWith('exp2');
    expect(mockToast.warning).toHaveBeenCalledWith(
      '2 offline action(s) expired and were discarded.',
    );
    // No replay should happen
    expect(mockUpdateEmail).not.toHaveBeenCalled();
    expect(mockSetPendingCount).toHaveBeenCalledWith(0);
  });

  it('shows success toast with count after all actions replay', async () => {
    const a1 = makeAction({ id: 'a1' });
    mockGetAllActions
      .mockResolvedValueOnce([a1])
      .mockResolvedValueOnce([]);

    await replayQueuedActions();

    expect(mockToast.info).toHaveBeenCalledWith('Syncing 1 queued action(s)...');
    expect(mockToast.success).toHaveBeenCalledWith(
      '1 offline action(s) synced successfully.',
    );
  });

  it('stops on first failure and shows partial failure toast', async () => {
    const a1 = makeAction({ id: 'a1', emailId: 'e1' });
    const a2 = makeAction({ id: 'a2', emailId: 'e2' });

    mockGetAllActions
      .mockResolvedValueOnce([a1, a2])
      .mockResolvedValueOnce([a2]); // a2 remains

    mockUpdateEmail
      .mockResolvedValueOnce({}) // a1 succeeds
      .mockRejectedValueOnce(new Error('Network error')); // a2 fails

    await replayQueuedActions();

    expect(mockUpdateEmail).toHaveBeenCalledTimes(2);
    expect(mockRemoveAction).toHaveBeenCalledWith('a1');
    // a2 not removed because it failed
    expect(mockRemoveAction).not.toHaveBeenCalledWith('a2');
    expect(mockToast.warning).toHaveBeenCalledWith(
      'Some actions could not be synced. They will retry on next connection.',
    );
    expect(mockSetPendingCount).toHaveBeenCalledWith(1);
  });

  it('invalidates email queries after replay', async () => {
    const a1 = makeAction({ id: 'a1' });
    mockGetAllActions
      .mockResolvedValueOnce([a1])
      .mockResolvedValueOnce([]);

    await replayQueuedActions();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['emails', 'list'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['emails', 'stats'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['folders', 'list'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['labels', 'list'] });
  });

  it('replay lock prevents concurrent execution', async () => {
    const a1 = makeAction({ id: 'a1' });
    let resolveFirst: () => void;
    const firstCallPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    mockGetAllActions.mockResolvedValueOnce([a1]).mockResolvedValue([]);

    // Make updateEmail slow so we can call replayQueuedActions again while first is running
    mockUpdateEmail.mockImplementationOnce(() =>
      firstCallPromise.then(() => ({})),
    );

    const first = replayQueuedActions();
    const second = replayQueuedActions(); // should be no-op due to lock

    resolveFirst!();
    await first;
    await second;

    // updateEmail called only once (from first call)
    expect(mockUpdateEmail).toHaveBeenCalledTimes(1);
  });

  it('handles mixed expired + valid: expired discarded, valid replayed', async () => {
    const expired = makeAction({ id: 'exp1', emailId: 'e-expired' });
    const valid = makeAction({ id: 'v1', emailId: 'e-valid', dto: { isRead: false } });

    mockIsExpired
      .mockImplementation((action) => action.id === 'exp1');

    mockGetAllActions
      .mockResolvedValueOnce([expired, valid])
      .mockResolvedValueOnce([]);

    await replayQueuedActions();

    // Expired removed
    expect(mockRemoveAction).toHaveBeenCalledWith('exp1');
    expect(mockToast.warning).toHaveBeenCalledWith(
      '1 offline action(s) expired and were discarded.',
    );
    // Valid replayed
    expect(mockUpdateEmail).toHaveBeenCalledWith('e-valid', { isRead: false });
    expect(mockRemoveAction).toHaveBeenCalledWith('v1');
    expect(mockToast.success).toHaveBeenCalledWith(
      '1 offline action(s) synced successfully.',
    );
  });

  it('updates Zustand store pendingCount after replay', async () => {
    const a1 = makeAction({ id: 'a1' });
    mockGetAllActions
      .mockResolvedValueOnce([a1])
      .mockResolvedValueOnce([]); // 0 remaining

    await replayQueuedActions();

    expect(mockSetPendingCount).toHaveBeenCalledWith(0);
  });
});
