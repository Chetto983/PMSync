import { useEmailUIStore } from '../email-ui-store';

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('selection slice', () => {
  describe('selectEmail', () => {
    it('sets selectedIds as singleton Set', () => {
      useEmailUIStore.getState().selectEmail('e1');
      expect(useEmailUIStore.getState().selectedIds.has('e1')).toBe(true);
      expect(useEmailUIStore.getState().selectedIds.size).toBe(1);
    });

    it('sets activeEmailId', () => {
      useEmailUIStore.getState().selectEmail('e1');
      expect(useEmailUIStore.getState().activeEmailId).toBe('e1');
    });
  });

  describe('selectMultiple', () => {
    it('sets selectedIds with all provided ids', () => {
      useEmailUIStore.getState().selectMultiple(['e1', 'e2']);
      expect(useEmailUIStore.getState().selectedIds.has('e1')).toBe(true);
      expect(useEmailUIStore.getState().selectedIds.has('e2')).toBe(true);
      expect(useEmailUIStore.getState().selectedIds.size).toBe(2);
    });
  });

  describe('toggleSelection', () => {
    it('adds id when not selected', () => {
      useEmailUIStore.getState().toggleSelection('e1');
      expect(useEmailUIStore.getState().selectedIds.has('e1')).toBe(true);
    });

    it('removes id when already selected', () => {
      useEmailUIStore.getState().toggleSelection('e1');
      useEmailUIStore.getState().toggleSelection('e1');
      expect(useEmailUIStore.getState().selectedIds.has('e1')).toBe(false);
    });
  });

  describe('selectRange', () => {
    it('selects all emails in range', () => {
      const allIds = ['e1', 'e2', 'e3'];
      useEmailUIStore.getState().selectRange('e1', 'e3', allIds);
      expect(useEmailUIStore.getState().selectedIds.has('e1')).toBe(true);
      expect(useEmailUIStore.getState().selectedIds.has('e2')).toBe(true);
      expect(useEmailUIStore.getState().selectedIds.has('e3')).toBe(true);
    });

    it('works with reverse range (to before from)', () => {
      const allIds = ['e1', 'e2', 'e3'];
      useEmailUIStore.getState().selectRange('e3', 'e1', allIds);
      expect(useEmailUIStore.getState().selectedIds.size).toBe(3);
    });
  });

  describe('clearSelection', () => {
    it('empties selectedIds', () => {
      useEmailUIStore.getState().selectMultiple(['e1', 'e2']);
      useEmailUIStore.getState().clearSelection();
      expect(useEmailUIStore.getState().selectedIds.size).toBe(0);
    });

    it('sets lastSelectedId to null', () => {
      useEmailUIStore.getState().selectEmail('e1');
      useEmailUIStore.getState().clearSelection();
      expect(useEmailUIStore.getState().lastSelectedId).toBeNull();
    });
  });
});
