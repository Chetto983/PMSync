import { useLabelStore } from './label-store';
import type { Label } from '@/lib/api/labels';

jest.mock('@/lib/api/labels', () => ({
  labelsApi: {
    listLabels: jest.fn(),
    createLabel: jest.fn(),
    updateLabel: jest.fn(),
    deleteLabel: jest.fn(),
    reorderLabels: jest.fn(),
    addEmailsToLabel: jest.fn(),
    removeEmailFromLabel: jest.fn(),
  },
  hexToLabelColor: jest.fn((hex: string) => hex),
}));

jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Import mocked module after jest.mock declarations
import { labelsApi } from '@/lib/api/labels';

const makeLabel = (overrides: Partial<Label> = {}): Label => ({
  id: 'l1',
  tenantId: 't1',
  name: 'Work',
  color: 'BLUE',
  sortOrder: 0,
  createdAt: '2026-03-11T00:00:00Z',
  updatedAt: '2026-03-11T00:00:00Z',
  ...overrides,
} as Label);

beforeEach(() => {
  useLabelStore.setState({ labels: [], isLoading: false, error: null });
  jest.clearAllMocks();
});

describe('useLabelStore', () => {
  describe('fetchLabels', () => {
    it('sets labels and clears isLoading on success', async () => {
      (labelsApi.listLabels as jest.Mock).mockResolvedValue({
        labels: [makeLabel({ id: 'l1', name: 'Work' })],
      });
      await useLabelStore.getState().fetchLabels();
      expect(useLabelStore.getState().labels).toHaveLength(1);
      expect(useLabelStore.getState().isLoading).toBe(false);
    });

    it('sets error and clears isLoading on failure', async () => {
      (labelsApi.listLabels as jest.Mock).mockRejectedValue(new Error('network'));
      await expect(useLabelStore.getState().fetchLabels()).rejects.toThrow('network');
      expect(useLabelStore.getState().error).toBe('Failed to fetch labels');
      expect(useLabelStore.getState().isLoading).toBe(false);
    });
  });

  describe('createLabel', () => {
    it('appends new label to labels array', async () => {
      const newLabel = makeLabel({ id: 'l2', name: 'Personal', color: 'GREEN' });
      (labelsApi.createLabel as jest.Mock).mockResolvedValue({ label: newLabel });
      await useLabelStore.getState().createLabel('Personal', '#00ff00');
      expect(useLabelStore.getState().labels).toHaveLength(1);
      expect(useLabelStore.getState().labels[0].id).toBe('l2');
    });
  });

  describe('deleteLabel', () => {
    it('removes label by id', async () => {
      useLabelStore.setState({ labels: [makeLabel({ id: 'l1' })], isLoading: false, error: null });
      (labelsApi.deleteLabel as jest.Mock).mockResolvedValue(undefined);
      await useLabelStore.getState().deleteLabel('l1');
      expect(useLabelStore.getState().labels).toHaveLength(0);
    });
  });

  describe('reorderLabels', () => {
    it('applies optimistic update immediately', async () => {
      const l1 = makeLabel({ id: 'l1', name: 'Work' });
      const l2 = makeLabel({ id: 'l2', name: 'Personal' });
      useLabelStore.setState({ labels: [l1, l2], isLoading: false, error: null });

      // Use a promise that we control to check state before it resolves
      let resolve!: () => void;
      (labelsApi.reorderLabels as jest.Mock).mockReturnValue(new Promise<void>((res) => { resolve = res; }));

      const reorderPromise = useLabelStore.getState().reorderLabels(['l2', 'l1']);

      // Before API resolves, optimistic order should be applied
      expect(useLabelStore.getState().labels[0].id).toBe('l2');
      expect(useLabelStore.getState().labels[1].id).toBe('l1');

      resolve();
      await reorderPromise;

      // After resolving, order stays
      expect(useLabelStore.getState().labels[0].id).toBe('l2');
    });

    it('reverts to original order on API rejection and sets error', async () => {
      const l1 = makeLabel({ id: 'l1', name: 'Work' });
      const l2 = makeLabel({ id: 'l2', name: 'Personal' });
      useLabelStore.setState({ labels: [l1, l2], isLoading: false, error: null });
      (labelsApi.reorderLabels as jest.Mock).mockRejectedValue(new Error('server error'));

      await expect(useLabelStore.getState().reorderLabels(['l2', 'l1'])).rejects.toThrow('server error');

      // Labels should be reverted to original order
      expect(useLabelStore.getState().labels[0].id).toBe('l1');
      expect(useLabelStore.getState().labels[1].id).toBe('l2');
      expect(useLabelStore.getState().error).toBe('Failed to reorder labels');
    });
  });

  describe('handleLabelCreated', () => {
    it('appends a new label', () => {
      const label = makeLabel({ id: 'l1' });
      useLabelStore.getState().handleLabelCreated(label);
      expect(useLabelStore.getState().labels).toHaveLength(1);
    });

    it('does not create duplicates for existing id', () => {
      const label = makeLabel({ id: 'l1' });
      useLabelStore.getState().handleLabelCreated(label);
      useLabelStore.getState().handleLabelCreated(label);
      expect(useLabelStore.getState().labels).toHaveLength(1);
    });
  });

  describe('handleLabelDeleted', () => {
    it('removes label by id', () => {
      useLabelStore.setState({ labels: [makeLabel({ id: 'l1' })], isLoading: false, error: null });
      useLabelStore.getState().handleLabelDeleted('l1');
      expect(useLabelStore.getState().labels).toHaveLength(0);
    });
  });
});
