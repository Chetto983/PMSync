import { useEmailUIStore } from './email-ui-store';

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('useEmailUIStore', () => {
  describe('reset', () => {
    it('clears compose.isOpen after openCompose', () => {
      useEmailUIStore.getState().openCompose({ mode: 'new' });
      expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
      useEmailUIStore.getState().reset();
      expect(useEmailUIStore.getState().compose.isOpen).toBe(false);
    });

    it('clears selectedIds after selectEmail', () => {
      useEmailUIStore.getState().selectEmail('email-1');
      expect(useEmailUIStore.getState().selectedIds.size).toBe(1);
      useEmailUIStore.getState().reset();
      expect(useEmailUIStore.getState().selectedIds.size).toBe(0);
    });

    it('clears filters to initial state after setFolder', () => {
      useEmailUIStore.getState().setFolder('SENT');
      expect(useEmailUIStore.getState().filters.specialUse).toBe('SENT');
      useEmailUIStore.getState().reset();
      expect(useEmailUIStore.getState().filters.specialUse).toBe('INBOX');
    });
  });

  describe('addPendingAction', () => {
    it('adds emailId to pendingActions Set', () => {
      useEmailUIStore.getState().addPendingAction('email-1');
      expect(useEmailUIStore.getState().pendingActions.has('email-1')).toBe(true);
    });
  });

  describe('removePendingAction', () => {
    it('removes emailId from pendingActions Set', () => {
      useEmailUIStore.getState().addPendingAction('email-1');
      useEmailUIStore.getState().removePendingAction('email-1');
      expect(useEmailUIStore.getState().pendingActions.has('email-1')).toBe(false);
    });
  });
});
