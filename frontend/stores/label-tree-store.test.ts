import { useLabelTreeStore } from './label-tree-store';
import type { Label } from '@/lib/api/labels';

const makeLabel = (id: string, parentId?: string): Label => ({
  id,
  tenantId: 't1',
  name: id,
  slug: id,
  type: 'USER',
  color: null,
  icon: null,
  parentId: parentId ?? null,
  level: 0,
  orderIndex: 0,
  isArchived: false,
  aiPrompt: null,
  category: 'custom',
  roles: [],
  contents: [],
  actionType: 'none',
  suppressUrgency: false,
  mutuallyExclusiveWith: [],
  defaultLane: null,
  createdAt: '2026-03-11T00:00:00Z',
  updatedAt: '2026-03-11T00:00:00Z',
});

beforeEach(() => {
  useLabelTreeStore.setState({ expandedIds: new Set<string>() });
});

describe('useLabelTreeStore', () => {
  describe('toggleExpanded', () => {
    it('adds id to expandedIds', () => {
      useLabelTreeStore.getState().toggleExpanded('l1');
      expect(useLabelTreeStore.getState().expandedIds.has('l1')).toBe(true);
    });

    it('removes already-expanded id', () => {
      useLabelTreeStore.getState().toggleExpanded('l1');
      useLabelTreeStore.getState().toggleExpanded('l1');
      expect(useLabelTreeStore.getState().expandedIds.has('l1')).toBe(false);
    });
  });

  describe('expandAll', () => {
    it('sets expandedIds to all provided ids', () => {
      useLabelTreeStore.getState().expandAll(['l1', 'l2', 'l3']);
      expect(useLabelTreeStore.getState().expandedIds.size).toBe(3);
      expect(useLabelTreeStore.getState().expandedIds.has('l2')).toBe(true);
    });
  });

  describe('collapseAll', () => {
    it('clears expandedIds', () => {
      useLabelTreeStore.getState().expandAll(['l1', 'l2']);
      useLabelTreeStore.getState().collapseAll();
      expect(useLabelTreeStore.getState().expandedIds.size).toBe(0);
    });
  });

  describe('pruneStaleIds', () => {
    it('removes ids not in validIds Set', () => {
      useLabelTreeStore.getState().expandAll(['l1', 'l2', 'l3']);
      useLabelTreeStore.getState().pruneStaleIds(new Set(['l1']));
      expect(useLabelTreeStore.getState().expandedIds.has('l1')).toBe(true);
      expect(useLabelTreeStore.getState().expandedIds.has('l2')).toBe(false);
      expect(useLabelTreeStore.getState().expandedIds.has('l3')).toBe(false);
    });
  });

  describe('expandTo', () => {
    it('walks parentId chain and expands all ancestors', () => {
      // l3 -> l2 -> l1 (root)
      const allLabels = [
        makeLabel('l1'),
        makeLabel('l2', 'l1'),
        makeLabel('l3', 'l2'),
      ];
      useLabelTreeStore.getState().expandTo('l3', allLabels);
      // l2 is parent of l3, l1 is parent of l2
      expect(useLabelTreeStore.getState().expandedIds.has('l2')).toBe(true);
      expect(useLabelTreeStore.getState().expandedIds.has('l1')).toBe(true);
    });

    it('does nothing if target has no parent', () => {
      const allLabels = [makeLabel('l1')];
      useLabelTreeStore.getState().expandTo('l1', allLabels);
      expect(useLabelTreeStore.getState().expandedIds.size).toBe(0);
    });
  });
});
