import { useEmailUIStore } from '../email-ui-store';

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('kanban slice', () => {
  describe('setEmailKanbanColumn', () => {
    it('assigns a column to an email', () => {
      useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'to-reply');
      expect(useEmailUIStore.getState().kanbanAssignments['email-1']).toBe('to-reply');
    });
  });

  describe('getEmailColumn', () => {
    it('returns inbox as default for unmapped email', () => {
      expect(useEmailUIStore.getState().getEmailColumn('unknown-email')).toBe('inbox');
    });

    it('returns assigned column after setEmailKanbanColumn', () => {
      useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'following-up');
      expect(useEmailUIStore.getState().getEmailColumn('email-1')).toBe('following-up');
    });
  });

  describe('pruneKanbanAssignments', () => {
    it('removes entries whose ids are NOT in keepSet', () => {
      useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'to-reply');
      useEmailUIStore.getState().setEmailKanbanColumn('email-2', 'done');
      useEmailUIStore.getState().setEmailKanbanColumn('email-3', 'inbox');

      useEmailUIStore.getState().pruneKanbanAssignments(new Set(['email-1']));

      expect(useEmailUIStore.getState().kanbanAssignments['email-1']).toBe('to-reply');
      expect(useEmailUIStore.getState().kanbanAssignments['email-2']).toBeUndefined();
      expect(useEmailUIStore.getState().kanbanAssignments['email-3']).toBeUndefined();
    });

    it('results in empty assignments when keepSet is empty', () => {
      useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'to-reply');
      useEmailUIStore.getState().pruneKanbanAssignments(new Set());
      expect(Object.keys(useEmailUIStore.getState().kanbanAssignments)).toHaveLength(0);
    });
  });

  describe('moveEmailToColumn', () => {
    it('reassigns column for an email', () => {
      useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'to-reply');
      useEmailUIStore.getState().moveEmailToColumn('email-1', 'done');
      expect(useEmailUIStore.getState().kanbanAssignments['email-1']).toBe('done');
    });
  });

  describe('clearKanbanAssignments', () => {
    it('empties all assignments', () => {
      useEmailUIStore.getState().setEmailKanbanColumn('email-1', 'to-reply');
      useEmailUIStore.getState().clearKanbanAssignments();
      expect(Object.keys(useEmailUIStore.getState().kanbanAssignments)).toHaveLength(0);
    });
  });
});
