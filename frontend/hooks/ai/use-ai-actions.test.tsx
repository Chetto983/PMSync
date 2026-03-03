/**
 * Tests for useAiActions hook
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useAiActions, aiActionsKeys } from './use-ai-actions';
import { voltAgentApi } from '@/lib/api/ai';
import { websocketClient } from '@/lib/websocket-client';
import { useAuthStore } from '@/stores/auth-store';

// Mock the APIs
jest.mock('@/lib/api/ai', () => ({
  voltAgentApi: {
    getPendingActions: jest.fn(),
    approveAction: jest.fn(),
    rejectAction: jest.fn(),
  },
}));

jest.mock('@/lib/websocket-client', () => ({
  websocketClient: {
    isConnected: jest.fn(() => false),
    onAiActionCreated: jest.fn(() => () => {}),
    onAiActionApproved: jest.fn(() => () => {}),
    onAiActionRejected: jest.fn(() => () => {}),
    onAiActionExecuted: jest.fn(() => () => {}),
  },
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: jest.fn(() => ({ token: null })),
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

describe('useAiActions', () => {
  const mockPendingActions = [
    {
      id: 'action-1',
      executionId: 'exec-1',
      actionType: 'SEND_EMAIL',
      severity: 'MEDIUM',
      summary: 'Send follow-up email',
      payload: { to: 'john@example.com' },
      suspendReason: 'Requires approval',
      suspendedAt: '2025-01-01T00:00:00Z',
      userId: 'user-1',
      agentName: 'email-agent',
      status: 'PENDING',
    },
    {
      id: 'action-2',
      executionId: 'exec-2',
      actionType: 'SCHEDULE_MEETING',
      severity: 'LOW',
      summary: 'Schedule team meeting',
      payload: { date: '2025-01-15' },
      suspendReason: 'Requires approval',
      suspendedAt: '2025-01-02T00:00:00Z',
      userId: 'user-1',
      agentName: 'calendar-agent',
      status: 'PENDING',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as unknown as jest.Mock).mockReturnValue({ token: null });
    (websocketClient.isConnected as jest.Mock).mockReturnValue(false);
  });

  describe('aiActionsKeys', () => {
    it('should generate correct query keys', () => {
      expect(aiActionsKeys.all).toEqual(['aiActions']);
      expect(aiActionsKeys.pending()).toEqual(['aiActions', 'pending']);
      expect(aiActionsKeys.action('123')).toEqual(['aiActions', 'action', '123']);
      expect(aiActionsKeys.counts()).toEqual(['aiActions', 'counts']);
      expect(aiActionsKeys.learning()).toEqual(['aiActions', 'learning', undefined]);
      expect(aiActionsKeys.learning('user-1')).toEqual(['aiActions', 'learning', 'user-1']);
      // NOTE: aggregate key removed - endpoint doesn't exist on backend
    });
  });

  describe('pending actions', () => {
    it('should fetch pending actions on mount when autoFetch is true', async () => {
      (voltAgentApi.getPendingActions as jest.Mock).mockResolvedValueOnce({
        data: { actions: mockPendingActions, total: 2 },
      });
            // getActionCounts removed — no mock needed

      const { result } = renderHook(() => useAiActions({ autoFetch: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.pendingActions).toHaveLength(2);
      });

      expect(result.current.pendingCount).toBe(2);
      expect(voltAgentApi.getPendingActions).toHaveBeenCalled();
    });

    it('should not fetch when autoFetch is false', () => {
      const { result } = renderHook(() => useAiActions({ autoFetch: false }), {
        wrapper: createWrapper(),
      });

      expect(voltAgentApi.getPendingActions).not.toHaveBeenCalled();
      expect(result.current.pendingActions).toEqual([]);
    });
  });

  describe('getAction', () => {
    it('should find action by executionId', async () => {
      (voltAgentApi.getPendingActions as jest.Mock).mockResolvedValueOnce({
        data: { actions: mockPendingActions, total: 2 },
      });
            // getActionCounts removed — no mock needed

      const { result } = renderHook(() => useAiActions({ autoFetch: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.pendingActions).toHaveLength(2);
      });

      const action = result.current.getAction('exec-1');
      expect(action?.actionType).toBe('SEND_EMAIL');
    });

    it('should find action by id', async () => {
      (voltAgentApi.getPendingActions as jest.Mock).mockResolvedValueOnce({
        data: { actions: mockPendingActions, total: 2 },
      });
            // getActionCounts removed — no mock needed

      const { result } = renderHook(() => useAiActions({ autoFetch: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.pendingActions).toHaveLength(2);
      });

      const action = result.current.getAction('action-2');
      expect(action?.actionType).toBe('SCHEDULE_MEETING');
    });
  });

  // fetchAction tests removed — getPendingAction endpoint removed, fetchAction now uses cached list

  describe('approveAction', () => {
    it('should approve action successfully', async () => {
      (voltAgentApi.approveAction as jest.Mock).mockResolvedValueOnce({
        data: { status: 'approved' },
      });

      const onApprove = jest.fn();
      const { result } = renderHook(
        () => useAiActions({ autoFetch: false, onApprove }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.approveAction('exec-1');
      });

      expect(voltAgentApi.approveAction).toHaveBeenCalledWith('exec-1', undefined);
      expect(onApprove).toHaveBeenCalledWith('exec-1', undefined);
    });

    it('should handle approval error', async () => {
      const mockError = new Error('Approval failed');
      (voltAgentApi.approveAction as jest.Mock).mockRejectedValueOnce(mockError);

      const onError = jest.fn();
      const { result } = renderHook(
        () => useAiActions({ autoFetch: false, onError }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        try {
          await result.current.approveAction('exec-1');
        } catch {
          // Expected error
        }
      });

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('rejectAction', () => {
    it('should reject action successfully', async () => {
      (voltAgentApi.rejectAction as jest.Mock).mockResolvedValueOnce({
        data: { status: 'rejected' },
      });

      const onReject = jest.fn();
      const { result } = renderHook(
        () => useAiActions({ autoFetch: false, onReject }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.rejectAction('exec-1');
      });

      expect(voltAgentApi.rejectAction).toHaveBeenCalledWith('exec-1', undefined);
      expect(onReject).toHaveBeenCalledWith('exec-1');
    });

    it('should reject action with reason', async () => {
      (voltAgentApi.rejectAction as jest.Mock).mockResolvedValueOnce({
        data: { status: 'rejected' },
      });

      const { result } = renderHook(
        () => useAiActions({ autoFetch: false }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.rejectAction('exec-1', 'Not appropriate');
      });

      expect(voltAgentApi.rejectAction).toHaveBeenCalledWith('exec-1', 'Not appropriate');
    });
  });

  // action counts tests removed — getActionCounts endpoint removed

  // NOTE: learning stats tests removed - getLearningStats endpoint doesn't exist
  // NOTE: aggregate stats tests removed - getAggregateStats endpoint doesn't exist

  describe('loading states', () => {
    it('should track approving state', async () => {
      let resolveApprove: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolveApprove = resolve;
      });
      (voltAgentApi.approveAction as jest.Mock).mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useAiActions({ autoFetch: false }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isApproving).toBe(false);

      act(() => {
        result.current.approveAction('exec-1');
      });

      await waitFor(() => expect(result.current.isApproving).toBe(true));

      await act(async () => {
        resolveApprove!({ data: { status: 'approved' } });
      });

      await waitFor(() => expect(result.current.isApproving).toBe(false));
    });

    it('should track rejecting state', async () => {
      let resolveReject: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolveReject = resolve;
      });
      (voltAgentApi.rejectAction as jest.Mock).mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useAiActions({ autoFetch: false }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isRejecting).toBe(false);

      act(() => {
        result.current.rejectAction('exec-1');
      });

      await waitFor(() => expect(result.current.isRejecting).toBe(true));

      await act(async () => {
        resolveReject!({ data: { status: 'rejected' } });
      });

      await waitFor(() => expect(result.current.isRejecting).toBe(false));
    });
  });

  describe('WebSocket real-time updates', () => {
    it('should subscribe to WebSocket events when enabled', () => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({ token: 'test-token' });
      (websocketClient.isConnected as jest.Mock).mockReturnValue(true);

      renderHook(() => useAiActions({ autoFetch: false, enableRealtime: true }), {
        wrapper: createWrapper(),
      });

      expect(websocketClient.onAiActionCreated).toHaveBeenCalled();
      expect(websocketClient.onAiActionApproved).toHaveBeenCalled();
      expect(websocketClient.onAiActionRejected).toHaveBeenCalled();
      expect(websocketClient.onAiActionExecuted).toHaveBeenCalled();
    });

    it('should not subscribe when WebSocket is not connected', () => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({ token: 'test-token' });
      (websocketClient.isConnected as jest.Mock).mockReturnValue(false);

      renderHook(() => useAiActions({ autoFetch: false, enableRealtime: true }), {
        wrapper: createWrapper(),
      });

      expect(websocketClient.onAiActionCreated).not.toHaveBeenCalled();
    });

    it('should not subscribe when no token', () => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({ token: null });
      (websocketClient.isConnected as jest.Mock).mockReturnValue(true);

      renderHook(() => useAiActions({ autoFetch: false, enableRealtime: true }), {
        wrapper: createWrapper(),
      });

      expect(websocketClient.onAiActionCreated).not.toHaveBeenCalled();
    });

    it('should unsubscribe on cleanup', () => {
      const mockUnsubCreated = jest.fn();
      const mockUnsubApproved = jest.fn();
      const mockUnsubRejected = jest.fn();
      const mockUnsubExecuted = jest.fn();

      (useAuthStore as unknown as jest.Mock).mockReturnValue({ token: 'test-token' });
      (websocketClient.isConnected as jest.Mock).mockReturnValue(true);
      (websocketClient.onAiActionCreated as jest.Mock).mockReturnValue(mockUnsubCreated);
      (websocketClient.onAiActionApproved as jest.Mock).mockReturnValue(mockUnsubApproved);
      (websocketClient.onAiActionRejected as jest.Mock).mockReturnValue(mockUnsubRejected);
      (websocketClient.onAiActionExecuted as jest.Mock).mockReturnValue(mockUnsubExecuted);

      const { unmount } = renderHook(
        () => useAiActions({ autoFetch: false, enableRealtime: true }),
        { wrapper: createWrapper() },
      );

      unmount();

      expect(mockUnsubCreated).toHaveBeenCalled();
      expect(mockUnsubApproved).toHaveBeenCalled();
      expect(mockUnsubRejected).toHaveBeenCalled();
      expect(mockUnsubExecuted).toHaveBeenCalled();
    });
  });
});
